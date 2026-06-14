const SESSION_KEY = "orbi_business_session";
const ACCOUNTS_KEY = "orbi_business_accounts";
const PASSWORDS_KEY = "orbi_business_passwords";

export type BusinessSession = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  supabaseBusinessId?: string; // UUID from Supabase businesses table
};

type BusinessAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  supabaseBusinessId?: string;
};

// ── Session ──────────────────────────────────────────────────────────────────

export function getBusinessSession(): BusinessSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BusinessSession;
    if (!parsed.id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveBusinessSession(session: BusinessSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearBusinessSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

// ── Local accounts (MVP) ─────────────────────────────────────────────────────

export function saveLocalBusinessAccount(
  name: string,
  email: string,
  phone: string,
  password: string,
  supabaseBusinessId?: string
): BusinessSession {
  if (typeof window === "undefined") throw new Error("server");
  const id = `biz_${Date.now()}`;
  const account: BusinessAccount = {
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone,
    supabaseBusinessId
  };
  const accounts: BusinessAccount[] = readAccounts().filter(
    (a) => a.email !== account.email
  );
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([account, ...accounts]));
  const passwords: Record<string, string> = readPasswords();
  passwords[account.email] = password;
  window.localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));
  return {
    id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    supabaseBusinessId: account.supabaseBusinessId
  };
}

export function loginBusiness(identifier: string, password: string): BusinessSession | null {
  if (typeof window === "undefined") return null;
  const accounts = readAccounts();
  const norm = identifier.trim().toLowerCase();
  const account = accounts.find(
    (a) => a.email === norm || a.phone.replace(/\D/g, "") === identifier.replace(/\D/g, "")
  );
  if (!account) return null;
  const passwords = readPasswords();
  if (passwords[account.email] !== password) return null;
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    phone: account.phone,
    supabaseBusinessId: account.supabaseBusinessId
  };
}

function readAccounts(): BusinessAccount[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BusinessAccount[]) : [];
  } catch {
    return [];
  }
}

function readPasswords(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(PASSWORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
