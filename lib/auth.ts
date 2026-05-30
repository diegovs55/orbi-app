import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message ?? "No fue posible recuperar el usuario actual.");
  }

  return data.user ?? null;
}

export async function getCurrentAgentByAuthUserId(authUserId: string) {
  if (!authUserId) {
    return null;
  }

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("auth_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "No fue posible recuperar el agente actual.");
  }

  return data ?? null;
}

export async function getCurrentAgent() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return null;
  }

  return await getCurrentAgentByAuthUserId(user.id);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message ?? "No fue posible cerrar la sesión.");
  }
}
