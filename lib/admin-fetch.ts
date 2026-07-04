/**
 * adminFetch — wrapper de fetch que adjunta el JWT del admin en el header Authorization.
 * Solo para uso en componentes del panel admin (client-side).
 */
import { supabase } from "@/lib/supabase";

export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
