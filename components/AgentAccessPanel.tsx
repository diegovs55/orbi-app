"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, X } from "lucide-react";
import { getAgentSession } from "@/lib/agentSession";
import { addPendingRequest } from "@/lib/pendingRequests";

type Panel = "closed" | "request" | "confirmed";

export function AgentAccessPanel() {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("closed");
  const [hasSession, setHasSession] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHasSession(getAgentSession() !== null);
    setMounted(true);
  }, []);

  function reset() {
    setError(""); setIdentifier("");
    setReqName(""); setReqPhone(""); setReqMessage("");
  }

  function handleClose() {
    setPanel("closed");
    reset();
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!reqName.trim() || !identifier.trim() || !reqPhone.trim()) {
      setError("Nombre, correo y teléfono son obligatorios.");
      return;
    }
    setLoading(true);
    const ok = await addPendingRequest({
      type: "agent",
      name: reqName.trim(),
      email: identifier.trim(),
      phone: reqPhone.trim(),
      message: reqMessage.trim()
    });
    setLoading(false);
    if (!ok) {
      setError("No fue posible enviar la solicitud. Intenta de nuevo.");
      return;
    }
    setConfirmedPhone(reqPhone.trim());
    reset();
    setPanel("confirmed");
  }

  if (!mounted) return null;

  if (panel === "closed") {
    if (hasSession) {
      return (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => router.push("/agente")}
            className="inline-flex items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20"
          >
            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
            Ir a mi panel
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={() => setPanel("request")}
          className="inline-flex items-center gap-2 rounded-md bg-orbi-blue px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Solicitar alta como agente
        </button>
        <button
          type="button"
          onClick={() => router.push("/agente/login")}
          className="inline-flex items-center gap-2 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-2 text-xs font-bold text-orbi-cyan transition hover:bg-orbi-blue/20"
        >
          Ya tengo acceso
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-orbi-cyan/20 bg-orbi-blue/[0.06] p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-orbi-text">
          {panel === "confirmed" ? "¡Solicitud recibida!" : "Solicitar alta como agente"}
        </p>
        <button type="button" onClick={handleClose} className="text-orbi-muted transition hover:text-orbi-text">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {panel === "confirmed" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-orbi-muted">
            Revisaremos tus datos y te contactaremos por WhatsApp al{" "}
            {confirmedPhone
              ? <span className="font-semibold text-orbi-text">{confirmedPhone}</span>
              : "número registrado"}
            .
          </p>
          <p className="text-xs text-orbi-muted/70">No necesitas enviar otra solicitud.</p>
          <SecondaryBtn label="Entendido" onClick={handleClose} />
        </div>
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
            <PrimaryBtn label={loading ? "Enviando…" : "Enviar solicitud"} disabled={loading} />
            <SecondaryBtn label="Ya tengo acceso" onClick={() => router.push("/agente/login")} />
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
