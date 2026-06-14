"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { saveAgentSession } from "@/lib/agentSession";
import { addPendingRequest } from "@/lib/pendingRequests";

type Panel = "closed" | "login" | "request";

export function AgentAccessPanel() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("closed");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setError(""); setSuccess(""); setIdentifier(""); setPassword("");
    setReqName(""); setReqPhone(""); setReqMessage("");
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) { setError("Completa todos los campos."); return; }
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: identifier.trim(),
      password
    });
    setLoading(false);
    if (authError || !data.session) {
      setError("Credenciales incorrectas. Verifica tus datos.");
      return;
    }
    const { data: agentRow } = await supabase
      .from("agents")
      .select("id,name,email")
      .eq("email", identifier.trim().toLowerCase())
      .maybeSingle();
    saveAgentSession({
      id: agentRow?.id ?? data.session.user.id,
      name: agentRow?.name ?? identifier.trim(),
      email: identifier.trim()
    });
    router.push("/agente");
  }

  function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!reqName.trim() || !identifier.trim() || !reqPhone.trim()) {
      setError("Nombre, correo y teléfono son obligatorios.");
      return;
    }
    addPendingRequest({
      type: "agent",
      name: reqName.trim(),
      email: identifier.trim(),
      phone: reqPhone.trim(),
      message: reqMessage.trim()
    });
    setSuccess("Solicitud enviada. El equipo Orbi la revisará pronto.");
    reset();
  }

  if (panel === "closed") {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setPanel("login")}
          className="inline-flex items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20"
        >
          <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
          Entrar como agente
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.06] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-orbi-text">
          {panel === "login" ? "Acceso de agente" : "Solicitar alta como agente"}
        </p>
        <button type="button" onClick={() => { setPanel("closed"); reset(); }} className="text-orbi-muted transition hover:text-orbi-text">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {success ? (
        <p className="mt-3 rounded-md border border-orbi-cyan/15 bg-orbi-blue/10 px-3 py-2 text-xs font-semibold text-orbi-cyan">{success}</p>
      ) : panel === "login" ? (
        <form onSubmit={handleLogin} className="mt-4 space-y-3" noValidate>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
            <input type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="agente@orbi.local" autoComplete="email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="Tu contraseña" autoComplete="current-password" />
          </div>
          {error ? <p className="text-xs font-semibold text-red-400">{error}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50">
              {loading ? "Verificando…" : "Entrar"}
            </button>
            <button type="button" onClick={() => { setPanel("request"); reset(); }}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10">
              Solicitar alta como agente
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleRequest} className="mt-4 space-y-3" noValidate>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Nombre completo</label>
            <input type="text" value={reqName} onChange={(e) => setReqName(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="Tu nombre" autoComplete="name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
            <input type="email" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="correo@ejemplo.com" autoComplete="email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">WhatsApp</label>
            <input type="tel" value={reqPhone} onChange={(e) => setReqPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="7771234567" autoComplete="tel" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Mensaje (opcional)</label>
            <textarea value={reqMessage} onChange={(e) => setReqMessage(e.target.value)} rows={2}
              className="mt-1 w-full resize-none rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="¿Qué servicios ofreces?" />
          </div>
          {error ? <p className="text-xs font-semibold text-red-400">{error}</p> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0]">
              Enviar solicitud
            </button>
            <button type="button" onClick={() => { setPanel("login"); reset(); }}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10">
              Ya tengo acceso
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
