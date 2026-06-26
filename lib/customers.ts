import { supabase } from "@/lib/supabase";
import { ActiveMission, associateMissionsToUserByPhone } from "@/lib/missions";

const CUSTOMERS_KEY = "orbi_customers";
const CUSTOMER_SESSION_KEY = "orbi_customer_session";
const CUSTOMER_PASSWORDS_KEY = "orbi_customer_passwords"; // MVP only — not for production

// ── Session ───────────────────────────────────────────────────────────────────

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

// ── Local account (MVP auth — localStorage only) ──────────────────────────────

export function saveLocalCustomerAccount(
  name: string,
  phone: string,
  email: string,
  password: string
): void {
  if (typeof window === "undefined") return;
  const normalizedPhone = normalizePhone(phone);
  const now = new Date().toISOString();
  const customer: OrbiCustomer = {
    id: `local_${normalizedPhone}`,
    name: name.trim(),
    phone: normalizedPhone,
    email: email.trim(),
    isRegistered: true,
    createdAt: now,
    updatedAt: now,
    lastOrderAt: now,
    totalOrders: 0,
    totalSpent: 0,
  };
  const customers = readLocalCustomers();
  const next = [customer, ...customers.filter((c) => c.phone !== normalizedPhone)];
  window.localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(next));
  const passwords: Record<string, string> = readLocalPasswords();
  passwords[normalizedPhone] = password;
  window.localStorage.setItem(CUSTOMER_PASSWORDS_KEY, JSON.stringify(passwords));
}

export function loginWithCredential(
  identifier: string,
  password: string
): OrbiCustomer | null {
  if (typeof window === "undefined") return null;
  const customers = readLocalCustomers();
  const customer = customers.find((c) => {
    const matchPhone = c.phone === normalizePhone(identifier);
    const matchEmail = (c.email ?? "").toLowerCase() === identifier.trim().toLowerCase();
    return matchPhone || matchEmail;
  });
  if (!customer) return null;
  const passwords = readLocalPasswords();
  const stored = passwords[customer.phone];
  if (!stored || stored !== password) return null;
  return customer;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrbiCustomer = {
  id: string;
  userId?: string;
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
  "id,user_id,auth_id,name,phone,email,is_registered,created_at,updated_at," +
  "last_order_at,total_orders,total_spent,registered_at,preferred_address,notes,status";

// ── Supabase writes — all go through /api/customers/upsert ────────────────────

async function callUpsertAPI(payload: {
  name: string;
  phone: string;
  email?: string | null;
  is_registered: boolean;
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
  });

  associateMissionsToUserByPhone(normalizedPhone, userId);
  return { name, phone: normalizedPhone, email };
}

// ── Supabase reads (anon key — SELECT) ────────────────────────────────────────

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

const CUSTOMERS_PAGE_SIZE = 25;

export async function fetchCustomerStats(): Promise<CustomerStats> {
  try {
    const res = await fetch("/api/customers/list?stats=1");
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
    const res = await fetch(`/api/customers/list?${params.toString()}`);
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
  return readLocalCustomers();
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
  return readLocalCustomers().some((c) => c.phone === normalizedPhone && c.isRegistered);
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function readLocalCustomers(): OrbiCustomer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOMERS_KEY) ?? "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrbiCustomer[]) : [];
  } catch {
    return [];
  }
}

function readLocalPasswords(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CUSTOMER_PASSWORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// ── Mapping & utils ───────────────────────────────────────────────────────────

function mapCustomerRow(row: CustomerRow): OrbiCustomer {
  const now = new Date().toISOString();
  return {
    id: row.id,
    userId: row.user_id ?? row.auth_id ?? undefined,
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
