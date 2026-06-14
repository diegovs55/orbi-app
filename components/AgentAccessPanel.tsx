"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, X } from "lucide-react";
import { saveAgentSession, loginAgent } from "@/lib/agentSession";
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

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) { setError("Completa todos los campos."); return; }
    setLoading(true);
    const session = loginAgent(identifier.trim(), password);
    setLoading(false);
    if (!session) {
      setError("Credenciales incorrectas. Verifica tu correo y contraseña.");
      return;
    }
    saveAgentSession(session);
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

  const panelTitle =
    panel === "login" ? "Acceso de agente" : "Solicitar alta como agente";

  return (
    <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.06] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-orbi-text">{panelTitle}</p>
        <button type="button" onClick={() => { setPanel("closed"); reset(); }} className="text-orbi-muted transition hover:text-orbi-text">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {success ? (
        <p className="mt-3 rounded-md border border-orbi-cyan/15 bg-orbi-blue/10 px-3 py-2 text-xs font-semibold text-orbi-cyan">{success}</p>
      ) : panel === "login" ? (
        <form onSubmit={handleLogin} className="mt-4 space-y-3" noValidate>
          <FieldInput label="Correo electrónico" type="email" value={identifier} onChange={setIdentifier} placeholder="agente@orbi.local" autoComplete="email" />
          <FieldInput label="Contraseña" type="password" value={password} onChange={setPassword} placeholder="Tu contraseña" autoComplete="current-password" />
          {error ? <ErrorMsg msg={error} /> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <PrimaryBtn label={loading ? "Verificando…" : "Entrar"} disabled={loading} />
            <SecondaryBtn label="Solicitar alta" onClick={() => { setPanel("request"); reset(); }} />
          </div>
        </form>
      ) : (
        <form onSubmit={handleRequest} className="mt-4 space-y-3" noValidate>
          <FieldInput label="Nombre completo" type="text" value={reqName} onChange={setReqName} placeholder="Tu nombre" autoComplete="name" />
          <FieldInput label="Correo electrónico" type="email" value={identifier} onChange={setIdentifier} placeholder="correo@ejemplo.com" autoComplete="email" />
          <FieldInput label="WhatsApp" type="tel" value={reqPhone} onChange={setReqPhone} placeholder="7771234567" autoComplete="tel" />
          <div>
            <label className="block text-xs font-semibold text-orbi-muted">Mensaje (opcional)</label>
            <textarea value={reqMessage} onChange={(e) => setReqMessage(e.target.value)} rows={2}
              className="mt-1 w-full resize-none rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none"
              placeholder="¿Qué servicios ofreces?" />
          </div>
          {error ? <ErrorMsg msg={error} /> : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <PrimaryBtn label="Enviar solicitud" />
            <SecondaryBtn label="Ya tengo acceso" onClick={() => { setPanel("login"); reset(); }} />
          </div>
        </form>
      )}
    </div>
  );
}

function FieldInput({ label, type, value, onChange, placeholder, autoComplete }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string; autoComplete: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-orbi-muted">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
        className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text focus:border-orbi-cyan/50 focus:outline-none" />
    </div>
  );
}

function PrimaryBtn({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-50">
      {label}
    </button>
  );
}

function SecondaryBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-5 py-2 text-xs font-bold text-orbi-muted transition hover:bg-white/10">
      {label}
    </button>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold text-red-400">{msg}</p>;
}
