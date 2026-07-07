import { supabase } from "@/lib/supabase";

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
};

type RequestRow = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  name: string;
  email: string;
  phone: string;
  message: string | null;
  created_at: string;
};

export function mapRequestRow(row: RequestRow): PendingRequest {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message ?? "",
    status: row.status,
    createdAt: row.created_at,
  };
}

// Public: called from AgentAccessPanel / BusinessAccessPanel with anon key.
// Does NOT chain .select() after insert — anon has no SELECT policy, and PostgREST
// would roll back the entire transaction if asked to return the row (Prefer: return=representation).
export async function addPendingRequest(
  req: Omit<PendingRequest, "id" | "status" | "createdAt">
): Promise<boolean> {
  const { error } = await supabase
    .from("requests")
    .insert({
      type: req.type,
      name: req.name,
      email: req.email,
      phone: req.phone,
      message: req.message,
    });
  return !error;
}
