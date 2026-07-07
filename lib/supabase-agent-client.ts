/**
 * Cliente Supabase exclusivo del panel de Agentes.
 * storageKey "sb-orbi-agent" → localStorage aislado.
 * Un login de agente nunca pisa la sesión de cliente ni de negocio.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseAgent = createClient(url, anonKey, {
  auth: {
    storageKey: "sb-orbi-agent",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
