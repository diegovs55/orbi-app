const AGENT_SESSION_KEY = "orbi_agent_session";
const AGENT_ACCOUNTS_KEY = "orbi_agent_accounts";
const AGENT_PASSWORDS_KEY = "orbi_agent_passwords";

export type AgentSession = {
  id: string;
  name: string;
  email: string;
};

type AgentAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

// ── Session ───────────────────────────────────────────────────────────────────

export function getAgentSession(): AgentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AGENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentSession;
    if (!parsed.id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAgentSession(session: AgentSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AGENT_SESSION_KEY, JSON.stringify(session));
}

export function clearAgentSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AGENT_SESSION_KEY);
}

// ── Local accounts (mirrors businessSession) ──────────────────────────────────

function readAgentAccounts(): AgentAccount[] {
  try {
    const raw = window.localStorage.getItem(AGENT_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentAccount[]) : [];
  } catch {
    return [];
  }
}

function readAgentPasswords(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(AGENT_PASSWORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function saveLocalAgentAccount(
  name: string,
  email: string,
  phone: string,
  password: string,
  supabaseAgentId?: string
): AgentSession {
  if (typeof window === "undefined") throw new Error("server");
  const id = supabaseAgentId ?? `agent_${Date.now()}`;
  const account: AgentAccount = {
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone
  };
  const existing = readAgentAccounts().filter((a) => a.email !== account.email);
  window.localStorage.setItem(
    AGENT_ACCOUNTS_KEY,
    JSON.stringify([account, ...existing])
  );
  const passwords = readAgentPasswords();
  passwords[account.email] = password;
  window.localStorage.setItem(AGENT_PASSWORDS_KEY, JSON.stringify(passwords));
  return { id, name: account.name, email: account.email };
}

export function loginAgent(
  identifier: string,
  password: string
): AgentSession | null {
  if (typeof window === "undefined") return null;
  const accounts = readAgentAccounts();
  const norm = identifier.trim().toLowerCase();
  const account = accounts.find(
    (a) =>
      a.email === norm ||
      a.phone.replace(/\D/g, "") === identifier.replace(/\D/g, "")
  );
  if (!account) return null;
  const passwords = readAgentPasswords();
  if (passwords[account.email] !== password) return null;
  return { id: account.id, name: account.name, email: account.email };
}
