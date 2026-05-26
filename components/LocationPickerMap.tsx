"use client";

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

type MapPoint = {
  lat: number;
  lng: number;
};

type LocationPickerMapProps = {
  point: MapPoint;
  onPointChange: (point: MapPoint) => void;
};

const markerIcon = L.divIcon({
  className: "",
  html: '<span class="orbi-map-marker"></span>',
  iconAnchor: [14, 14],
  iconSize: [28, 28]
});

export function LocationPickerMap({ point, onPointChange }: LocationPickerMapProps) {
  return (
    <MapContainer
      center={[point.lat, point.lng]}
      className="h-full min-h-[320px] w-full"
      scrollWheelZoom
      zoom={15}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapCenter point={point} />
      <LocationMapEvents onPointChange={onPointChange} />
      <Marker
        draggable
        eventHandlers={{
          dragend: (event) => {
            const marker = event.target as L.Marker;
            const nextPoint = marker.getLatLng();
            onPointChange({ lat: nextPoint.lat, lng: nextPoint.lng });
          }
        }}
        icon={markerIcon}
        position={[point.lat, point.lng]}
      />
    </MapContainer>
  );
}

function MapCenter({ point }: { point: MapPoint }) {
  const map = useMap();

  useEffect(() => {
    map.setView([point.lat, point.lng], map.getZoom(), { animate: true });
  }, [map, point.lat, point.lng]);

  return null;
}

function LocationMapEvents({ onPointChange }: Pick<LocationPickerMapProps, "onPointChange">) {
  useMapEvents({
    click(event) {
      onPointChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });

  return null;
}
