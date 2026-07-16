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
        const returnTo =
          typeof window !== "undefined"
            ? (new URLSearchParams(window.location.search).get("returnTo") ?? "")
            : "";
        const target =
          "/usuarios/reset-password" +
          (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "");
        router.push(target);
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
