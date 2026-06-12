"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";

export type MissionPoint = {
  lat: number;
  lng: number;
};

type MissionOrbitMapProps = {
  origin: MissionPoint | null;
  destination: MissionPoint | null;
  agent: MissionPoint | null;
};

const markerIcons = {
  origin: createMarkerIcon("orbi-map-marker orbi-map-marker-origin"),
  destination: createMarkerIcon("orbi-map-marker orbi-map-marker-destination"),
  agent: createMarkerIcon("orbi-map-marker orbi-map-marker-agent")
};

export function MissionOrbitMap({ origin, destination, agent }: MissionOrbitMapProps) {
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
      {hasBounds ? <MissionMapBounds bounds={validPoints} /> : null}
      {origin && destination ? (
        <Polyline
          pathOptions={{ color: "#36d7ff", opacity: 0.72, weight: 4 }}
          positions={[
            [origin.lat, origin.lng],
            ...(agent ? [[agent.lat, agent.lng] as [number, number]] : []),
            [destination.lat, destination.lng]
          ]}
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

  useEffect(() => {
    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [28, 28] });
    }
  }, [bounds, map]);

  return null;
}

function createMarkerIcon(className: string) {
  return L.divIcon({
    className: "",
    html: `<span class="${className}"></span>`,
    iconAnchor: [14, 14],
    iconSize: [28, 28]
  });
}
