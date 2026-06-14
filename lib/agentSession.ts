const AGENT_SESSION_KEY = "orbi_agent_session";

export type AgentSession = {
  id: string;
  name: string;
  email: string;
};

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
