"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getGpsState, subscribeGpsState } from "@/lib/gps-state";
import type { GpsStatus } from "@/lib/gps-state";

// ── useSyncExternalStore adapter ──────────────────────────────────────────────

function subscribe(cb: () => void) {
  return subscribeGpsState(cb);
}
function getSnapshot() {
  return getGpsState();
}
// SSR snapshot — GPS always unknown on server
function getServerSnapshot() {
  return { status: "unknown" as GpsStatus, position: null, errorMessage: null };
}

// ── Visual config per status ──────────────────────────────────────────────────

type PillConfig = {
  dot: string;      // Tailwind color class for the animated dot
  label: string;
  pulse: boolean;
};

const CONFIG: Record<GpsStatus, PillConfig> = {
  unknown:        { dot: "bg-white/30",      label: "GPS",               pulse: false },
  searching:      { dot: "bg-yellow-400",    label: "Buscando señal…",   pulse: true  },
  active:         { dot: "bg-green-400",     label: "GPS activo",        pulse: false },
  "no-permission": { dot: "bg-red-400",      label: "Sin permiso GPS",   pulse: false },
  disabled:       { dot: "bg-orange-400",    label: "GPS apagado",       pulse: true  },
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  /** Show GPS coordinates when active. Default: false. */
  showCoords?: boolean;
  className?: string;
};

export function GpsStatusPill({ showCoords = false, className = "" }: Props) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const cfg = CONFIG[state.status];

  // Keep a stable reference so the pill doesn't flicker during re-renders
  const coords =
    showCoords && state.status === "active" && state.position
      ? `${state.position.lat.toFixed(5)}, ${state.position.lng.toFixed(5)}`
      : null;

  return (
    <span
      role="status"
      aria-label={`Estado GPS: ${cfg.label}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "text-xs font-medium text-white/80",
        "border border-white/10 bg-white/5",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "h-2 w-2 rounded-full flex-shrink-0",
          cfg.dot,
          cfg.pulse ? "animate-pulse" : "",
        ].join(" ")}
      />
      <span>{cfg.label}</span>
      {coords && (
        <span className="ml-1 text-white/50 font-mono">{coords}</span>
      )}
    </span>
  );
}

// Re-export type for convenience
export type { GpsStatus };
