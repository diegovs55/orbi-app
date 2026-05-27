"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BarChart3, CalendarDays, Gauge, Orbit, ShieldCheck, Store, UsersRound } from "lucide-react";
import { getAgents, OrbiAgent } from "@/lib/agents";
import { getBusinesses, AffiliateBusiness } from "@/lib/businesses";
import {
  ActiveMission,
  getActiveMission,
  getMissionHistory,
  MissionStatus,
  subscribeToMission
} from "@/lib/missions";

const ADMIN_SESSION_KEY = "orbi_admin_unlocked";

type TimeFilter = "Hoy" | "Últimos 7 días" | "Este mes" | "Este año" | "Todo el tiempo" | "Rango personalizado";

type MissionRecord = {
  id: string;
  date: string;
  service: string;
  requester: string;
  agent: string;
  agentId: string;
  origin: string;
  destination: string;
  paymentMethod: "Efectivo" | "Transferencia" | "Tarjeta";
  paymentStatus: string;
  missionStatus: MissionStatus;
  price: number;
  agentCost: number;
  orbiProfit: number;
  rating: number | null;
  ratingComment: string;
  detail: string;
  business: string;
  product: string;
  businessCategory: string;
};

const timeFilters: TimeFilter[] = [
  "Hoy",
  "Últimos 7 días",
  "Este mes",
  "Este año",
  "Todo el tiempo",
  "Rango personalizado"
];

const missionGoal = 50;

const fallbackMissions: MissionRecord[] = [
  {
    id: "ORB-1042",
    date: "2026-05-26T10:20:00.000Z",
    service: "Mandado",
    requester: "Ana López",
    agent: "Diego Ramírez",
    agentId: "agent-01",
    origin: "Centro",
    destination: "La Ascensión",
    paymentMethod: "Efectivo",
    paymentStatus: "Pago al finalizar la misión",
    missionStatus: "Misión cumplida",
    price: 95,
    agentCost: 65,
    orbiProfit: 30,
    rating: 5,
    ratingComment: "Entrega rápida y clara.",
    detail: "Compra de café y pan dulce",
    business: "Regina Café",
    product: "Café y snacks",
    businessCategory: "Café y comida"
  },
  {
    id: "ORB-1041",
    date: "2026-05-25T16:45:00.000Z",
    service: "Entrega",
    requester: "Carlos Méndez",
    agent: "Sofía Torres",
    agentId: "agent-02",
    origin: "Papelería Centro",
    destination: "Zumpahuacán",
    paymentMethod: "Transferencia",
    paymentStatus: "Esta misión requiere pago al inicio",
    missionStatus: "En misión",
    price: 80,
    agentCost: 55,
    orbiProfit: 25,
    rating: null,
    ratingComment: "",
    detail: "Impresiones urgentes",
    business: "Papelería Centro",
    product: "Impresiones",
    businessCategory: "Papelería"
  },
  {
    id: "ORB-1040",
    date: "2026-05-23T09:15:00.000Z",
    service: "Traslado",
    requester: "María Ruiz",
    agent: "Luis Ortega",
    agentId: "agent-03",
    origin: "Norte",
    destination: "Centro",
    paymentMethod: "Tarjeta",
    paymentStatus: "Pago al finalizar la misión",
    missionStatus: "Misión aceptada",
    price: 120,
    agentCost: 84,
    orbiProfit: 36,
    rating: 4.6,
    ratingComment: "Buen seguimiento.",
    detail: "Traslado local",
    business: "Orbi directo",
    product: "Traslado local",
    businessCategory: "Traslados"
  },
  {
    id: "ORB-1039",
    date: "2026-05-18T18:30:00.000Z",
    service: "Compra local",
    requester: "Luis Torres",
    agent: "Diego Ramírez",
    agentId: "agent-01",
    origin: "Farmacia San Antonio",
    destination: "Barrio Alto",
    paymentMethod: "Efectivo",
    paymentStatus: "Pago al finalizar la misión",
    missionStatus: "Misión cumplida",
    price: 110,
    agentCost: 77,
    orbiProfit: 33,
    rating: 4.8,
    ratingComment: "Muy atento.",
    detail: "Medicamento y artículos urgentes",
    business: "Farmacia San Antonio",
    product: "Medicamento",
    businessCategory: "Farmacia"
  },
  {
    id: "ORB-1038",
    date: "2026-05-12T13:10:00.000Z",
    service: "Pago o trámite",
    requester: "Fernanda Silva",
    agent: "Sofía Torres",
    agentId: "agent-02",
    origin: "Centro",
    destination: "Tesorería",
    paymentMethod: "Transferencia",
    paymentStatus: "Esta misión requiere pago al inicio",
    missionStatus: "Misión cancelada",
    price: 0,
    agentCost: 0,
    orbiProfit: 0,
    rating: null,
    ratingComment: "Cancelada por cambio de horario.",
    detail: "Pago de servicio",
    business: "Orbi directo",
    product: "Trámite",
    businessCategory: "Trámites"
  }
];

export function AdminControlPanel() {
  const isUnlocked = useSyncExternalStore(subscribeToAdminSession, readAdminSession, () => false);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(() => getActiveMission());
  const [missionHistory, setMissionHistory] = useState<ActiveMission[]>(() => getMissionHistory());
  const [agents, setAgents] = useState<OrbiAgent[]>([]);
  const [businesses, setBusinesses] = useState<AffiliateBusiness[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("Últimos 7 días");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [today] = useState(() => new Date());

  useEffect(() => {
    return subscribeToMission(() => {
      setActiveMission(getActiveMission());
      setMissionHistory(getMissionHistory());
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    Promise.allSettled([getAgents(), getBusinesses()]).then(([agentsResult, businessesResult]) => {
      if (!isActive) {
        return;
      }

      if (agentsResult.status === "fulfilled") {
        setAgents(agentsResult.value);
      }

      if (businessesResult.status === "fulfilled") {
        setBusinesses(businessesResult.value);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const missions = useMemo(() => {
    const currentMission = activeMission ? [activeMission] : [];
    const realMissions = [...currentMission, ...missionHistory]
      .filter((mission, index, list) => list.findIndex((item) => item.id === mission.id) === index)
      .map((mission) => mapActiveMission(mission, today));
    return realMissions.length ? realMissions : fallbackMissions;
  }, [activeMission, missionHistory, today]);

  const filteredMissions = useMemo(() => {
    return filterMissionsByTime(missions, timeFilter, today, customStart, customEnd);
  }, [customEnd, customStart, missions, timeFilter, today]);

  const analytics = useMemo(() => buildAnalytics(filteredMissions, agents, businesses), [
    agents,
    businesses,
    filteredMissions
  ]);

  if (!isUnlocked) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/90 via-orbi-panel/72 to-orbi-black/86 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orbi-cyan">
              Base operativa
            </p>
            <h2 className="mt-2 text-2xl font-black text-orbi-text">Panel de control Orbi</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-orbi-muted">
              Vista de red local para leer misiones, agentes, pagos, negocios y avance contra meta.
            </p>
          </div>
          <span className="w-fit rounded-full border border-orbi-cyan/25 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
            Datos MVP + fallback
          </span>
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-orbi-cyan">
          <CalendarDays aria-hidden="true" className="h-4 w-4" />
          <p className="text-xs font-bold uppercase tracking-[0.18em]">Filtros de tiempo</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {timeFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setTimeFilter(filter)}
              className={`min-h-10 rounded-md border px-3 py-2 text-xs font-bold transition ${
                timeFilter === filter
                  ? "border-orbi-cyan/45 bg-orbi-blue/20 text-orbi-cyan"
                  : "border-white/10 bg-white/[0.04] text-orbi-muted hover:bg-white/10"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        {timeFilter === "Rango personalizado" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <DateInput label="Inicio" value={customStart} onChange={setCustomStart} />
            <DateInput label="Fin" value={customEnd} onChange={setCustomEnd} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard icon={Orbit} label="Misiones totales" value={analytics.totalMissions} />
        <MetricCard icon={CalendarDays} label="Misiones de hoy" value={analytics.todayMissions} />
        <MetricCard icon={ShieldCheck} label="Misiones cumplidas" value={analytics.completedMissions} />
        <MetricCard icon={ShieldCheck} label="Misiones canceladas" value={analytics.cancelledMissions} />
        <MetricCard icon={Gauge} label="Facturación total" value={analytics.totalRevenue} prefix="$" />
        <MetricCard icon={Gauge} label="Costo operativo total" value={analytics.totalCost} prefix="$" />
        <MetricCard icon={Gauge} label="Ganancia estimada" value={analytics.totalProfit} prefix="$" />
        <MetricCard icon={Gauge} label="Ticket promedio" value={analytics.averageTicket} prefix="$" />
        <MetricCard icon={Gauge} label="Ganancia promedio" value={analytics.averageProfit} prefix="$" />
        <MetricCard icon={ShieldCheck} label="Calificación promedio" value={analytics.averageRating} suffix="/5" />
        <MetricCard icon={Gauge} label="Meta de misiones" value={missionGoal} />
        <ProgressCard value={analytics.totalMissions} goal={missionGoal} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Misiones por categoría" items={analytics.categoryBars} />
        <ChartPanel title="Métodos de pago" items={analytics.paymentBars} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AgentsPanel analytics={analytics} />
        <BusinessesPanel analytics={analytics} />
      </div>

      <MissionHistoryTable missions={filteredMissions} />
      <RatingsPanel missions={filteredMissions} />
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  suffix = ""
}: {
  icon: typeof Orbit;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-orbi-text">
            {prefix}{Number.isInteger(value) ? value : value.toFixed(1)}{suffix}
          </p>
          <p className="mt-1 text-xs font-semibold text-orbi-muted">{label}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function ProgressCard({ value, goal }: { value: number; goal: number }) {
  const percentage = Math.min(100, Math.round((value / goal) * 100));

  return (
    <article className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <p className="text-2xl font-black text-orbi-text">{percentage}%</p>
      <p className="mt-1 text-xs font-semibold text-orbi-muted">Avance contra meta</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-orbi-blue shadow-glow" style={{ width: `${percentage}%` }} />
      </div>
    </article>
  );
}

function ChartPanel({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-orbi-cyan">
        <BarChart3 aria-hidden="true" className="h-4 w-4" />
        <h3 className="text-sm font-black text-orbi-text">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <BarRow key={item.label} label={item.label} value={item.value} max={max} />
        ))}
      </div>
    </section>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(8, Math.round((value / max) * 100));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-orbi-muted">{label}</span>
        <span className="font-black text-orbi-text">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-orbi-blue shadow-glow" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function AgentsPanel({ analytics }: { analytics: Analytics }) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-orbi-cyan">
        <UsersRound aria-hidden="true" className="h-4 w-4" />
        <h3 className="text-sm font-black text-orbi-text">Agentes</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MiniStat label="Total" value={analytics.totalAgents} />
        <MiniStat label="En órbita" value={analytics.agentsInOrbit} />
        <MiniStat label="Fuera" value={analytics.agentsOutOrbit} />
      </div>
      <div className="mt-4 space-y-3">
        {analytics.agentRanking.map((agent) => (
          <div key={agent.name} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-orbi-text">{agent.name}</p>
              <span className="text-xs font-bold text-orbi-cyan">{agent.missions} misiones</span>
            </div>
            <p className="mt-1 text-xs text-orbi-muted">
              Cumplidas: {agent.completed} · Calificación promedio: {agent.averageRating.toFixed(1)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function BusinessesPanel({ analytics }: { analytics: Analytics }) {
  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-orbi-panel/72 p-4 shadow-soft">
      <div className="mb-4 flex items-center gap-2 text-orbi-cyan">
        <Store aria-hidden="true" className="h-4 w-4" />
        <h3 className="text-sm font-black text-orbi-text">Negocios</h3>
      </div>
      <div className="rounded-md border border-orbi-cyan/15 bg-orbi-blue/[0.08] p-3">
        <p className="text-xs font-semibold text-orbi-muted">Negocio con más misiones en órbita</p>
        <p className="mt-1 text-lg font-black text-orbi-text">{analytics.topBusiness.name}</p>
        <p className="mt-1 text-xs text-orbi-cyan">{analytics.topBusiness.missions} misiones</p>
      </div>
      <div className="mt-4 space-y-3">
        {analytics.businessRanking.map((business) => (
          <div key={business.name} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-orbi-text">{business.name}</p>
              <span className="text-xs font-bold text-orbi-cyan">{business.missions}</span>
            </div>
            <p className="mt-1 text-xs text-orbi-muted">
              Producto/servicio: {business.product} · Categoría frecuente: {business.category}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MissionHistoryTable({ missions }: { missions: MissionRecord[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-orbi-panel/70 shadow-soft">
      <div className="border-b border-white/10 p-4">
        <h3 className="text-lg font-black text-orbi-text">Historial de misiones</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-[0.16em] text-orbi-muted">
              {["Fecha", "Servicio", "Solicitante", "Agente", "Origen", "Destino", "Método de pago", "Estado de pago", "Facturación", "Costo", "Ganancia", "Estado de misión", "Calificación", "Detalle"].map((header) => (
                <th key={header} className="px-4 py-4 font-bold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {missions.map((mission) => (
              <tr key={mission.id} className="border-b border-white/5 last:border-b-0">
                <td className="px-4 py-4 text-orbi-muted">{formatDate(mission.date)}</td>
                <td className="px-4 py-4 font-bold text-orbi-cyan">{mission.service}</td>
                <td className="px-4 py-4 text-orbi-text">{mission.requester}</td>
                <td className="px-4 py-4 text-orbi-muted">{mission.agent}</td>
                <td className="px-4 py-4 text-orbi-muted">{mission.origin}</td>
                <td className="px-4 py-4 text-orbi-muted">{mission.destination}</td>
                <td className="px-4 py-4 text-orbi-muted">{mission.paymentMethod}</td>
                <td className="px-4 py-4 text-orbi-muted">{mission.paymentStatus}</td>
                <td className="px-4 py-4 text-orbi-muted">${mission.price}</td>
                <td className="px-4 py-4 text-orbi-muted">${mission.agentCost}</td>
                <td className="px-4 py-4 text-orbi-muted">${mission.orbiProfit}</td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-orbi-cyan/20 bg-orbi-blue/10 px-3 py-1 text-xs font-bold text-orbi-cyan">
                    {mission.missionStatus}
                  </span>
                </td>
                <td className="px-4 py-4 text-orbi-muted">
                  {mission.rating ? `${mission.rating.toFixed(1)} / 5` : "Pendiente"}
                </td>
                <td className="px-4 py-4 text-orbi-muted">{mission.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RatingsPanel({ missions }: { missions: MissionRecord[] }) {
  const ratedMissions = missions.filter((mission) => mission.rating !== null);

  return (
    <section className="rounded-md border border-orbi-cyan/15 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-orbi-cyan">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
        <h3 className="text-sm font-black text-orbi-text">Calificación de misiones</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-orbi-muted">
        Estructura preparada para guardar rating de 1 a 5, comentario opcional, agente calificado y misión calificada.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ratedMissions.slice(0, 4).map((mission) => (
          <article key={`rating-${mission.id}`} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
            <p className="font-bold text-orbi-text">{mission.agent}</p>
            <p className="mt-1 text-xs text-orbi-cyan">
              Misión {mission.id} · {mission.rating?.toFixed(1)} / 5
            </p>
            <p className="mt-2 text-sm text-orbi-muted">{mission.ratingComment || "Sin comentario"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="text-lg font-black text-orbi-text">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-orbi-muted">{label}</p>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition focus:border-orbi-cyan/60 focus:ring-2 focus:ring-orbi-cyan/15"
      />
    </label>
  );
}

type Analytics = ReturnType<typeof buildAnalytics>;

function buildAnalytics(missions: MissionRecord[], agents: OrbiAgent[], businesses: AffiliateBusiness[]) {
  const totalAgents = agents.length;
  const agentsInOrbit = agents.filter((agent) => agent.status === "En órbita").length;
  const agentsOutOrbit = Math.max(0, totalAgents - agentsInOrbit);
  const businessRanking = rankByBusiness(missions, businesses);
  const topBusiness = businessRanking[0] ?? {
    name: businesses[0]?.name ?? "Orbi directo",
    missions: 0,
    product: "Sin datos",
    category: businesses[0]?.category ?? "Red local"
  };
  const completedMissions = missions.filter((mission) => mission.missionStatus === "Misión cumplida");
  const ratedMissions = missions.filter((mission) => mission.rating !== null);
  const totalRevenue = missions.reduce((total, mission) => total + mission.price, 0);
  const totalCost = missions.reduce((total, mission) => total + mission.agentCost, 0);
  const totalProfit = totalRevenue - totalCost;

  return {
    totalMissions: missions.length,
    todayMissions: missions.filter((mission) => isSameDay(new Date(mission.date), new Date())).length,
    completedMissions: completedMissions.length,
    cancelledMissions: missions.filter((mission) => mission.missionStatus === "Misión cancelada").length,
    totalRevenue,
    totalCost,
    totalProfit,
    averageTicket: completedMissions.length ? totalRevenue / completedMissions.length : 0,
    averageProfit: completedMissions.length ? totalProfit / completedMissions.length : 0,
    averageRating: ratedMissions.length
      ? ratedMissions.reduce((total, mission) => total + (mission.rating ?? 0), 0) / ratedMissions.length
      : 0,
    categoryBars: buildCountBars(missions, ["Mandado", "Entrega", "Traslado", "Compra local", "Pago o trámite"], "service"),
    paymentBars: buildCountBars(missions, ["Efectivo", "Transferencia", "Tarjeta"], "paymentMethod"),
    totalAgents,
    agentsInOrbit,
    agentsOutOrbit,
    agentRanking: rankByAgent(missions, agents),
    bestRatedMissions: ratedMissions.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5),
    topBusiness,
    businessRanking
  };
}

function buildCountBars(
  missions: MissionRecord[],
  labels: string[],
  key: "service" | "paymentMethod"
) {
  return labels.map((label) => ({
    label,
    value: missions.filter((mission) => mission[key] === label).length
  }));
}

function rankByAgent(missions: MissionRecord[], agents: OrbiAgent[]) {
  const names = agents.length
    ? agents.map((agent) => agent.name)
    : Array.from(new Set(missions.map((mission) => mission.agent))).filter(Boolean);

  return names
    .map((name) => {
      const agentMissions = missions.filter((mission) => mission.agent === name);
      const ratings = agentMissions
        .map((mission) => mission.rating)
        .filter((rating): rating is number => rating !== null);

      return {
        name,
        missions: agentMissions.length,
        completed: agentMissions.filter((mission) => mission.missionStatus === "Misión cumplida").length,
        averageRating: ratings.length
          ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
          : 0
      };
    })
    .sort((a, b) => b.missions - a.missions)
    .slice(0, 5);
}

function rankByBusiness(missions: MissionRecord[], businesses: AffiliateBusiness[]) {
  const names = businesses.length
    ? businesses.map((business) => business.name)
    : Array.from(new Set(missions.map((mission) => mission.business))).filter(Boolean);

  return names
    .map((name) => {
      const businessMissions = missions.filter((mission) => mission.business === name);
      return {
        name,
        missions: businessMissions.length,
        product: mostFrequent(businessMissions.map((mission) => mission.product)),
        category: mostFrequent(businessMissions.map((mission) => mission.businessCategory))
      };
    })
    .sort((a, b) => b.missions - a.missions)
    .slice(0, 5);
}

function mapActiveMission(mission: ActiveMission, today: Date): MissionRecord {
  return {
    id: mission.id,
    date: mission.last_updated_at || today.toISOString(),
    service: mission.service_type,
    requester: mission.requester_name,
    agent: mission.selected_agent_name,
    agentId: mission.active_agent_id || mission.selected_agent_id,
    origin: mission.origin_text,
    destination: mission.destination_text,
    paymentMethod: normalizePaymentMethod(mission.payment_method),
    paymentStatus: mission.payment_status,
    missionStatus: mission.mission_status,
    price: mission.precio_servicio ?? 0,
    agentCost: mission.costo_agente ?? 0,
    orbiProfit: mission.ganancia_orbi ?? (mission.precio_servicio ?? 0) - (mission.costo_agente ?? 0),
    rating: mission.rating ?? null,
    ratingComment: mission.rating_comment ?? "",
    detail: mission.detail,
    business: "Orbi directo",
    product: mission.service_type,
    businessCategory: mission.service_type === "Pago o trámite" ? "Trámites" : mission.service_type
  };
}

function filterMissionsByTime(
  missions: MissionRecord[],
  filter: TimeFilter,
  today: Date,
  customStart: string,
  customEnd: string
) {
  if (filter === "Todo el tiempo") {
    return missions;
  }

  const start = getStartDate(filter, today, customStart);
  const end = filter === "Rango personalizado" && customEnd ? endOfDay(new Date(customEnd)) : today;

  return missions.filter((mission) => {
    const date = new Date(mission.date);
    return date >= start && date <= end;
  });
}

function getStartDate(filter: TimeFilter, today: Date, customStart: string) {
  if (filter === "Rango personalizado" && customStart) {
    return startOfDay(new Date(customStart));
  }

  const start = new Date(today);

  if (filter === "Hoy") {
    return startOfDay(start);
  }

  if (filter === "Últimos 7 días") {
    start.setDate(start.getDate() - 7);
    return startOfDay(start);
  }

  if (filter === "Este mes") {
    return new Date(start.getFullYear(), start.getMonth(), 1);
  }

  if (filter === "Este año") {
    return new Date(start.getFullYear(), 0, 1);
  }

  return new Date(0);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();

  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sin datos";
}

function normalizePaymentMethod(method: string): MissionRecord["paymentMethod"] {
  if (method === "Transferencia" || method === "Tarjeta") {
    return method;
  }

  return "Efectivo";
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function readAdminSession() {
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function subscribeToAdminSession(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("orbi-admin-session-change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("orbi-admin-session-change", callback);
  };
}
