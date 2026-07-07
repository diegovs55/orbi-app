"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { OrbiButton } from "@/components/OrbiButton";
import { supabaseAgent as supabase } from "@/lib/supabase-agent-client";
import { getAgentByAuthUserId } from "@/lib/agents";
import { saveAgentSession } from "@/lib/agentSession";

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export default function CambiarContrasenaPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Guard: requires an active Supabase session with must_change_password flag
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user || !data.user.user_metadata?.must_change_password) {
        router.replace("/agente/login");
        return;
      }
      setReady(true);
    });
  }, [router]);

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

    setIsSubmitting(true);

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message || "No fue posible actualizar la contraseña.");
      setIsSubmitting(false);
      return;
    }

    // Clear the temporary flag
    await supabase.auth.updateUser({ data: { must_change_password: false } });

    // Rebuild agent session from Supabase
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const agent = await getAgentByAuthUserId(userData.user.id);
      if (agent) {
        saveAgentSession({
          id: agent.id,
          name: agent.name,
          email: agent.email ?? userData.user.email ?? "",
        });
      }
    }

    router.push("/agente");
  }

  if (!ready) {
    return <div className="min-h-screen bg-orbi-black" />;
  }

  return (
    <div className="min-h-screen bg-orbi-black text-orbi-text">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
            Primer acceso
          </span>
        </header>

        <main className="mt-16 flex flex-1 flex-col justify-center gap-12 lg:flex-row lg:items-center lg:gap-20">
          <section className="max-w-xl space-y-6 lg:shrink-0">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
              <KeyRound aria-hidden="true" className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
              Contraseña temporal
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Crea tu contraseña definitiva.
            </h1>
            <p className="max-w-lg text-base leading-7 text-orbi-muted sm:text-lg">
              Tu coordinador te entregó una contraseña temporal. Por seguridad debes cambiarla antes de acceder al panel. Esta contraseña solo la conocerás tú.
            </p>
          </section>

          <section className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-orbi-black/70 p-8 shadow-glow sm:p-10">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orbi-cyan">
                Cambio obligatorio
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

              {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}

              <OrbiButton type="submit" className="w-full text-base" disabled={isSubmitting}>
                {isSubmitting ? "Guardando..." : "Establecer contraseña y entrar"}
              </OrbiButton>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
