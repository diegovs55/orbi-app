/**
 * adminFetch — wrapper de fetch que adjunta el JWT del admin en el header Authorization.
 * Solo para uso en componentes del panel admin (client-side).
 *
 * Usa el cliente Supabase Admin aislado (lib/supabase-admin-client.ts),
 * que guarda la sesión en sessionStorage bajo "sb-orbi-admin".
 * Nunca toca la sesión pública de agentes/negocios/clientes.
 *
 * Si la sesión Admin expiró o no existe, limpia la bandera de acceso
 * y devuelve 401 para forzar re-login — sin intentar refresh con otra identidad.
 */
import { supabaseAdmin } from "@/lib/supabase-admin-client";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.dispatchEvent(new Event("orbi-admin-session-change"));
}

export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data } = await supabaseAdmin.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    clearAdminSession();
    return new Response(
      JSON.stringify({ error: "Sesión expirada. Por favor inicia sesión nuevamente." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
}
