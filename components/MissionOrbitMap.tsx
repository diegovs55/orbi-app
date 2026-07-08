"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect, useRef } from "react";

export type MissionPoint = {
  lat: number;
  lng: number;
};

type MissionOrbitMapProps = {
  origin: MissionPoint | null;
  destination: MissionPoint | null;
  agent: MissionPoint | null;
  // Real driving route in [lat, lng] pairs. When present, replaces the straight-line polyline.
  routeGeometry?: [number, number][] | null;
};

const markerIcons = {
  origin:      buildIcon("origin"),
  destination: buildIcon("destination"),
  agent:       buildIcon("agent"),
};

export function MissionOrbitMap({ origin, destination, agent, routeGeometry }: MissionOrbitMapProps) {
  const center = origin ?? destination ?? agent;

  if (!center) {
    return (
      <div className="flex h-full min-h-[330px] w-full items-center justify-center rounded-md bg-orbi-blue/[0.06] text-sm text-orbi-muted">
        Ubicación no disponible
      </div>
    );
  }

  const validPoints: [number, number][] = [origin, destination, agent]
    .filter((p): p is MissionPoint => p !== null)
    .map((p) => [p.lat, p.lng]);

  // Avoid degenerate bounds when all points are the same coordinate.
  const uniquePoints = validPoints.filter(
    ([lat, lng], i) =>
      i === 0 || validPoints.some(([la, ln], j) => j < i && (la !== lat || ln !== lng))
  );
  const hasBounds = uniquePoints.length >= 2;

  // Use real driving route geometry when available; fall back to straight-line between 3 points.
  const polylinePositions: [number, number][] | null = (() => {
    if (routeGeometry && routeGeometry.length >= 2) return routeGeometry;
    if (origin && destination) {
      return [
        [origin.lat, origin.lng],
        ...(agent ? [[agent.lat, agent.lng] as [number, number]] : []),
        [destination.lat, destination.lng],
      ];
    }
    return null;
  })();

  const boundsForFit: [number, number][] =
    routeGeometry && routeGeometry.length >= 2 ? routeGeometry : validPoints;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      className="h-full min-h-[330px] w-full"
      scrollWheelZoom
      zoom={14}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {hasBounds ? <MissionMapBounds bounds={boundsForFit} /> : null}
      <AgentFollower agent={agent} />
      {polylinePositions ? (
        <Polyline
          pathOptions={{ color: "#36d7ff", opacity: 0.72, weight: 4 }}
          positions={polylinePositions}
        />
      ) : null}
      {origin ? <Marker icon={markerIcons.origin} position={[origin.lat, origin.lng]} /> : null}
      {destination ? <Marker icon={markerIcons.destination} position={[destination.lat, destination.lng]} /> : null}
      {agent ? <Marker icon={markerIcons.agent} position={[agent.lat, agent.lng]} /> : null}
    </MapContainer>
  );
}

function MissionMapBounds({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!fittedRef.current && bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [28, 28] });
      fittedRef.current = true;
    }
  }, [bounds, map]);

  return null;
}

function AgentFollower({ agent }: { agent: MissionPoint | null }) {
  const map = useMap();
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    if (agent) {
      map.flyTo([agent.lat, agent.lng], map.getZoom(), { animate: true, duration: 0.8 });
    }
  }, [agent, map]);

  return null;
}

type MarkerKind = "origin" | "destination" | "agent";

function buildIcon(kind: MarkerKind) {
  const cfg = {
    origin: {
      bg: "#7C3AED",
      label: "Negocio",
      // Store-front SVG
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 7l1-4h18l1 4H2z" opacity=".7"/>
        <path d="M3 7v1a4 4 0 008 0V7m1 0v1a4 4 0 008 0V7"/>
        <rect x="4" y="12" width="16" height="9" rx="1" opacity=".85"/>
        <rect x="9" y="14" width="6" height="7" rx="1" fill="#7C3AED"/>
      </svg>`,
      pulse: false,
      shape: "circle",
    },
    destination: {
      bg: "#16A34A",
      label: "Entrega",
      // Flag / arrival pin
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3v18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M5 4h12l-3 4 3 4H5V4z"/>
      </svg>`,
      pulse: false,
      shape: "circle",
    },
    agent: {
      bg: "#1D4ED8",
      label: "Agente",
      // Rider / person
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="6" r="3.5"/>
        <path d="M12 12c-4.5 0-7 2-7 3.5V17h14v-1.5c0-1.5-2.5-3.5-7-3.5z"/>
      </svg>`,
      pulse: true,
      shape: "circle",
    },
  } satisfies Record<MarkerKind, { bg: string; label: string; svg: string; pulse: boolean; shape: string }>;

  const { bg, label, svg, pulse } = cfg[kind];

  // Pulse ring: SVG <animate> — no CSS injection needed, safe for multiple markers
  const pulseRing = pulse
    ? `<svg style="position:absolute;top:-6px;left:-6px;width:48px;height:48px;pointer-events:none;overflow:visible">
        <circle cx="24" cy="24" r="18" fill="none" stroke="${bg}" stroke-width="2.5">
          <animate attributeName="r" from="16" to="24" dur="1.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.65" to="0" dur="1.6s" repeatCount="indefinite"/>
        </circle>
      </svg>`
    : "";

  const html = `
    <div style="position:relative;width:36px;height:52px;display:flex;flex-direction:column;align-items:center;">
      ${pulseRing}
      <div style="
        position:relative;
        width:36px;height:36px;
        background:${bg};
        border-radius:50%;
        border:2.5px solid rgba(255,255,255,0.9);
        box-shadow:0 3px 8px rgba(0,0,0,0.45),0 0 0 1px ${bg}44;
        display:flex;align-items:center;justify-content:center;
        flex-shrink:0;
      ">${svg}</div>
      <div style="
        margin-top:3px;
        background:rgba(10,12,24,0.72);
        color:#fff;
        font-size:9px;font-weight:700;
        letter-spacing:0.06em;
        padding:1px 5px;
        border-radius:4px;
        white-space:nowrap;
        backdrop-filter:blur(4px);
        pointer-events:none;
      ">${label}</div>
    </div>`;

  return L.divIcon({
    className: "",
    html,
    iconAnchor: [18, 18],   // anchor = center of circle
    iconSize:   [36, 52],
  });
}
