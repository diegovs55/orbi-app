"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabase } from "@/lib/supabase";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setStatus("loading");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/usuarios/reset-password`,
    });

    if (resetError) {
      setError(resetError.message || "No fue posible enviar el correo. Intenta de nuevo.");
      setStatus("error");
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="min-h-screen bg-orbi-black text-orbi-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
            Recuperar acceso
          </span>
        </header>

        <main className="mt-16 flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
          <section className="max-w-xl space-y-6 lg:shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <KeyRound aria-hidden="true" className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              ¿Olvidaste tu contraseña?
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Te enviamos un enlace para recuperarla.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Escribe el correo con el que creaste tu cuenta. Si existe, recibirás un enlace para establecer una nueva contraseña.
            </p>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            {status === "sent" ? (
              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                  Correo enviado
                </p>
                <h2 className="text-2xl font-black tracking-tight text-white">
                  Revisa tu bandeja de entrada.
                </h2>
                <p className="text-sm leading-6 text-orbi-muted">
                  Si tu correo está registrado, recibirás un enlace en los próximos minutos. Revisa también tu carpeta de spam.
                </p>
                <Link
                  href="/usuarios"
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
                >
                  Volver a mi cuenta
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                    Recuperar contraseña
                  </p>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    Correo electrónico
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <label className="block text-sm font-semibold text-orbi-text">
                    Correo registrado
                    <input
                      className={inputClasses}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      required
                      autoComplete="email"
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
                    {status === "loading" ? "Enviando..." : "Enviar enlace de recuperación"}
                  </OrbiButton>
                </form>

                <p className="text-xs text-orbi-muted">
                  ¿Ya tienes tu contraseña?{" "}
                  <Link
                    href="/usuarios"
                    className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
                  >
                    Volver a iniciar sesión
                  </Link>
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
