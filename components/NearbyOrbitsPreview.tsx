"use client";

import L from "leaflet";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Loader2, MapPin, Navigation, RefreshCw } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type OrbitData = {
  available: number;
  nearest_distance_bucket: string | null;
  orbits: { lat: number; lng: number }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Geographic center of Zumpahuacán as fallback when no query point yet
const ZUMPAHUACAN: [number, number] = [18.8349, -99.5818];

const queryIcon = L.divIcon({
  className: "",
  html: '<span class="orbi-map-marker"></span>',
  iconAnchor: [14, 14],
  iconSize: [28, 28],
});

// ── Map subcomponents ─────────────────────────────────────────────────────────

// Reactively re-centers the map when center changes (MapContainer ignores prop updates)
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  const prev = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (prev.current && prev.current[0] === center[0] && prev.current[1] === center[1]) return;
    prev.current = center;
    map.setView(center, 13);
  }, [map, center]);
  return null;
}

// Captures map clicks only when in picking mode
function ClickCatcher({
  picking,
  onPick,
}: {
  picking: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (picking) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function NearbyOrbitsPreview() {
  const [queryPoint, setQueryPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [data, setData] = useState<OrbitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchOrbits = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orbits/availability?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`,
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

  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("Este navegador no soporta geolocalización.");
      return;
    }
    setGeoError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pt = { lat: coords.latitude, lng: coords.longitude };
        setQueryPoint(pt);
        void fetchOrbits(pt.lat, pt.lng);
      },
      () => {
        setLoading(false);
        setGeoError("No fue posible obtener tu ubicación. Usa 'Elegir en el mapa'.");
      },
      { timeout: 8000, enableHighAccuracy: true },
    );
  }, [fetchOrbits]);

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      setPicking(false);
      const pt = { lat, lng };
      setQueryPoint(pt);
      void fetchOrbits(lat, lng);
    },
    [fetchOrbits],
  );

  const handleRefresh = useCallback(() => {
    if (!queryPoint) return;
    void fetchOrbits(queryPoint.lat, queryPoint.lng);
  }, [queryPoint, fetchOrbits]);

  const handleReset = useCallback(() => {
    setQueryPoint(null);
    setData(null);
    setError(null);
    setPicking(false);
    setGeoError(null);
  }, []);

  // ── Initial state: no map yet ─────────────────────────────────────────────
  if (!queryPoint && !picking) {
    return (
      <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
          Órbitas disponibles
        </p>
        <p className="mt-2 text-sm text-orbi-muted">
          Consulta si hay un agente Orbi cerca de ti ahora mismo.
        </p>
        {geoError && <p className="mt-2 text-xs text-red-300">{geoError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-orbi-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f7af0] disabled:opacity-60"
          >
            {loading ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation aria-hidden="true" className="h-4 w-4" />
            )}
            Usar mi ubicación
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] px-4 py-2 text-sm font-bold text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:opacity-60"
          >
            <MapPin aria-hidden="true" className="h-4 w-4" />
            Elegir en el mapa
          </button>
        </div>
      </div>
    );
  }

  // ── Map state: picking or showing results ─────────────────────────────────
  const mapCenter: [number, number] = queryPoint
    ? [queryPoint.lat, queryPoint.lng]
    : ZUMPAHUACAN;

  return (
    <div className="overflow-hidden rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.08)] backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orbi-cyan">
            Órbitas disponibles
          </p>
          {picking && !loading && (
            <p className="mt-1 text-xs text-orbi-muted">
              Toca el mapa para seleccionar tu zona.
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
              {data.available === 1 ? "1 agente disponible" : `${data.available} agentes disponibles`}
              {data.nearest_distance_bucket ? ` · ${data.nearest_distance_bucket}` : ""}
            </p>
          )}
          {!loading && data !== null && data.available === 0 && (
            <p className="mt-1 text-sm text-orbi-muted">
              No hay agentes en órbita en este momento.
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
              className="flex h-9 w-9 items-center justify-center rounded-md border border-orbi-cyan/25 bg-orbi-blue/[0.08] text-orbi-cyan transition hover:bg-orbi-blue/15 disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-orbi-muted transition hover:bg-white/10"
          >
            Cambiar zona
          </button>
        </div>
      </div>

      {/* Map */}
      <div className={`relative h-64 w-full ${picking ? "cursor-crosshair" : ""}`}>
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
          <MapUpdater center={mapCenter} />
          <ClickCatcher picking={picking} onPick={handleMapPick} />
          {queryPoint && (
            <Marker
              position={[queryPoint.lat, queryPoint.lng]}
              icon={queryIcon}
            />
          )}
          {data?.orbits.map((o, i) => (
            <Circle
              key={i}
              center={[o.lat, o.lng]}
              radius={1500}
              pathOptions={{
                color: "#36d7ff",
                fillColor: "#1f8bff",
                fillOpacity: 0.12,
                weight: 1.5,
                opacity: 0.55,
              }}
            />
          ))}
        </MapContainer>

        {picking && (
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
            className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-orbi-blue px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0f7af0]"
          >
            Poner una misión en órbita →
          </Link>
        </div>
      )}
    </div>
  );
}
