/**
 * Cliente Supabase exclusivo del panel Admin.
 *
 * Usa storageKey "sb-orbi-admin" → sessionStorage propio.
 * Nunca comparte estado con el cliente público (lib/supabase.ts),
 * que usan agentes, negocios y clientes.
 *
 * Consecuencias deseadas:
 * - signInWithPassword de un agente/negocio no pisa esta sesión.
 * - Al cerrar el tab/browser la sesión Admin desaparece (sessionStorage).
 * - Las APIs siguen validando el JWT con SERVICE_ROLE (lib/supabase-admin.ts).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAdmin = createClient(url, anonKey, {
  auth: {
    storageKey: "sb-orbi-admin",
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
