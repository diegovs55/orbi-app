"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, X } from "lucide-react";
import { addPendingRequest } from "@/lib/pendingRequests";

type Panel = "closed" | "login" | "request" | "confirmed";

export function BusinessAccessPanel({
  onLogin,
  registerOpen,
}: {
  onLogin: () => void;
  registerOpen?: (fn: () => void) => void;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("closed");

  useEffect(() => {
    registerOpen?.(() => setPanel("request"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [identifier, setIdentifier] = useState("");
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // onLogin prop kept for interface compatibility; actual login redirects to /negocios/login
  void onLogin;

  function reset() {
    setError(""); setIdentifier("");
    setRegName(""); setRegPhone(""); setReqMessage("");
  }

  function handleClose() {
    setPanel("closed");
    reset();
  }

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    router.push("/negocios/login");
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!regName.trim() || !identifier.trim() || !regPhone.trim()) {
      setError("Nombre, correo y teléfono son obligatorios."); return;
    }
    setLoading(true);
    const ok = await addPendingRequest({
      type: "business",
      name: regName.trim(),
      email: identifier.trim(),
      phone: regPhone.trim(),
      message: reqMessage.trim()
    });
    setLoading(false);
    if (!ok) {
      setError("No fue posible enviar la solicitud. Intenta de nuevo.");
      return;
    }
    setConfirmedPhone(regPhone.trim());
    reset();
    setPanel("confirmed");
  }

  if (panel === "closed") {
    return (
      <div className="text-center">
        <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-orbi-muted/55">¿Tienes un negocio?</p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => setPanel("request")}
            className="inline-flex min-h-10 items-center rounded-lg border border-orbi-cyan/[0.20] bg-orbi-blue/[0.12] px-5 py-2 text-xs font-bold text-orbi-cyan/90 transition hover:border-orbi-cyan/30 hover:bg-orbi-blue/[0.20]">
            Solicitar alta como negocio
          </button>
          <button type="button" onClick={() => setPanel("login")}
            className="inline-flex min-h-11 items-center rounded-md border border-white/[0.07] bg-transparent px-4 py-2 text-xs font-medium text-orbi-muted/50 transition hover:text-orbi-muted/80 hover:border-white/15">
            Ya tengo acceso
          </button>
        </div>
      </div>
    );
  }

  const panelTitle =
    panel === "login" ? "Acceso de negocio" :
    panel === "confirmed" ? "¡Solicitud recibida!" :
    "Solicitar alta de negocio";

  return (
    <div className="rounded-xl border border-orbi-cyan/[0.20] bg-gradient-to-b from-[rgba(31,139,255,0.11)] to-[rgba(8,20,36,0.70)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(54,215,255,0.10)] sm:p-7">
      <div className="flex items-center justify-between">
        <p className="text-lg font-black tracking-tight text-orbi-text">{panelTitle}</p>
        <button type="button" onClick={handleClose} className="text-orbi-muted/35 transition hover:text-orbi-muted">
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {panel === "confirmed" ? (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-orbi-muted/80">
            Tu negocio está a un paso de entrar en órbita. Revisaremos tu información y nos comunicaremos contigo al teléfono o WhatsApp registrado
            {confirmedPhone ? <> (<span className="font-semibold text-orbi-text">{confirmedPhone}</span>)</> : null} para continuar con tu acceso.
          </p>
          <p className="text-xs text-orbi-muted/70">No necesitas enviar otra solicitud.</p>
          <div className="pt-1">
            <SecondaryBtn label="Entendido" onClick={handleClose} />
          </div>
        </div>
      ) : panel === "login" ? (
        <form onSubmit={handleLogin} className="mt-5 space-y-4" noValidate>
          <p className="text-sm leading-6 text-orbi-muted/80">
            El acceso de negocio requiere correo y contraseña. Serás redirigido a la página de inicio de sesión.
          </p>
          {error ? <ErrorMsg msg={error} /> : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryBtn label="Ir al login" />
            <SecondaryBtn label="Solicitar alta" onClick={() => { setPanel("request"); reset(); }} />
          </div>
        </form>
      ) : (
        <form onSubmit={handleRequest} className="mt-5 space-y-4" noValidate>
          <p className="text-sm leading-6 text-orbi-muted/80">
            Cuéntanos sobre tu negocio. Revisaremos la información y nos comunicaremos contigo al teléfono o WhatsApp registrado para continuar con tu incorporación.
          </p>
          <FieldInput label="Nombre del negocio" type="text" value={regName} onChange={setRegName} placeholder="Mi negocio" autoComplete="organization" />
          <FieldInput label="Correo electrónico" type="email" value={identifier} onChange={setIdentifier} placeholder="correo@negocio.com" autoComplete="email" />
          <FieldInput label="Teléfono / WhatsApp" type="tel" value={regPhone} onChange={setRegPhone} placeholder="7771234567" autoComplete="tel" />
          <div>
            <label className="block text-[11px] font-medium text-orbi-muted/60">Descripción (opcional)</label>
            <textarea value={reqMessage} onChange={(e) => setReqMessage(e.target.value)} rows={2}
              className="mt-1 w-full resize-none rounded-lg border border-white/[0.12] bg-[rgba(255,255,255,0.05)] px-3 py-2.5 text-sm text-orbi-text placeholder:text-orbi-muted/45 focus:border-orbi-cyan/55 focus:bg-[rgba(54,215,255,0.03)] focus:ring-2 focus:ring-orbi-cyan/[0.08] focus:outline-none"
              placeholder="¿Qué productos o servicios ofrece tu negocio?" />
          </div>
          {error ? <ErrorMsg msg={error} /> : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <PrimaryBtn label={loading ? "Enviando…" : "Enviar solicitud"} disabled={loading} />
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
      <label className="block text-[11px] font-medium text-orbi-muted/60">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete}
        className="mt-1 w-full rounded-lg border border-white/[0.12] bg-[rgba(255,255,255,0.05)] px-3 py-2.5 text-sm text-orbi-text placeholder:text-orbi-muted/45 focus:border-orbi-cyan/55 focus:bg-[rgba(54,215,255,0.03)] focus:ring-2 focus:ring-orbi-cyan/[0.08] focus:outline-none" />
    </div>
  );
}

function PrimaryBtn({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-orbi-blue px-6 py-3 text-sm font-black text-white shadow-[0_3px_24px_rgba(31,139,255,0.32),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#0f7af0] disabled:opacity-50">
      {label}
    </button>
  );
}

function SecondaryBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/[0.12] bg-transparent px-5 py-3 text-sm font-bold text-orbi-muted/65 transition hover:border-white/20 hover:text-orbi-muted/90">
      {label}
    </button>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold text-red-400">{msg}</p>;
}
