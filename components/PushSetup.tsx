"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabaseAgent } from "@/lib/supabase-agent-client";
import { apiUrl } from "@/lib/api-url";

// Captura el FCM token si llega antes de que PushSetup monte (token cacheado de sesión anterior).
// AppDelegate lo entrega via window.dispatchEvent('fcmTokenReceived') al iniciar la app.
let pendingFCMToken: string | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "fcmTokenReceived",
    (e: Event) => {
      pendingFCMToken = (e as CustomEvent<{ token: string }>).detail.token;
    },
    { once: true }
  );
}

async function registerToken(fcmToken: string): Promise<void> {
  const { data: sessionData } = await supabaseAgent.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) {
    console.log("[PUSH-JS] Sin JWT activo, token no registrado");
    return;
  }
  await fetch(apiUrl("/api/push/register"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: fcmToken, platform: "ios" }),
  });
}

export function PushSetup() {
  useEffect(() => {
    console.log(
      "[PUSH-JS] isNativePlatform:",
      Capacitor.isNativePlatform(),
      "platform:",
      Capacitor.getPlatform()
    );
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let mounted = true;

    async function init() {
      const { receive } = await PushNotifications.checkPermissions();
      console.log("[PUSH-JS] checkPermissions:", receive);
      if (receive === "denied") return;

      if (receive !== "granted") {
        const { receive: granted } = await PushNotifications.requestPermissions();
        console.log("[PUSH-JS] requestPermissions result:", granted);
        if (granted !== "granted") return;
      }

      // register() dispara el intercambio APNs → FCM en AppDelegate.swift.
      // No usamos el evento "registration" de Capacitor como fuente del token FCM —
      // ese evento entrega el token APNs crudo, no el FCM token.
      await PushNotifications.register();
      console.log("[PUSH-JS] PushNotifications.register() completado");

      // Escuchar el FCM token entregado por AppDelegate via evaluateJavaScript
      function handleFCMToken(e: Event) {
        if (!mounted) return;
        const token = (e as CustomEvent<{ token: string }>).detail.token;
        console.log(
          "[PUSH-JS] FCM token recibido, len:",
          token.length,
          "prefix:",
          token.slice(0, 6)
        );
        void registerToken(token);
      }

      window.addEventListener("fcmTokenReceived", handleFCMToken);

      // Caso edge: token cacheado que llegó antes de montar el componente
      if (pendingFCMToken) {
        console.log("[PUSH-JS] pendingFCMToken encontrado, registrando");
        await registerToken(pendingFCMToken);
        pendingFCMToken = null;
      }

      return () => {
        mounted = false;
        window.removeEventListener("fcmTokenReceived", handleFCMToken);
      };
    }

    const cleanup = init();
    return () => {
      mounted = false;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  return null;
}
