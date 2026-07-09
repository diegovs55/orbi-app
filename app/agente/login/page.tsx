"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";
import { getAgentByAuthUserId } from "@/lib/agents";
import { saveAgentSession } from "@/lib/agentSession";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function AgentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Ingresa tu correo y contraseña para continuar.");
      return;
    }

    setIsSubmitting(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.user) {
      setError("Credenciales incorrectas. Verifica tu correo y contraseña.");
      setIsSubmitting(false);
      return;
    }

    const user = data.user;

    // Forced password change on first access
    if (user.user_metadata?.must_change_password) {
      router.push("/agente/cambiar-contrasena");
      return;
    }

    // Fetch agent profile linked to this Auth user
    const agent = await getAgentByAuthUserId(user.id);
    if (!agent) {
      setError("Tu cuenta no está vinculada a ningún agente Orbi. Contacta a tu coordinador.");
      await supabase.auth.signOut();
      setIsSubmitting(false);
      return;
    }

    saveAgentSession({ id: agent.id, name: agent.name, email: agent.email ?? email.trim() });
    router.push("/agente");
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
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-4">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Ingresa con tu correo y contraseña
              </h2>
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
                  placeholder="Contraseña"
                  required
                />
              </label>

              {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}

              <OrbiButton type="submit" className="w-full text-base" disabled={isSubmitting}>
                {isSubmitting ? "Verificando..." : "Entrar"}
              </OrbiButton>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
