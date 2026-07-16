"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import {
  clearCustomerSession,
  getCurrentCustomerSession,
  loginCustomerWithSupabase,
  registerCustomerAccount,
  saveCustomerSession,
  getCustomerByAuthUserId,
  CustomerSession,
} from "@/lib/customers";
import { supabase } from "@/lib/supabase";
import {
  ActiveMission,
  CustomerMissionStats,
  fetchActiveMissions,
  fetchMissionStats,
  fetchMissionHistoryPaged,
  getMissionStatusLabel,
} from "@/lib/missions";
import { subscribeToTableChanges } from "@/lib/supabase";

function cleanPhone(p: string) {
  return p.replace(/\D/g, "");
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function shortFolio(id: string) {
  return `Folio: #${id.slice(-8).toUpperCase()}`;
}

function missionNarrativeMessage(m: ActiveMission): string {
  const agent = m.selected_agent_name;
  const business = m.business_name;
  switch (m.status) {
    case "esperando_negocio":
      return business
        ? `Tu pedido está en órbita. ${business} lo revisará en breve.`
        : "Tu pedido está en órbita. El negocio lo revisará en breve.";
    case "preparando":
      return business
        ? `${business} confirmó tu pedido. Lo están preparando.`
        : "El negocio confirmó tu pedido. Lo están preparando.";
    case "por_tomar":
      return "Buscando quién te ayude. Puede tomar unos minutos.";
    case "aceptada":
      return agent
        ? `${agent} aceptó tu misión y ya está en camino.`
        : "Tu agente aceptó la misión y ya está en camino.";
    case "en_mision":
      return agent
        ? `${agent} está en ruta con tu pedido.`
        : "Tu agente está en ruta con tu pedido.";
    case "cumplida":
      return "Tu pedido llegó.";
    default:
      return getMissionStatusLabel(m.status);
  }
}

type View = "choice" | "login" | "register";

// ── Root component ────────────────────────────────────────────────────────────

export function MyAccount() {
  const router = useRouter();
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [view, setView] = useState<View>("choice");
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const cached = getCurrentCustomerSession();
    // Cross-device: recover session from Supabase JWT
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        if (cached) setSession(cached);
        return;
      }
      if (data.user.user_metadata?.must_change_password) {
        router.replace("/usuarios/cambiar-contrasena");
        return;
      }
      if (cached) {
        // Enrich cached session with userId if it was saved before we added that field.
        if (!cached.userId) {
          const enriched = { ...cached, userId: data.user.id };
          saveCustomerSession(enriched.name, enriched.phone, enriched.email, data.user.id);
          setSession(enriched);
        } else {
          setSession(cached);
        }
        return;
      }
      const customer = await getCustomerByAuthUserId(data.user.id);
      if (customer) {
        saveCustomerSession(customer.name, customer.phone, customer.email, data.user.id);
        setSession({ name: customer.name, phone: customer.phone, email: customer.email, userId: data.user.id });
      }
    });
  }, [router]);

  function handleLogout() {
    clearCustomerSession();
    void supabase.auth.signOut();
    setSession(null);
    setCleared(true);
  }

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

  if (session) {
    return <SessionView session={session} onLogout={handleLogout} />;
  }

  if (view === "choice") {
    return (
      <div className="mt-8 space-y-4">
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
        onSuccess={(s) => setSession(s)}
        onSwitch={() => setView("register")}
        onBack={() => setView("choice")}
      />
    );
  }

  return (
    <RegisterForm
      onSuccess={(s) => setSession(s)}
      onSwitch={() => setView("login")}
      onBack={() => setView("choice")}
    />
  );
}

// ── Session view ──────────────────────────────────────────────────────────────

function SessionView({
  session,
  onLogout,
}: {
  session: CustomerSession;
  onLogout: () => void;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveMission[]>([]);
  const [stats, setStats] = useState<CustomerMissionStats | null>(null);
  const [missions, setMissions] = useState<ActiveMission[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingHist, setLoadingHist] = useState(true);
  const [histRefreshKey, setHistRefreshKey] = useState(0);

  // Resolve auth user ID once on mount — sole key for all mission queries.
  // Fallback: when "Confirm email" is enabled, signUp() creates no session,
  // so getUser() returns null. In that case we use the userId persisted in
  // CustomerSession during handleAuthGateSuccess registration.
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) {
        setUserId(user.id);
      } else if (session.userId) {
        setUserId(session.userId);
      }
    });
  }, [session.userId]);

  // Load active missions filtered by this user's auth id
  const refreshActive = useCallback(async () => {
    if (!userId) return;
    const all = await fetchActiveMissions();
    setActive(all.filter((m) => m.user_id === userId));
  }, [userId]);

  // Silent stats refresh (no loading spinner — called from Realtime callback)
  const refreshStats = useCallback(async () => {
    if (!userId) return;
    const s = await fetchMissionStats(userId);
    setStats(s);
  }, [userId]);

  // Suscripción estable: refresca misiones activas, KPIs e historial en cada evento
  useEffect(() => {
    void refreshActive();
    return subscribeToTableChanges("missions", () => {
      void refreshActive();
      void refreshStats();
      setHistRefreshKey((k) => k + 1);
    });
  }, [refreshActive, refreshStats]);

  // Load KPI stats once userId is known
  useEffect(() => {
    if (!userId) return;
    setLoadingStats(true);
    fetchMissionStats(userId).then((s) => {
      setStats(s);
      setLoadingStats(false);
    });
  }, [userId]);

  // Load history page — también reacciona a histRefreshKey para refrescar tras cambios de Realtime
  const loadPage = useCallback(
    async (p: number) => {
      if (!userId) return;
      setLoadingHist(true);
      const result = await fetchMissionHistoryPaged(userId, p);
      setMissions(result.missions);
      setHasMore(result.hasMore);
      setTotal(result.total);
      setLoadingHist(false);
    },
    [userId]
  );

  useEffect(() => { void loadPage(page); }, [loadPage, page, histRefreshKey]);

  const pageStart = total === 0 ? 0 : page * 10 + 1;
  const pageEnd = Math.min((page + 1) * 10, total);

  return (
    <section className="mt-8 space-y-6">

      {/* Active missions — first when present */}
      {active.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Misión activa
          </p>
          <div className="space-y-3">
            {active.map((m) => {
              const isPending = m.status === "por_tomar";
              const isMoving = m.status === "aceptada" || m.status === "en_mision";
              const borderClass = isMoving
                ? "border-orbi-cyan/40"
                : isPending
                ? "border-orbi-cyan/20"
                : "border-white/10";
              return (
                <div
                  key={m.id}
                  className={`rounded-md border bg-white/[0.04] px-4 py-4 transition-colors ${borderClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {isPending && (
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orbi-cyan opacity-60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orbi-cyan" />
                        </span>
                      )}
                      {isMoving && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orbi-cyan" />
                      )}
                      {!isPending && !isMoving && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orbi-muted/40" />
                      )}
                      <p className="text-sm font-bold text-orbi-text">{m.service_type}</p>
                    </div>
                    <p className="font-mono text-[10px] text-orbi-muted/50 shrink-0">{shortFolio(m.id)}</p>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-orbi-muted">
                    {missionNarrativeMessage(m)}
                  </p>
                  <div className="mt-3">
                    <Link
                      href={`/orbita/${m.id}`}
                      className={`inline-flex min-h-9 items-center justify-center rounded-md px-4 py-2 text-xs font-bold transition ${
                        isMoving
                          ? "bg-orbi-blue text-white shadow-glow hover:bg-[#0f7af0]"
                          : "border border-orbi-cyan/25 bg-orbi-blue/[0.08] text-orbi-cyan hover:bg-orbi-blue/15"
                      }`}
                    >
                      {isMoving ? "Ver en mapa" : "Ver pedido"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Identity card */}
      <div className="flex items-start gap-4 rounded-md border border-orbi-cyan/20 bg-orbi-blue/10 p-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <UserRound aria-hidden="true" className="h-6 w-6" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-black text-orbi-text">{session.name}</p>
          <p className="mt-0.5 font-mono text-xs font-bold text-orbi-cyan">{session.phone}</p>
          {session.email ? (
            <p className="mt-0.5 truncate text-xs text-orbi-muted">{session.email}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 text-xs font-semibold text-orbi-muted underline underline-offset-2 transition hover:text-red-400"
        >
          Cerrar sesión
        </button>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiChip
          label="Misiones totales"
          value={loadingStats ? "…" : String(stats?.total ?? 0)}
        />
        <KpiChip
          label="Cumplidas"
          value={loadingStats ? "…" : String(stats?.cumplidas ?? 0)}
          accent="emerald"
        />
        <KpiChip
          label="Canceladas"
          value={loadingStats ? "…" : String(stats?.canceladas ?? 0)}
          accent="red"
        />
        <KpiChip
          label="Última misión"
          value={loadingStats || !stats?.lastDate ? (loadingStats ? "…" : "—") : formatDate(stats.lastDate)}
          accent="blue"
        />
      </div>

      {/* Mission history */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orbi-muted">
          Historial de misiones
        </p>

        <div className="overflow-hidden rounded-md border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  {["Fecha", "Servicio", "Estado", "Total"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-bold uppercase tracking-[0.14em] text-orbi-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingHist ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-orbi-muted">
                      Cargando…
                    </td>
                  </tr>
                ) : missions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-orbi-muted">
                      {total === 0
                        ? "Aún no tienes misiones."
                        : "Sin resultados en esta página."}
                    </td>
                  </tr>
                ) : (
                  missions.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-white/[0.06] last:border-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 text-orbi-muted">
                        {formatDate(m.created_at || m.updated_at)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-orbi-text">
                        {m.service_type}
                        <span className="block font-mono text-[10px] text-orbi-muted/50">{shortFolio(m.id)}</span>
                      </td>
                      <td className="px-4 py-3 text-orbi-muted">
                        {getMissionStatusLabel(m.status)}
                      </td>
                      <td className="px-4 py-3 font-bold text-orbi-text">
                        {(m.total_amount ?? 0) > 0
                          ? `$${(m.total_amount ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="mt-3 flex items-center justify-between gap-4 text-xs">
            <span className="text-orbi-muted">
              {pageStart}–{pageEnd} de {total} misiones
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loadingHist}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/10"
              >
                ← Anterior
              </button>
              <span className="flex items-center px-2 font-bold text-orbi-text">
                Página {page + 1}
              </span>
              <button
                type="button"
                disabled={!hasMore || loadingHist}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 font-bold text-orbi-muted transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-white/10"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── KPI chip ──────────────────────────────────────────────────────────────────

function KpiChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red" | "blue";
}) {
  const valueClass =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "red"
      ? "text-orbi-muted"
      : accent === "blue"
      ? "text-sky-300"
      : "text-orbi-text";

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4 flex flex-col">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orbi-muted min-h-[2.5rem] flex items-start">{label}</p>
      <p className={`mt-1.5 text-xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm({
  onSuccess,
  onSwitch,
  onBack,
}: {
  onSuccess: (s: CustomerSession) => void;
  onSwitch: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Ingresa tu WhatsApp o correo y la contraseña.");
      return;
    }
    try {
      const session = await loginCustomerWithSupabase(identifier.trim(), password);
      // Guard: force password change if admin-activated account
      const { data } = await supabase.auth.getUser();
      if (data.user?.user_metadata?.must_change_password) {
        router.replace("/usuarios/cambiar-contrasena");
        return;
      }
      const userId = data.user?.id;
      saveCustomerSession(session.name, session.phone, session.email, userId);
      onSuccess({ ...session, userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Datos incorrectos.");
    }
  }

  return (
    <div className="mt-8 max-w-sm space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
        >
          ← Volver
        </button>
        <p className="text-lg font-black text-orbi-text">Iniciar sesión</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div>
          <label className="block text-xs font-semibold text-orbi-muted">
            WhatsApp o correo electrónico
          </label>
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
          <p className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2 text-xs font-semibold text-yellow-100">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="inline-flex w-full min-h-11 items-center justify-center rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
        >
          Entrar
        </button>
      </form>
      <div className="space-y-2">
        <p className="text-xs text-orbi-muted">
          ¿No tienes cuenta?{" "}
          <button
            type="button"
            onClick={onSwitch}
            className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
          >
            Crear cuenta
          </button>
        </p>
        <p className="text-xs text-orbi-muted">
          ¿Olvidaste tu contraseña?{" "}
          <a
            href="/usuarios/recuperar-contrasena"
            className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
          >
            Recuperar acceso
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm({
  onSuccess,
  onSwitch,
  onBack,
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

  async function handleSubmit(e: FormEvent) {
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
    try {
      const result = await registerCustomerAccount({
        name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
      });
      saveCustomerSession(result.name, result.phone, result.email, result.authUserId);
      onSuccess({ name: result.name, phone: result.phone, email: result.email, userId: result.authUserId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear la cuenta.");
    }
  }

  return (
    <div className="mt-8 max-w-sm space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-orbi-muted underline underline-offset-2 transition hover:text-orbi-text"
        >
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
          <p className="rounded-md border border-yellow-300/15 bg-yellow-300/[0.06] px-3 py-2 text-xs font-semibold text-yellow-100">
            {error}
          </p>
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
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-orbi-cyan underline underline-offset-2 transition hover:text-white"
        >
          Iniciar sesión
        </button>
      </p>
    </div>
  );
}
