"use client";

/**
 * PushSetup — PUSH-01d
 *
 * Componente silencioso (sin UI) que:
 *  1. Solicita permiso de notificaciones push al usuario.
 *  2. Llama a register() para obtener el token.
 *  3. Escucha el token FCM emitido por AppDelegate vía capacitor-plugin.
 *  4. Envía el token a POST /api/push/register autenticado con el JWT del agente.
 *
 * Solo se monta en el panel del agente autenticado.
 * No conectado a ningún flujo de misiones hasta PUSH-02.
 */

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabaseAgent } from "@/lib/supabase-agent-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function registerToken(fcmToken: string): Promise<void> {
  const { data: sessionData } = await supabaseAgent.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (!jwt) return;

  await fetch(`${API_BASE}/api/push/register`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: fcmToken,
      platform: "ios",
    }),
  });
}

export function PushSetup() {
  useEffect(() => {
    // Solo en dispositivo nativo iOS — no en web ni en Android (aún)
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let mounted = true;

    async function init() {
      // 1. Verificar / solicitar permiso
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === "denied") return;

      if (receive !== "granted") {
        const { receive: granted } = await PushNotifications.requestPermissions();
        if (granted !== "granted") return;
      }

      // 2. Registrar con APNs — Firebase intercepta el APNs token
      //    y genera el FCM token vía MessagingDelegate en AppDelegate.swift
      await PushNotifications.register();

      // 3. Escuchar el FCM token que AppDelegate reenvía vía el evento "registration"
      //    Con FirebaseMessaging activo, el evento "registration" en iOS lleva el FCM token
      const listener = await PushNotifications.addListener(
        "registration",
        async (token) => {
          if (!mounted) return;
          await registerToken(token.value);
        }
      );

      return () => {
        mounted = false;
        listener.remove();
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
