"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabaseAgent } from "@/lib/supabase-agent-client";
import { apiUrl } from "@/lib/api-url";

// Genera o recupera el installation_id estable de esta instalación.
// Persiste en localStorage — sobrevive reinicios y actualizaciones OTA.
// Se limpia con reinstalación completa (que también rota el FCM token).
function getOrCreateInstallationId(): string {
  let id = localStorage.getItem("orbi_installation_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("orbi_installation_id", id);
  }
  return id;
}

// Captura el FCM token si llega antes de que PushSetup monte (token cacheado de sesión anterior).
// AppDelegate lo entrega via window.dispatchEvent('fcmTokenReceived') al iniciar la app.
let pendingFCMToken: string | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "fcmTokenReceived",
    (e: Event) => {
      const token = (e as CustomEvent<{ token: string }>).detail.token;
      pendingFCMToken = token;
      // Buffer en localStorage para sobrevivir logout→login sin reinicio de app.
      localStorage.setItem("orbi_pending_fcm_token", token);
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
  const deviceId = getOrCreateInstallationId();
  const res = await fetch(apiUrl("/api/push/register"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: fcmToken, platform: "ios", device_id: deviceId }),
  });
  if (res.ok) {
    // Token registrado correctamente — limpiar buffer persistente.
    localStorage.removeItem("orbi_pending_fcm_token");
  }
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

      // Fix determinista PUSH-01b: solicitar el FCM token actual a Swift/Firebase explícitamente.
      // Firebase NO llama al MessagingDelegate en OTA updates cuando el token no cambió.
      // El WKScriptMessageHandler("orbiPush") registrado en SceneDelegate responde consultando
      // Messaging.messaging().token, que siempre devuelve el token actual (caché o Firebase).
      // try/catch con acceso directo: Terser elimina optional-chaining como dead code (pure_getters);
      // el try/catch garantiza que la llamada sobrevive al bundle de producción.
      try {
        (window as any).webkit.messageHandlers.orbiPush.postMessage({ type: "getToken" });
        console.log("[PUSH-JS] postMessage getToken enviado a Swift");
      } catch (_) {
        // no es iOS nativo (web, Android) — camino normal, no es un error
      }

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
        localStorage.setItem("orbi_pending_fcm_token", token);
        void registerToken(token);
      }

      window.addEventListener("fcmTokenReceived", handleFCMToken);

      // Caso edge: token cacheado en memoria (llegó antes de montar)
      if (pendingFCMToken) {
        console.log("[PUSH-JS] pendingFCMToken en memoria, registrando");
        await registerToken(pendingFCMToken);
        pendingFCMToken = null;
      } else {
        // Caso edge: token guardado en localStorage (sobrevivió logout→login sin reinicio de app)
        const storedToken = localStorage.getItem("orbi_pending_fcm_token");
        if (storedToken) {
          console.log("[PUSH-JS] orbi_pending_fcm_token en localStorage, registrando");
          await registerToken(storedToken);
        }
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
