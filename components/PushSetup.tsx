"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabaseAgent } from "@/lib/supabase-agent-client";
import { apiUrl } from "@/lib/api-url";

// Plugin Capacitor nativo que expone el FCM token via APIs oficiales de Capacitor.
// Registrado en SceneDelegate via bridge.registerPluginInstance(OrbiPushPlugin()).
// getToken() consulta Messaging.messaging().token (determinista).
// addListener("fcmToken", ...) recibe el token cuando MessagingDelegate lo entrega.
interface OrbiPushPlugin {
  getToken(): Promise<{ token: string }>;
  addListener(
    event: "fcmToken",
    handler: (data: { token: string }) => void
  ): Promise<{ remove: () => void }>;
}

const OrbiPush = registerPlugin<OrbiPushPlugin>("OrbiPush");

function getOrCreateInstallationId(): string {
  let id = localStorage.getItem("orbi_installation_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("orbi_installation_id", id);
  }
  return id;
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
    console.log("[PUSH-JS] Token registrado correctamente");
  } else {
    console.error("[PUSH-JS] Error registrando token:", res.status);
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

    let listenerHandle: { remove: () => void } | null = null;
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

      await PushNotifications.register();
      console.log("[PUSH-JS] PushNotifications.register() completado");

      // Escuchar el FCM token via canal Capacitor oficial (notifyListeners en Swift).
      // OrbiPushPlugin.notifyFCMToken() llama notifyListeners("fcmToken", {token}) cuando
      // MessagingDelegate recibe el token de Firebase. Sin evaluateJavaScript ni CustomEvent.
      listenerHandle = await OrbiPush.addListener("fcmToken", (data) => {
        if (!mounted) return;
        console.log("[PUSH-JS] FCM token via OrbiPushPlugin, len:", data.token.length, "prefix:", data.token.slice(0, 6));
        void registerToken(data.token);
      });

      // Caso OTA / cold start: el token FCM puede estar cacheado en Firebase y
      // MessagingDelegate puede no volver a llamarse. getToken() consulta el caché directamente.
      try {
        const { token } = await OrbiPush.getToken();
        console.log("[PUSH-JS] getToken() directo, len:", token.length, "prefix:", token.slice(0, 6));
        void registerToken(token);
      } catch (err) {
        console.log("[PUSH-JS] getToken() falló o token no disponible aún:", err);
      }
    }

    init().catch((err) => {
      console.error("[PUSH-JS] Error en init:", err);
    });

    return () => {
      mounted = false;
      listenerHandle?.remove();
    };
  }, []);

  return null;
}
