/**
 * adminFetch — wrapper de fetch que adjunta el JWT del admin en el header Authorization.
 * Solo para uso en componentes del panel admin (client-side).
 *
 * Si la sesión no existe o expiró, intenta refrescarla una vez.
 * Si el refresco también falla, limpia la clave admin de sessionStorage para
 * forzar el re-login — el panel mostrará el formulario de acceso automáticamente.
 */
import { supabase } from "@/lib/supabase";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.dispatchEvent(new Event("orbi-admin-session-change"));
}

export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;

  // Session missing or expired — attempt a single silent refresh.
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
  }

  // Refresh also failed — session is truly gone. Force re-login.
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
