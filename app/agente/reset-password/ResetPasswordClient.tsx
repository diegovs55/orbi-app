"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabase } from "@/lib/supabase";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const queryType = searchParams.get("type");
    const accessToken = searchParams.get("access_token");

    if (!accessToken || queryType !== "recovery") {
      setError("No se detectó un token de recuperación válido. Usa el enlace enviado por correo.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    setMessage("");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
        setMessage("Tu enlace de recuperación es válido. Ingresa una nueva contraseña.");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.trim().length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setStatus("loading");
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "No fue posible actualizar la contraseña.");
      setStatus("error");
      return;
    }

    setStatus("success");
    setMessage("Contraseña actualizada. Redirigiendo al inicio de sesión...");
    window.setTimeout(() => router.push("/agente/login"), 1400);
  }

  return (
    <div className="min-h-screen bg-orbi-black text-orbi-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
            Recuperación
          </span>
        </header>

        <main className="mt-16 flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
          <section className="max-w-xl space-y-6 lg:shrink-0">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              Restablecer contraseña
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Crea una nueva contraseña para tu cuenta de agente.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Usa el enlace de recuperación que recibiste en tu correo para actualizar tu contraseña y volver a iniciar sesión.
            </p>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow sm:p-8">
              {status === "loading" ? (
                <p className="text-sm leading-6 text-orbi-muted">Validando el enlace de recuperación...</p>
              ) : status === "error" ? (
                <p className="text-sm leading-6 text-red-300">{error}</p>
              ) : (
                <p className="text-sm leading-6 text-orbi-muted">
                  Si el enlace es válido, podrás establecer tu nueva contraseña y regresar a iniciar sesión.
                </p>
              )}
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                Cambio de contraseña
              </p>
              <h2 className="text-2xl font-black tracking-tight text-white">
                Nueva contraseña
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <label className="block text-sm font-semibold text-orbi-text">
                Contraseña nueva
                <input
                  className={inputClasses}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nueva contraseña"
                  required
                  minLength={8}
                />
              </label>

              <label className="block text-sm font-semibold text-orbi-text">
                Confirmar contraseña
                <input
                  className={inputClasses}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repite la contraseña"
                  required
                  minLength={8}
                />
              </label>

              {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
              {message ? <p className="text-sm font-semibold text-orbi-cyan">{message}</p> : null}

              <OrbiButton type="submit" className="w-full text-base" disabled={status !== "ready"}>
                {status === "loading" ? "Procesando..." : "Actualizar contraseña"}
              </OrbiButton>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
