import { supabase } from "@/lib/supabase";
import { ActiveMission, associateMissionsToUserByPhone } from "@/lib/missions";

const CUSTOMERS_KEY = "orbi_customers";
const CUSTOMER_SESSION_KEY = "orbi_customer_session";

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

export function saveLocalCustomerAccount(
  name: string,
  phone: string,
  email: string,
  _password: string // stored only as registered flag for MVP, never in plaintext
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
    totalSpent: 0
  };
  const customers = readLocalCustomers();
  const next = [customer, ...customers.filter((c) => c.phone !== normalizedPhone)];
  window.localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(next));
}

export function clearCustomerSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CUSTOMER_SESSION_KEY);
}

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
};

export async function getCustomers() {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id,user_id,auth_id,name,phone,email,is_registered,created_at,updated_at,last_order_at,total_orders,total_spent,registered_at"
      )
      .order("updated_at", { ascending: false });

    if (!error && data) {
      const remoteCustomers = data.map(mapCustomerRow);
      const localCustomers = readLocalCustomers();
      return mergeCustomers([...remoteCustomers, ...localCustomers]);
    }
  } catch {
    // Local fallback keeps progressive registration non-blocking.
  }

  return readLocalCustomers();
}

export async function upsertGuestCustomerFromMission(mission: ActiveMission) {
  const phone = normalizePhone(mission.requester_phone);
  if (!phone || !mission.requester_name.trim()) {
    return null;
  }

  const now = new Date().toISOString();
  const amount = mission.total_amount ?? mission.total ?? mission.precio_servicio ?? 0;
  const existing = await findCustomerByPhone(phone);
  const customer: OrbiCustomer = {
    id: existing?.id ?? crypto.randomUUID(),
    userId: existing?.userId,
    name: mission.requester_name,
    phone,
    email: existing?.email,
    isRegistered: existing?.isRegistered ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOrderAt: now,
    totalOrders: (existing?.totalOrders ?? 0) + 1,
    totalSpent: (existing?.totalSpent ?? 0) + amount,
    registeredAt: existing?.registeredAt
  };

  await saveCustomer(customer);
  return customer;
}

export async function registerCustomerAccount({
  name,
  phone,
  email,
  password
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
    options: {
      data: {
        name,
        phone: normalizedPhone
      }
    }
  });

  if (error) {
    throw new Error(getAuthErrorMessage(error.message));
  }

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("No pudimos crear la cuenta. Intenta de nuevo.");
  }

  const now = new Date().toISOString();
  const existing = await findCustomerByPhone(normalizedPhone);
  const customer: OrbiCustomer = {
    id: existing?.id ?? crypto.randomUUID(),
    userId,
    name,
    phone: normalizedPhone,
    email,
    isRegistered: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOrderAt: existing?.lastOrderAt ?? now,
    totalOrders: existing?.totalOrders ?? 0,
    totalSpent: existing?.totalSpent ?? 0,
    registeredAt: now
  };

  await saveCustomer(customer);
  associateMissionsToUserByPhone(normalizedPhone, userId);
  return customer;
}

export async function isCustomerRegistered(phone: string) {
  const customer = await findCustomerByPhone(phone);
  return Boolean(customer?.isRegistered);
}

async function findCustomerByPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);

  try {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "id,user_id,auth_id,name,phone,email,is_registered,created_at,updated_at,last_order_at,total_orders,total_spent,registered_at"
      )
      .eq("phone", normalizedPhone)
      .maybeSingle();

    if (!error && data) {
      return mapCustomerRow(data);
    }
  } catch {
    // Fall through to local fallback.
  }

  return readLocalCustomers().find((customer) => customer.phone === normalizedPhone) ?? null;
}

async function saveCustomer(customer: OrbiCustomer) {
  try {
    const { error } = await supabase.from("customers").upsert(
      {
        id: customer.id,
        user_id: customer.userId ?? null,
        auth_id: customer.userId ?? null,
        name: customer.name,
        phone: customer.phone,
        email: customer.email ?? null,
        is_registered: customer.isRegistered,
        created_at: customer.createdAt,
        updated_at: customer.updatedAt,
        last_order_at: customer.lastOrderAt,
        total_orders: customer.totalOrders,
        total_spent: customer.totalSpent,
        registered_at: customer.registeredAt ?? null
      },
      { onConflict: "phone" }
    );

    if (!error) {
      saveLocalCustomer(customer);
      return;
    }
  } catch {
    // Local fallback below.
  }

  saveLocalCustomer(customer);
}

function readLocalCustomers() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const customers = JSON.parse(window.localStorage.getItem(CUSTOMERS_KEY) ?? "[]");
    return Array.isArray(customers) ? (customers as OrbiCustomer[]) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomer(customer: OrbiCustomer) {
  if (typeof window === "undefined") {
    return;
  }

  const customers = readLocalCustomers();
  const nextCustomers = [customer, ...customers.filter((item) => item.phone !== customer.phone)];
  window.localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(nextCustomers));
}

function mergeCustomers(customers: OrbiCustomer[]) {
  const byPhone = new Map<string, OrbiCustomer>();

  customers.forEach((customer) => {
    const current = byPhone.get(customer.phone);
    if (!current || new Date(customer.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      byPhone.set(customer.phone, customer);
    }
  });

  return Array.from(byPhone.values());
}

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
    registeredAt: row.registered_at ?? undefined
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
