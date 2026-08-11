/**
 * lib/push.ts — PUSH-01c
 *
 * Envía notificaciones push via Firebase Cloud Messaging (FCM).
 * Solo se importa desde rutas /api/. Nunca se expone al bundle del cliente.
 *
 * No conectado a ningún flujo de misiones hasta PUSH-02.
 */

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createClient } from "@supabase/supabase-js";

// Singleton de la app de Firebase Admin (modular API — firebase-admin v14)
function getFirebaseApp() {
  if (getApps().length > 0) return getApp();

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");

  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

// Cliente Supabase con service_role para leer y actualizar device_tokens sin RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Envía una notificación push a todos los tokens FCM activos de un usuario.
 * Invalida automáticamente los tokens expirados.
 *
 * No lanza excepción si no hay tokens registrados — simplemente no envía.
 */
export async function sendPushToUser(
  auth_user_id: string,
  payload: PushPayload,
  role?: "agent" | "business" | "customer"
): Promise<void> {
  const db = getAdminClient();

  let query = db
    .from("device_tokens")
    .select("id, token")
    .eq("auth_user_id", auth_user_id)
    .eq("enabled", true)
    .eq("token_type", "fcm");
  if (role != null) query = query.eq("role", role);
  const { data: tokens, error } = await query;

  if (error) {
    console.error("[push] Error leyendo device_tokens:", error.message);
    return;
  }
  if (!tokens || tokens.length === 0) return;

  const app = getFirebaseApp();
  const messaging = getMessaging(app);

  const expiredIds: string[] = [];

  await Promise.allSettled(
    tokens.map(async ({ id, token }) => {
      try {
        await messaging.send({
          token,
          notification: { title: payload.title, body: payload.body },
          apns: {
            payload: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: "default",
                badge: 1,
              },
            },
          },
          ...(payload.data ? { data: payload.data } : {}),
        });
      } catch (err: unknown) {
        const code = (err as { errorInfo?: { code?: string } })?.errorInfo?.code ?? "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          expiredIds.push(id);
        } else {
          console.error("[push] FCM error para token", id, code);
        }
      }
    })
  );

  if (expiredIds.length > 0) {
    await db
      .from("device_tokens")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .in("id", expiredIds);
  }
}
