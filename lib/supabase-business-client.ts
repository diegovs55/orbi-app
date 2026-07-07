/**
 * Cliente Supabase exclusivo del panel de Negocios.
 * storageKey "sb-orbi-business" → localStorage aislado.
 * Un login de negocio nunca pisa la sesión de cliente ni de agente.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBusiness = createClient(url, anonKey, {
  auth: {
    storageKey: "sb-orbi-business",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
