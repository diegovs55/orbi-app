"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";
import { getAgentByAuthUserId } from "@/lib/agents";
import { saveAgentSession } from "@/lib/agentSession";

const inputClasses =
  "mt-2 w-full rounded-lg border border-white/[0.12] bg-[rgba(5,7,13,0.60)] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/50 focus:border-orbi-cyan/55 focus:bg-[rgba(54,215,255,0.03)] focus:ring-2 focus:ring-orbi-cyan/[0.10]";

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
    <div className="min-h-screen bg-gradient-to-b from-orbi-navy/20 via-orbi-black to-orbi-black text-orbi-text">
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
            <p className="max-w-lg text-base leading-7 text-orbi-muted/75 sm:text-lg">
              Si es tu primer acceso, utiliza el correo y la contraseña temporal que te proporcionó tu coordinador ORBI.
            </p>
          </section>

          <section className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[rgba(8,20,36,0.84)] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm sm:p-10">
            <div className="space-y-4">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Ingresa con tu correo y contraseña
              </h2>
            </div>

            <form onSubmit={handleLogin} className="mt-8 space-y-6">
              <label className="block text-[11px] font-medium tracking-[0.04em] text-orbi-muted/65">
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

              <label className="block text-[11px] font-medium tracking-[0.04em] text-orbi-muted/65">
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
