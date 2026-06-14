"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import {
  clearCustomerSession,
  getCurrentCustomerSession,
  loginWithCredential,
  saveCustomerSession,
  saveLocalCustomerAccount,
  CustomerSession
} from "@/lib/customers";
import {
  ActiveMission,
  getActiveMissions,
  getMissionHistory,
  getMissionStatusLabel,
  isMissionClosed,
  loadActiveMissionsFromSupabase
} from "@/lib/missions";

function cleanPhone(p: string) {
  return p.replace(/\D/g, "");
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type View = "choice" | "login" | "register";

export function MyAccount() {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [history, setHistory] = useState<ActiveMission[]>([]);
  const [active, setActive] = useState<ActiveMission[]>([]);
  const [view, setView] = useState<View>("choice");
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const s = getCurrentCustomerSession();
    setSession(s);
    if (s) void loadMissions(s.phone);
  }, []);

  async function loadMissions(phone: string) {
    const normalized = cleanPhone(phone);
    setHistory(
      getMissionHistory().filter((m) => cleanPhone(m.requester_phone ?? "") === normalized)
    );
    await loadActiveMissionsFromSupabase();
    setActive(
      getActiveMissions().filter(
        (m) => !isMissionClosed(m) && cleanPhone(m.requester_phone ?? "") === normalized
      )
    );
  }

  function handleLogout() {
    clearCustomerSession();
    setSession(null);
    setHistory([]);
    setActive([]);
    setCleared(true);
  }

  // ── Logged-out cleared confirmation ──────────────────────────────────────
  if (cleared) {
    return (
      <div className="mt-8 rounded-md border border-white/10 bg-white/[0.04] p-6 text-center">
        <p className="text-sm font-semibold text-orbi-text">Sesión cerrada correctamente.</p>
        <button
          type="button"
          onClick={() => { setCleared(false); setView("choice"); }}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-orbi-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  // ── Active session ────────────────────────────────────────────────────────
  if (session) {
    return (
      <section className="mt-8 space-y-6">
        {/* Identity card */}
        <div className="flex items-start gap-4 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
            <UserRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-black text-orbi-text">{session.name}</p>
            <p className="mt-0.5 font-mono text-xs font-bold text-orbi-cyan">{session.phone}</p>
            {session.email ? (
              <p className="mt-0.5 truncate text-xs text-orbi-muted">{session.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-red-400"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Active missions */}
        {active.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">Misiones activas</p>
            <div className="space-y-2">
              {active.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-orbi-text">{m.service_type}</p>
                    <p className="text-xs text-orbi-muted">{getMissionStatusLabel(m.status)}</p>
                  </div>
                  <Link href="/orbita" className="text-xs font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white">
                    Ver en órbita
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mission history */}
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">Historial de misiones</p>
          {history.length === 0 ? (
            <p className="text-sm text-orbi-muted">Aún no tienes misiones completadas asociadas a este número.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-white/10">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    {["Servicio", "Estado", "Destino", "Fecha"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-orbi-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((m) => (
                    <tr key={m.id} className="border-b border-white/[0.06] hover:bg-white/[0.03]">
                      <td className="px-4 py-3 font-semibold text-orbi-text">{m.service_type}</td>
                      <td className="px-4 py-3 text-xs text-orbi-muted">{getMissionStatusLabel(m.status)}</td>
                      <td className="px-4 py-3 text-xs text-orbi-muted">{m.destination_text || "—"}</td>
                      <td className="px-4 py-3 text-xs text-orbi-muted">{m.last_updated_at ? formatDate(m.last_updated_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  }

  // ── No session — choice / login / register ────────────────────────────────
  if (view === "choice") {
    return (
      <div className="mt-8 space-y-4">
        <p className="text-sm text-orbi-muted">
          Inicia sesión para ver tu historial de misiones o crea una cuenta nueva.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setView("login")}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-orbi-blue px-6 py-2 text-sm font-bold text-white shadow-glow transition hover:bg-[#0f7af0]"
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => setView("register")}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-6 py-2 text-sm font-bold text-orbi-text transition hover:bg-white/10"
          >
            Crear cuenta
          </button>
        </div>
      </div>
    );
  }

  if (view === "login") {
    return (
      <LoginForm
        onSuccess={(s) => { setSession(s); loadMissions(s.phone); }}
        onSwitch={() => setView("register")}
        onBack={() => setView("choice")}
      />
    );
  }

  return (
    <RegisterForm
      onSuccess={(s) => { setSession(s); loadMissions(s.phone); }}
      onSwitch={() => setView("login")}
      onBack={() => setView("choice")}
    />
  );
}

// ── Login form ───────────────────────────────────────────────────────────────
function LoginForm({
  onSuccess,
  onSwitch,
  onBack
}: {
  onSuccess: (s: CustomerSession) => void;
  onSwitch: () => void;
  onBack: () => void;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Ingresa tu WhatsApp o correo y la contraseña.");
      return;
    }
    const customer = loginWithCredential(identifier.trim(), password);
    if (!customer) {
      setError("Datos incorrectos. Verifica tu WhatsApp/correo y contraseña.");
      return;
    }
    saveCustomerSession(customer.name, customer.phone, customer.email);
    onSuccess({ name: customer.name, phone: customer.phone, email: customer.email });
  }

  return (
    <div className="mt-8 max-w-sm space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-xs text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text">
          ← Volver
        </button>
        <p className="text-lg font-black text-orbi-text">Iniciar sesión</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">WhatsApp o correo electrónico</label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="7771234567 o correo@ejemplo.com"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Tu contraseña"
            autoComplete="current-password"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex w-full min-h-11 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Entrar
        </button>
      </form>
      <p className="text-xs text-orbi-muted">
        ¿No tienes cuenta?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white">
          Crear cuenta
        </button>
      </p>
    </div>
  );
}

// ── Register form ────────────────────────────────────────────────────────────
function RegisterForm({
  onSuccess,
  onSwitch,
  onBack
}: {
  onSuccess: (s: CustomerSession) => void;
  onSwitch: () => void;
  onBack: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!fullName.trim() || !email.trim() || !phone.trim() || !password) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }
    if (cleanPhone(phone).length < 10) {
      setError("Ingresa un número de WhatsApp válido (10 dígitos).");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    saveLocalCustomerAccount(fullName.trim(), phone.trim(), email.trim(), password);
    saveCustomerSession(fullName.trim(), phone.trim(), email.trim());
    onSuccess({ name: fullName.trim(), phone: phone.trim(), email: email.trim() });
  }

  return (
    <div className="mt-8 max-w-sm space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-xs text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text">
          ← Volver
        </button>
        <p className="text-lg font-black text-orbi-text">Crear cuenta Orbi</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Nombre completo</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Tu nombre completo"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="correo@ejemplo.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">WhatsApp</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="7771234567"
            autoComplete="tel"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-orbi-black/60 px-3 py-2 text-sm text-orbi-text placeholder:text-orbi-muted/50 focus:border-orbi-cyan/50 focus:outline-none"
            placeholder="Repite la contraseña"
            autoComplete="new-password"
          />
        </div>
        {error ? (
          <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">{error}</p>
        ) : null}
        <button
          type="submit"
          className="inline-flex w-full min-h-11 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Crear cuenta
        </button>
      </form>
      <p className="text-xs text-orbi-muted">
        ¿Ya tienes cuenta?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white">
          Iniciar sesión
        </button>
      </p>
    </div>
  );
}
