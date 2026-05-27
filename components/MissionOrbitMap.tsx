"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";

export type MissionPoint = {
  lat: number;
  lng: number;
};

type MissionOrbitMapProps = {
  origin: MissionPoint;
  destination: MissionPoint;
  agent: MissionPoint;
};

const markerIcons = {
  origin: createMarkerIcon("orbi-map-marker orbi-map-marker-origin"),
  destination: createMarkerIcon("orbi-map-marker orbi-map-marker-destination"),
  agent: createMarkerIcon("orbi-map-marker orbi-map-marker-agent")
};

export function MissionOrbitMap({ origin, destination, agent }: MissionOrbitMapProps) {
  const bounds: [number, number][] = [
    [origin.lat, origin.lng],
    [destination.lat, destination.lng],
    [agent.lat, agent.lng]
  ];

  return (
    <MapContainer
      center={[agent.lat, agent.lng]}
      className="h-full min-h-[330px] w-full"
      scrollWheelZoom
      zoom={14}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MissionMapBounds bounds={bounds} />
      <Polyline
        pathOptions={{ color: "#36d7ff", opacity: 0.72, weight: 4 }}
        positions={[
          [origin.lat, origin.lng],
          [agent.lat, agent.lng],
          [destination.lat, destination.lng]
        ]}
      />
      <Marker icon={markerIcons.origin} position={[origin.lat, origin.lng]} />
      <Marker icon={markerIcons.destination} position={[destination.lat, destination.lng]} />
      <Marker icon={markerIcons.agent} position={[agent.lat, agent.lng]} />
    </MapContainer>
  );
}

function MissionMapBounds({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [28, 28] });
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
