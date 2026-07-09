"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

const truncateToken = (value: string) => {
  if (!value) return "no";
  return value.length > 24 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
};

type TokenDetails = {
  source: "query" | "hash" | "mixed" | "none";
  accessToken: string;
  refreshToken: string;
  type: string;
  expiresIn: string;
  tokenType: string;
  providerToken: string;
  errorDescription: string;
};

const parseTokenDetails = (href: string): TokenDetails => {
  const url = new URL(href);
  const queryParams = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  const queryHasTokens = queryParams.has("access_token") || queryParams.has("type");
  const hashHasTokens = hashParams.has("access_token") || hashParams.has("type");

  const accessToken = queryParams.get("access_token") ?? hashParams.get("access_token") ?? "";
  const refreshToken = queryParams.get("refresh_token") ?? hashParams.get("refresh_token") ?? "";
  const type = queryParams.get("type") ?? hashParams.get("type") ?? "";
  const expiresIn = queryParams.get("expires_in") ?? hashParams.get("expires_in") ?? "";
  const tokenType = queryParams.get("token_type") ?? hashParams.get("token_type") ?? "";
  const providerToken = queryParams.get("provider_token") ?? hashParams.get("provider_token") ?? "";
  const errorDescription = queryParams.get("error_description") ?? hashParams.get("error_description") ?? "";

  const source = queryHasTokens && hashHasTokens ? "mixed" : queryHasTokens ? "query" : hashHasTokens ? "hash" : "none";

  return {
    source,
    accessToken,
    refreshToken,
    type,
    expiresIn,
    tokenType,
    providerToken,
    errorDescription,
  };
};

export default function ResetPasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tokenDetails, setTokenDetails] = useState<TokenDetails | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRecoverySession = async () => {
      const details = parseTokenDetails(window.location.href);
      if (!isMounted) return;
      setTokenDetails(details);

      if (!details.accessToken || details.type !== "recovery") {
        setError("No se detectó un token de recuperación válido. Usa el enlace enviado por correo.");
        setStatus("error");
        return;
      }

      setStatus("loading");
      setError("");
      setMessage("Detectando la sesión de recuperación...");

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          if (!isMounted) return;
          setStatus("ready");
          setMessage("Tu enlace de recuperación es válido. Ingresa una nueva contraseña.");
        }
      });

      try {
        const { data: sessionData } = await supabase.auth.getSession();

        if (!isMounted) {
          subscription.unsubscribe();
          return;
        }

        if (sessionData.session && sessionData.session.access_token) {
          setStatus("ready");
          setMessage("Tu enlace de recuperación es válido. Ingresa una nueva contraseña.");
          return;
        }

        if (details.refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: details.accessToken,
            refresh_token: details.refreshToken,
          });

          if (!isMounted) {
            subscription.unsubscribe();
            return;
          }

          if (setSessionError) {
            setError(setSessionError.message || "No fue posible establecer la sesión de recuperación.");
            setStatus("error");
            subscription.unsubscribe();
            return;
          }

          const { data: updatedSession, error: updatedSessionError } = await supabase.auth.getSession();
          if (!isMounted) {
            subscription.unsubscribe();
            return;
          }

          if (updatedSessionError || !updatedSession.session) {
            setError(updatedSessionError?.message || "No se pudo confirmar la sesión de recuperación.");
            setStatus("error");
            subscription.unsubscribe();
            return;
          }

          setStatus("ready");
          setMessage("Tu enlace de recuperación es válido. Ingresa una nueva contraseña.");
          return;
        }

        setError("No se pudo establecer la sesión de recuperación. El enlace no contiene tokens completos.");
        setStatus("error");
      } catch (unexpectedError) {
        const message = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
        setError(message || "Ocurrió un error al procesar el enlace de recuperación.");
        setStatus("error");
      }
    };

    loadRecoverySession();

    return () => {
      isMounted = false;
    };
  }, []);

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

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setError("No hay una sesión de recuperación activa. Vuelve a abrir el enlace de correo.");
      setStatus("error");
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
                <p className="text-sm leading-6 text-orbi-muted">{message}</p>
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
