import { supabase } from "@/lib/supabase";
import { adminFetch } from "@/lib/admin-fetch";
import { ActiveMission, associateMissionsToUserByPhone, backfillMissionUserIdByPhone } from "@/lib/missions";

const CUSTOMER_SESSION_KEY = "orbi_customer_session";

// ── Session cache (localStorage only — Supabase Auth is source of truth) ──────

export type CustomerSession = {
  name: string;
  phone: string;
  email?: string;
};

export function getCurrentCustomerSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerSession;
    if (!parsed.name || !parsed.phone) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCustomerSession(name: string, phone: string, email?: string): void {
  if (typeof window === "undefined") return;
  const session: CustomerSession = { name: name.trim(), phone: normalizePhone(phone) };
  if (email?.trim()) session.email = email.trim();
  window.localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
}

export function clearCustomerSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CUSTOMER_SESSION_KEY);
}

// ── Supabase Auth — register ───────────────────────────────────────────────────

export async function registerCustomerAccount({
  name,
  phone,
  email,
  password,
}: {
  name: string;
  phone: string;
  email: string;
  password: string;
}) {
  const normalizedPhone = normalizePhone(phone);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone: normalizedPhone } },
  });

  if (error) throw new Error(getAuthErrorMessage(error.message));

  const userId = data.user?.id;
  if (!userId) throw new Error("No pudimos crear la cuenta. Intenta de nuevo.");

  await callUpsertAPI({
    name: name.trim(),
    phone: normalizedPhone,
    email: email.trim(),
    is_registered: true,
    auth_user_id: userId,
  });

  associateMissionsToUserByPhone(normalizedPhone, userId);
  return { name, phone: normalizedPhone, email };
}

// ── Supabase Auth — login ─────────────────────────────────────────────────────

export async function loginCustomerWithSupabase(
  identifier: string,
  password: string
): Promise<CustomerSession> {
  const norm = identifier.trim();
  let email = norm;

  // If identifier looks like a phone, look up the email in public.customers
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) {
    const { data } = await supabase
      .from("customers")
      .select("email")
      .eq("phone", normalizePhone(norm))
      .maybeSingle();
    if (!data?.email) {
      throw new Error("No encontramos una cuenta con ese número. Regístrate primero.");
    }
    email = data.email as string;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error("Datos incorrectos. Verifica tu correo/WhatsApp y contraseña.");
  }

  const customer = await getCustomerByAuthUserId(data.user.id);
  const resolvedPhone = customer?.phone
    ?? normalizePhone((data.user.user_metadata as { phone?: string } | undefined)?.phone ?? "");

  // Backfill: link any existing phone-only missions to this auth user, then update localStorage.
  if (resolvedPhone) {
    void backfillMissionUserIdByPhone(resolvedPhone, data.user.id);
    associateMissionsToUserByPhone(resolvedPhone, data.user.id);
  }

  if (customer) {
    return { name: customer.name, phone: customer.phone, email: customer.email };
  }

  // Fallback: build session from Auth user metadata
  const meta = data.user.user_metadata as { name?: string; phone?: string } | undefined;
  return {
    name: meta?.name ?? email,
    phone: resolvedPhone,
    email,
  };
}

// ── Supabase lookup ───────────────────────────────────────────────────────────

export async function getCustomerByAuthUserId(
  authUserId: string
): Promise<OrbiCustomer | null> {
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMERS_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return mapCustomerRow(data as unknown as CustomerRow);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrbiCustomer = {
  id: string;
  userId?: string;
  authUserId?: string | null;
  name: string;
  phone: string;
  email?: string;
  isRegistered: boolean;
  createdAt: string;
  updatedAt: string;
  lastOrderAt: string;
  totalOrders: number;
  totalSpent: number;
  registeredAt?: string;
  preferredAddress?: string;
  notes?: string;
  customerStatus?: string;
};

type CustomerRow = {
  id: string;
  user_id?: string | null;
  auth_id?: string | null;
  auth_user_id?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  is_registered?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_order_at?: string | null;
  total_orders?: number | string | null;
  total_spent?: number | string | null;
  registered_at?: string | null;
  preferred_address?: string | null;
  notes?: string | null;
  status?: string | null;
};

const CUSTOMERS_SELECT =
  "id,user_id,auth_id,auth_user_id,name,phone,email,is_registered,created_at,updated_at," +
  "last_order_at,total_orders,total_spent,registered_at,preferred_address,notes,status";

// ── Supabase writes — all go through /api/customers/upsert ────────────────────

async function callUpsertAPI(payload: {
  name: string;
  phone: string;
  email?: string | null;
  is_registered: boolean;
  auth_user_id?: string;
}): Promise<void> {
  try {
    const res = await fetch("/api/customers/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[customers] upsert API error:", res.status, body);
    }
  } catch (err) {
    console.error("[customers] upsert API exception:", err);
  }
}

export async function upsertGuestCustomerFromMission(mission: ActiveMission) {
  const phone = normalizePhone(mission.requester_phone ?? "");
  if (!phone || !mission.requester_name?.trim()) return;

  await callUpsertAPI({
    name: mission.requester_name.trim(),
    phone,
    email: null,
    is_registered: false,
  });
}

export async function syncRegisteredCustomerToSupabase(
  name: string,
  phone: string,
  email?: string
): Promise<void> {
  await callUpsertAPI({
    name: name.trim(),
    phone,
    email: email?.trim() || null,
    is_registered: true,
  });
}

// ── Supabase reads (admin API — SELECT) ───────────────────────────────────────

export type CustomerPageFilters = {
  page?: number;
  search?: string;
  isRegistered?: boolean | null;
  status?: string;
};

export type CustomerStats = {
  total: number;
  registered: number;
  totalOrders: number;
  totalSpent: number;
};

export async function fetchCustomerStats(): Promise<CustomerStats> {
  try {
    const res = await adminFetch("/api/customers/list?stats=1");
    if (!res.ok) return { total: 0, registered: 0, totalOrders: 0, totalSpent: 0 };
    return (await res.json()) as CustomerStats;
  } catch {
    return { total: 0, registered: 0, totalOrders: 0, totalSpent: 0 };
  }
}

export async function fetchCustomersPage(
  filters: CustomerPageFilters = {}
): Promise<{ customers: OrbiCustomer[]; hasMore: boolean; total: number }> {
  const { page = 0, search, isRegistered, status } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (search?.trim()) params.set("search", search.trim());
  if (isRegistered !== null && isRegistered !== undefined)
    params.set("registered", String(isRegistered));
  if (status && status !== "todos") params.set("status", status);

  try {
    const res = await adminFetch(`/api/customers/list?${params.toString()}`);
    if (!res.ok) return { customers: [], hasMore: false, total: 0 };
    const body = (await res.json()) as {
      customers: CustomerRow[];
      total: number;
      hasMore: boolean;
    };
    return {
      customers: (body.customers ?? []).map(mapCustomerRow),
      total: body.total,
      hasMore: body.hasMore,
    };
  } catch {
    return { customers: [], hasMore: false, total: 0 };
  }
}

export async function getCustomers(): Promise<OrbiCustomer[]> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select(CUSTOMERS_SELECT)
      .order("updated_at", { ascending: false });

    if (!error && data) {
      return (data as unknown as CustomerRow[]).map(mapCustomerRow);
    }
  } catch {
    // fall through
  }
  return [];
}

export async function isCustomerRegistered(phone: string): Promise<boolean> {
  const normalizedPhone = normalizePhone(phone);
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("is_registered")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    if (!error && data) return Boolean((data as { is_registered: boolean | null }).is_registered);
  } catch {
    // fall through
  }
  return false;
}

// ── Mapping & utils ───────────────────────────────────────────────────────────

function mapCustomerRow(row: CustomerRow): OrbiCustomer {
  const now = new Date().toISOString();
  return {
    id: row.id,
    userId: row.user_id ?? row.auth_id ?? undefined,
    authUserId: row.auth_user_id ?? null,
    name: row.name ?? "",
    phone: normalizePhone(row.phone ?? ""),
    email: row.email ?? undefined,
    isRegistered: Boolean(row.is_registered),
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
    lastOrderAt: row.last_order_at ?? row.updated_at ?? now,
    totalOrders: Number(row.total_orders ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    registeredAt: row.registered_at ?? undefined,
    preferredAddress: row.preferred_address ?? undefined,
    notes: row.notes ?? undefined,
    customerStatus: row.status ?? "activo",
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function getAuthErrorMessage(message: string) {
  if (/already|registered|exists/i.test(message)) {
    return "Ese correo ya está registrado. Inicia sesión o usa otro correo.";
  }
  return message || "No fue posible crear la cuenta.";
}
