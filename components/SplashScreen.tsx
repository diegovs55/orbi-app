"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { initNativeApp } from "@/lib/native-app";

/**
 * SplashScreen — superposición de carga de ORBI.
 *
 * Usa el logotipo oficial /orbi-logo.png directamente, sin reconstrucción.
 *
 * Secuencia:
 *   0 ms  — aparece (fade-in 120ms)
 * 800 ms  — pulso sutil del logo (150ms)
 * 950 ms  — fade-out (150ms)
 * 1120 ms — unmount
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"in" | "hold" | "pulse" | "out" | "gone">("in");

  useEffect(() => {
    // Inicializar capacidades nativas (SplashScreen, StatusBar, Keyboard, Back button).
    // No-op en web. hideSplashScreen() se llama aquí; los demás plugins siguen en paralelo.
    void initNativeApp();

    const t1 = setTimeout(() => setPhase("hold"),  120);
    const t2 = setTimeout(() => setPhase("pulse"), 800);
    const t3 = setTimeout(() => setPhase("out"),   950);
    const t4 = setTimeout(() => setPhase("gone"),  1120);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  if (phase === "gone") return null;

  const opacity = phase === "in" || phase === "out" ? 0 : 1;
  const scale = phase === "pulse" ? 1.045 : 1;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#05070d",
        opacity,
        transition:
          phase === "in"  ? "opacity 120ms ease-in" :
          phase === "out" ? "opacity 150ms ease-out" :
          "none",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transition: phase === "pulse" ? "transform 150ms cubic-bezier(.34,1.56,.64,1)" : "none",
        }}
      >
        <Image
          src="/orbi-logo.png"
          alt="Orbi"
          width={180}
          height={180}
          priority
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
