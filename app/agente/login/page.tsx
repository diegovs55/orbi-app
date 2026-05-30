"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabase } from "@/lib/supabase";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function AgentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña para continuar.");
      return;
    }

    setIsSubmitting(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (authError) {
      setError(authError.message || "No fue posible iniciar sesión. Revisa tus datos.");
      return;
    }

    if (data.session) {
      router.push("/agente");
      return;
    }

    setError("No se pudo iniciar sesión. Intenta de nuevo");
  }

  async function handleResetPassword() {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Ingresa tu correo para recibir el enlace de recuperación.");
      return;
    }

    setIsSubmitting(true);
    const resetUrl = `${window.location.origin}/agente/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: resetUrl
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message || "No fue posible enviar el correo de recuperación.");
      return;
    }

    setMessage("Revisa tu correo para restablecer la contraseña. Si no llega, revisa la bandeja de spam.");
  }

  return (
    <div className="min-h-screen bg-orbi-black text-orbi-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
            Agentes
          </span>
        </header>

        <main className="mt-16 flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
          <section className="max-w-xl space-y-6 lg:shrink-0">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              Acceso de agente
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Bienvenido a tu panel de operaciones.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Inicia sesión para ver misiones disponibles, aceptar encargos y atender nuevas solicitudes desde la Red Orbi.
            </p>
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                ¿Aún no tienes cuenta?
              </p>
              <p className="text-sm leading-6 text-orbi-muted">
                Contacta a tu coordinador Orbi para activar tu acceso o hazlo desde el panel de administración cuando seas un agente autorizado.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                Login de agente
              </p>
              <h2 className="text-2xl font-black tracking-tight text-white">
                Ingresa con tu correo y contraseña
              </h2>
              <p className="text-sm leading-6 text-orbi-muted">
                Tus credenciales te permitirán conectarte al flujo de solicitudes y misiones en tiempo real.
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-6">
              <label className="block text-sm font-semibold text-orbi-text">
                Correo electrónico
                <input
                  className={inputClasses}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@correo.com"
                  required
                />
              </label>

              <label className="block text-sm font-semibold text-orbi-text">
                Contraseña
                <input
                  className={inputClasses}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Contraseña segura"
                  required
                />
              </label>

              <div className="flex items-center justify-between text-sm font-semibold text-orbi-muted">
                <span>¿Olvidaste tu clave?</span>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-orbi-cyan hover:text-white"
                >
                  Recuperar acceso
                </button>
              </div>

              {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
              {message ? <p className="text-sm font-semibold text-orbi-cyan">{message}</p> : null}

              <OrbiButton type="submit" className="w-full text-base" disabled={isSubmitting}>
                {isSubmitting ? "Procesando..." : "Entrar"}
              </OrbiButton>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
