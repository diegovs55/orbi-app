"use client";

import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiUrl } from "@/lib/api-url";

interface PushSetupProps {
  getAccessToken: () => Promise<string | null>;
}

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

async function registerToken(
  fcmToken: string,
  getAccessToken: () => Promise<string | null>,
): Promise<void> {
  const jwt = await getAccessToken();
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

export function PushSetup({ getAccessToken }: PushSetupProps) {
  useEffect(() => {
    console.log(
      "[PUSH-JS] isNativePlatform:",
      Capacitor.isNativePlatform(),
      "platform:",
      Capacitor.getPlatform()
    );
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let listenerHandle: { remove: () => void } | null = null;
    let foregroundHandle: { remove: () => void } | null = null;
    let mounted = true;
    // Semáforo: garantiza un único registro por mount, ya sea por getToken() o por addListener.
    // Declarados aquí para que el cleanup (fuera de init) pueda cancelar los timers pendientes.
    let tokenRegistered = false;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];

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

      // Invalidación foreground: push recibido mientras la app está activa →
      // emite evento DOM para que PendingOrders llame load() sin polling.
      foregroundHandle = await PushNotifications.addListener(
        "pushNotificationReceived",
        () => {
          if (!mounted) return;
          console.log("[PUSH-JS] pushNotificationReceived → orbi:push-received");
          window.dispatchEvent(new CustomEvent("orbi:push-received"));
        }
      );

      listenerHandle = await OrbiPush.addListener("fcmToken", (data) => {
        if (!mounted) return;
        tokenRegistered = true;
        console.log("[PUSH-JS] FCM token via OrbiPushPlugin, len:", data.token.length, "prefix:", data.token.slice(0, 6));
        void registerToken(data.token, getAccessToken);
      });

      // Caso OTA / cold start: token cacheado → getToken() resuelve inmediatamente.
      // Primera instalación: Firebase aún no tiene token → getToken() rechaza.
      // En ese caso, se programan retries acotados (3s, 10s, 25s) mientras mounted === true.
      // tokenRegistered evita un segundo POST si addListener ya recibió el token antes del retry.
      try {
        const { token } = await OrbiPush.getToken();
        tokenRegistered = true;
        console.log("[PUSH-JS] getToken() directo, len:", token.length, "prefix:", token.slice(0, 6));
        void registerToken(token, getAccessToken);
        // Intento exitoso: no se programan timers.
      } catch (err) {
        console.log("[PUSH-JS] getToken() falló o token no disponible aún:", err);
        // Solo si el intento inmediato falla se programan los retries.
        for (const delay of [3000, 10000, 25000]) {
          retryTimers.push(
            setTimeout(() => {
              if (!mounted || tokenRegistered) return;
              OrbiPush.getToken()
                .then(({ token }) => {
                  if (!mounted || tokenRegistered) return;
                  tokenRegistered = true;
                  console.log("[PUSH-JS] getToken() retry ok, len:", token.length, "prefix:", token.slice(0, 6));
                  void registerToken(token, getAccessToken);
                })
                .catch((e) => {
                  console.log("[PUSH-JS] getToken() retry falló:", e);
                });
            }, delay)
          );
        }
      }
    }

    init().catch((err) => {
      console.error("[PUSH-JS] Error en init:", err);
    });

    return () => {
      mounted = false;
      foregroundHandle?.remove();
      listenerHandle?.remove();
      retryTimers.forEach(clearTimeout);
    };
  }, []);

  return null;
}
