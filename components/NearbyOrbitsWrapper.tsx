"use client";

import dynamic from "next/dynamic";

// react-leaflet requires browser globals — ssr: false must live in a Client Component
const NearbyOrbitsPreview = dynamic(
  () => import("@/components/NearbyOrbitsPreview").then((m) => m.NearbyOrbitsPreview),
  { ssr: false },
);

export function NearbyOrbitsWrapper() {
  return <NearbyOrbitsPreview />;
}
