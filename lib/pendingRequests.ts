const KEY = "orbi_pending_requests";

export type RequestType = "agent" | "business";
export type RequestStatus = "pending" | "approved" | "rejected";

export type PendingRequest = {
  id: string;
  type: RequestType;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: RequestStatus;
  createdAt: string;
  approvedCredentials?: { email: string; password: string; supabaseBusinessId?: string };
};

export function getPendingRequests(): PendingRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingRequest[]) : [];
  } catch {
    return [];
  }
}

export function addPendingRequest(
  req: Omit<PendingRequest, "id" | "status" | "createdAt">
): PendingRequest {
  const full: PendingRequest = {
    ...req,
    id: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  const list = getPendingRequests();
  window.localStorage.setItem(KEY, JSON.stringify([full, ...list]));
  window.dispatchEvent(new Event("orbi-pending-requests-change"));
  return full;
}

export function updatePendingRequest(
  id: string,
  status: RequestStatus,
  extra?: Partial<Pick<PendingRequest, "approvedCredentials">>
): void {
  if (typeof window === "undefined") return;
  const list = getPendingRequests().map((r) =>
    r.id === id ? { ...r, status, ...(extra ?? {}) } : r
  );
  window.localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("orbi-pending-requests-change"));
}

export function subscribeToPendingRequests(cb: () => void) {
  window.addEventListener("orbi-pending-requests-change", cb);
  return () => window.removeEventListener("orbi-pending-requests-change", cb);
}
