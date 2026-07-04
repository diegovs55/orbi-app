const SESSION_KEY = "orbi_business_session";

export type BusinessSession = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  supabaseBusinessId?: string;
};

// ── Session cache (localStorage only — Supabase Auth is the source of truth) ──

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
