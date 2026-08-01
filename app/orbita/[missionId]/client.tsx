"use client";

import { MissionOrbitTracker } from "@/components/MissionOrbitTracker";

export function OrbitaClient({ missionId }: { missionId: string }) {
  return <MissionOrbitTracker initialMissionId={missionId} />;
}
