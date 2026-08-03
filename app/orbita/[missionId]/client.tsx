"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { MissionOrbitTracker } from "@/components/MissionOrbitTracker";

export function OrbitaClient({ missionId }: { missionId: string }) {
  const searchParams = useSearchParams();
  // When the static placeholder "__mobile__" is the route param, the real
  // missionId is in the query string (passed by MyAccount's "Ver en mapa" link).
  const resolvedId =
    missionId !== "__mobile__"
      ? missionId
      : (searchParams.get("missionId") ?? undefined);

  useEffect(() => {
    console.log("[ORBIT_PAGE_OPEN]", { missionId: resolvedId });
  }, [resolvedId]);

  return <MissionOrbitTracker initialMissionId={resolvedId} />;
}
