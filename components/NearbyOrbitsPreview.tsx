"use client";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Loader2, MapPin, Navigation, RefreshCw, X } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { apiUrl } from "@/lib/api-url";
import { geoGetCurrentPosition, geoIsAvailable } from "@/lib/geo";
import { checkGpsPermission, requestGpsPermission } from "@/lib/geo-permissions";

// ── Types ─────────────────────────────────────────────────────────────────────

type NearbyAgent = {
  id: string;
  name: string;
  photo_url: string | null;
  initials: string | null;
  vehicle: string | null;
  trust_level: string;
  description: string;
  service_type: string;
  zone: string;
};

type OrbitData = {
  available: number;
  availability_status?: "confirmed" | "routing_unavailable";
  pickup_distance_km: number | null;
  pickup_eta_min: number | null;
  orbits: { lat: number; lng: number }[];
  nearby_agents: NearbyAgent[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const ZUMPAHUACAN: [number, number] = [18.8349, -99.5818];


// "You are here" teardrop pin — SVG preserved exactly; orbi-pin-icon sets
// overflow:visible so the container never clips the stroke/tip on iOS.
// viewBox expands 2 px on every side so the 1.5px stroke never touches the
// SVG canvas edge. iconSize matches the new canvas; iconAnchor keeps the tip
// on the exact coordinate (path tip at y=28 → pixel y = 28+2 = 30).
const queryIcon = L.divIcon({
  className: "orbi-pin-icon",
  html: `<svg width="24" height="32" viewBox="-2 -2 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 0C4.477 0 0 4.477 0 10c0 6.627 10 18 10 18S20 16.627 20 10C20 4.477 15.523 0 10 0z" fill="#eef7ff" stroke="#1f8bff" stroke-width="1.5"/>
    <circle cx="10" cy="10" r="4" fill="#1f8bff"/>
  </svg>`,
  iconAnchor: [12, 30],
  iconSize: [24, 32],
});

// ── Map subcomponents ─────────────────────────────────────────────────────────

// Pans the map to center without resetting the user's zoom level.
// Only re-centers when the center coordinate actually changes.
function MapPanner({ center }: { center: [number, number] }) {
  const map = useMap();
  const prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (prev.current && prev.current[0] === center[0] && prev.current[1] === center[1]) return;
    prev.current = center;
    map.panTo(center);
  }, [map, center]);
  return null;
}

// Fires onPick on any map click (the map is always in pick mode once open).
// Leaflet suppresses this event when the user is dragging the map or the marker.
function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Orbit wave animation — imperative Leaflet, zero React re-renders ──────────
// Uses L.circle + setRadius()/setStyle() driven by requestAnimationFrame so the
// radius is a real geographic metre value that scales correctly at all zoom levels.
// No transform:scale(), no px-fixed DivIcon, no React state updates during animation.

function OrbitWavesLayer({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    const CYCLE = 4000;                         // ms per full wave cycle
    const OFFSETS: [number, number, number] = [0, 1300 / 4000, 2600 / 4000]; // stagger 1.3 s apart
    const MIN_R = 100;                          // metres — wave birth radius
    const MAX_R = 520;                          // metres — wave death radius

    const circles = OFFSETS.map(() =>
      L.circle(center, {
        radius: MIN_R,
        color: "#36d7ff",
        fillColor: "#1f8bff",
        fillOpacity: 0.18,
        weight: 1.5,
        opacity: 0.95,
        interactive: false,
      }).addTo(map),
    );

    let rafId: number;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = ts - startTs;

      circles.forEach((circle, i) => {
        // phase 0 = just born, 1 = fully expanded and invisible
        const phase = ((elapsed / CYCLE) + OFFSETS[i]) % 1;
        // ease-out: fast expansion at start, decelerates toward edge
        const eased = 1 - (1 - phase) ** 2;
        circle.setRadius(MIN_R + (MAX_R - MIN_R) * eased);
        circle.setStyle({
          opacity:     Math.max(0, 0.95 * (1 - phase)),
          fillOpacity: Math.max(0, 0.18 * (1 - phase)),
          weight:      1.5 + 2.5 * phase,
        });
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      circles.forEach((c) => c.remove());
    };
    // center values are degraded to 2 dp server-side and won't drift between renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center[0], center[1]]);

  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function NearbyOrbitsPreview() {
  // showMap: true once the user opens the map (even before first queryPoint)
  const [showMap, setShowMap] = useState(false);
  const [queryPoint, setQueryPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<OrbitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchOrbits = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/orbits/availability?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`),
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as OrbitData);
    } catch {
      setError("No se pudo consultar la disponibilidad. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Called by both click on map and dragend of marker
  const handlePick = useCallback(
    (lat: number, lng: number) => {
      setQueryPoint({ lat, lng });
      void fetchOrbits(lat, lng);
    },
    [fetchOrbits],
  );

  const handleGeolocate = useCallback(async () => {
    if (!geoIsAvailable()) {
      setGeoError("Este navegador no soporta geolocalización.");
      return;
    }
    setGeoError(null);
    setLoading(true);

    // En nativo: verificar/solicitar permiso antes de pedir posición para evitar
    // el race de cold-start de CLLocationManager tras el primer grant (iOS).
    // En web: omitir — getCurrentPosition maneja el diálogo del navegador.
    if (Capacitor.isNativePlatform()) {
      let permission = await checkGpsPermission();
      if (permission === "prompt") {
        permission = await requestGpsPermission();
      }
      if (permission !== "granted") {
        setLoading(false);
        setGeoError("No fue posible obtener tu ubicación. Usa 'Elegir en el mapa'.");
        return;
      }
    }

    geoGetCurrentPosition(
      ({ coords }) => {
        setShowMap(true);
        handlePick(coords.latitude, coords.longitude);
      },
      () => {
        setLoading(false);
        setGeoError("No fue posible obtener tu ubicación. Usa 'Elegir en el mapa'.");
      },
      { timeout: 30000, enableHighAccuracy: true },
    );
  }, [handlePick]);

  const handleRefresh = useCallback(() => {
    if (!queryPoint) return;
    void fetchOrbits(queryPoint.lat, queryPoint.lng);
  }, [queryPoint, fetchOrbits]);

  const handleClose = useCallback(() => {
    setShowMap(false);
    setQueryPoint(null);
    setData(null);
    setError(null);
    setGeoError(null);
  }, []);

  // ── Initial state: map not yet open ──────────────────────────────────────
  if (!showMap) {
    return (
      <div className="rounded-md border border-white/[0.05] bg-gradient-to-br from-orbi-panel/55 via-orbi-panel/45 to-orbi-black/65 px-5 py-7 shadow-[0_8px_24px_rgba(0,0,0,0.16)] backdrop-blur text-center sm:px-8 sm:py-9">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orbi-cyan/70">
          Órbitas disponibles
        </p>
        <p className="mt-2 text-sm leading-6 text-orbi-muted/80">
          Pon misiones en las órbitas o tómalas para trasladarte.
        </p>
        {geoError && <p className="mt-2 text-xs text-red-300/90">{geoError}</p>}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orbi-blue px-6 py-3 text-sm font-black text-white shadow-[0_3px_20px_rgba(31,139,255,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#0f7af0] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin aria-hidden="true" className="h-4 w-4" />
            )}
            Explorar órbitas
          </button>
        </div>
      </div>
    );
  }

  // ── Map state: always interactive ─────────────────────────────────────────
  const mapCenter: [number, number] = queryPoint
    ? [queryPoint.lat, queryPoint.lng]
    : ZUMPAHUACAN;

  return (
    <div className="overflow-hidden rounded-xl border border-orbi-cyan/[0.18] bg-gradient-to-b from-[rgba(31,139,255,0.07)] to-[rgba(8,20,36,0.72)] shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(54,215,255,0.08)] backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-orbi-cyan/70">
            Órbitas disponibles
          </p>
          {!queryPoint && !loading && (
            <p className="mt-1 text-xs text-orbi-muted">
              Toca el mapa para consultar una zona.
            </p>
          )}
          {loading && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-orbi-muted">
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
              Consultando disponibilidad…
            </p>
          )}
          {!loading && data !== null && data.available > 0 && (
            <p className="mt-1 text-sm font-semibold text-orbi-text">
              {data.available === 1
                ? "1 agente disponible"
                : `${data.available} agentes disponibles`}
              {data.pickup_distance_km != null
                ? data.pickup_distance_km < 1
                  ? " · menos de 1 km"
                  : ` · ${data.pickup_distance_km} km aprox.`
                : ""}
              {data.pickup_eta_min != null ? ` · llegada estimada ${data.pickup_eta_min} min` : ""}
            </p>
          )}
          {!loading && data !== null && data.available === 0 && (
            <p className="mt-1 text-sm text-orbi-muted">
              {data.availability_status === "routing_unavailable"
                ? "No pudimos confirmar la disponibilidad. Intenta actualizar."
                : "No hay agentes en órbita en este momento."}
            </p>
          )}
          {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
        </div>

        <div className="flex shrink-0 gap-2">
          {queryPoint && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              aria-label="Actualizar disponibilidad"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-orbi-cyan/[0.18] bg-orbi-blue/[0.08] text-orbi-cyan/80 transition hover:bg-orbi-blue/15 disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {/* "Mi ubicación" re-geolocates and re-queries from the new position */}
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={loading}
            aria-label="Usar mi ubicación"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-transparent px-3 text-xs font-medium text-orbi-muted/55 transition hover:border-white/18 hover:text-orbi-muted/85 disabled:opacity-60"
          >
            <Navigation aria-hidden="true" className="h-3.5 w-3.5" />
            Mi ubicación
          </button>
          {/* "Cerrar" — returns to initial state without touching any data */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar mapa"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-white/[0.09] bg-transparent px-3 text-xs font-medium text-orbi-muted/55 transition hover:border-white/18 hover:text-orbi-muted/85"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Cerrar
          </button>
        </div>
      </div>

      {/* Map — always interactive: click moves point, drag marker moves point */}
      <div className="relative h-64 w-full">
        <MapContainer
          center={mapCenter}
          zoom={13}
          className="h-full w-full"
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapPanner center={mapCenter} />
          <ClickCatcher onPick={handlePick} />

          {queryPoint && (
            <Marker
              draggable
              eventHandlers={{
                dragend(e) {
                  const { lat, lng } = (e.target as L.Marker).getLatLng();
                  handlePick(lat, lng);
                },
              }}
              position={[queryPoint.lat, queryPoint.lng]}
              icon={queryIcon}
            />
          )}

          {data?.orbits.map((o, i) => (
            <OrbitWavesLayer key={i} center={[o.lat, o.lng]} />
          ))}
        </MapContainer>

        {/* Hint before first pick */}
        {!queryPoint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-md border border-orbi-cyan/25 bg-orbi-black/80 px-3 py-1.5 text-xs font-bold text-orbi-cyan backdrop-blur">
              Toca para elegir tu zona
            </span>
          </div>
        )}
      </div>

      {/* CTA — only when agents are available */}
      {data !== null && data.available > 0 && (
        <div className="p-4">
          <Link
            href="/pedir"
            className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-orbi-blue px-5 py-2.5 text-sm font-black text-white shadow-[0_3px_20px_rgba(31,139,255,0.24),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#0f7af0]"
          >
            Poner una misión en órbita →
          </Link>
        </div>
      )}

      {/* Top 3 — public profiles from the same available[] set, no coordinates */}
      {data !== null && data.nearby_agents.length > 0 && (
        <div className="border-t border-white/[0.07] px-4 pb-4 pt-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-orbi-cyan/70">
            Agentes disponibles en esta zona
          </p>
          {data.available > 3 && (
            <p className="mb-3 text-xs text-orbi-muted">
              Mostrando los 3 más cercanos de {data.available} disponibles.
            </p>
          )}
          <div className="space-y-3">
            {data.nearby_agents.map((agent) => (
              <NearbyAgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nearby agent card — public fields only, no coordinates ────────────────────

function NearbyAgentCard({ agent }: { agent: NearbyAgent }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
      {agent.photo_url ? (
        <div
          aria-label={agent.name}
          role="img"
          className="h-10 w-10 shrink-0 rounded-md border border-orbi-cyan/20 bg-cover bg-center"
          style={{ backgroundImage: `url(${agent.photo_url})` }}
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-xs font-black text-orbi-cyan">
          {agent.initials ?? agent.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-orbi-text">{agent.name}</p>
        {agent.vehicle && (
          <p className="truncate text-xs text-orbi-muted">{agent.vehicle}</p>
        )}
      </div>
    </div>
  );
}
