"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabase } from "@/lib/supabase";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function UsuariosResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRecoverySession() {
      // Supabase appends tokens to the URL fragment after the redirect.
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const accessToken = params.get("access_token") ?? "";
      const refreshToken = params.get("refresh_token") ?? "";
      const type = params.get("type") ?? "";

      if (!accessToken || type !== "recovery") {
        if (!isMounted) return;
        setError("No se detectó un enlace de recuperación válido. Usa el enlace enviado por correo.");
        setStatus("error");
        return;
      }

      setStatus("loading");
      setMessage("Validando enlace...");

      // Try to restore the recovery session from the URL tokens.
      if (refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!isMounted) return;
        if (setErr) {
          setError(setErr.message || "El enlace de recuperación no es válido o ya expiró.");
          setStatus("error");
          return;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (!sessionData.session) {
        setError("No se pudo validar el enlace. Solicita uno nuevo.");
        setStatus("error");
        return;
      }

      setStatus("ready");
      setMessage("");
    }

    void loadRecoverySession();

    // Also listen for the PASSWORD_RECOVERY event fired by Supabase automatically.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
        setMessage("");
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
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
      setStatus("ready");
      return;
    }

    setStatus("success");
    setTimeout(() => router.push("/usuarios"), 1500);
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
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <KeyRound aria-hidden="true" className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              Nueva contraseña
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Establece tu nueva contraseña.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Esta contraseña solo la conocerás tú. Usa una que puedas recordar y que tenga al menos 8 caracteres.
            </p>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-2">
              {status === "success" ? (
                <h2 className="text-2xl font-black tracking-tight text-white">Contraseña actualizada</h2>
              ) : null}
            </div>

            {status === "success" ? (
              <p className="mt-6 text-sm leading-6 text-orbi-cyan">
                Tu contraseña fue actualizada. Redirigiendo a tu cuenta...
              </p>
            ) : status === "error" ? (
              <p className="mt-6 text-sm leading-6 text-red-300">{error}</p>
            ) : status === "loading" && !message ? (
              <p className="mt-6 text-sm leading-6 text-orbi-muted">Procesando...</p>
            ) : status === "idle" || (status === "loading" && message) ? (
              <p className="mt-6 text-sm leading-6 text-orbi-muted">{message || "Validando enlace..."}</p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <label className="block text-sm font-semibold text-orbi-text">
                  Contraseña nueva
                  <input
                    className={inputClasses}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>

                <label className="block text-sm font-semibold text-orbi-text">
                  Confirmar contraseña
                  <input
                    className={inputClasses}
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </label>

                {error ? (
                  <p className="text-sm font-semibold text-red-300">{error}</p>
                ) : null}

                <OrbiButton
                  type="submit"
                  className="w-full text-base"
                  disabled={status === "loading"}
                >
                  Establecer contraseña y entrar
                </OrbiButton>
              </form>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
