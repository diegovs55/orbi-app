"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * Escucha eventos de autenticación de Supabase a nivel de layout.
 * Cuando el usuario llega al sitio con un token de recuperación en el hash
 * (porque el redirectTo no estaba en la lista blanca de Supabase), Supabase
 * dispara PASSWORD_RECOVERY — este componente lo intercepta y lleva al usuario
 * a la pantalla de nueva contraseña.
 */
export function SupabaseAuthListener() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/usuarios/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
