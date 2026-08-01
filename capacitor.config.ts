import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — ORBI MVP
 *
 * Arquitectura: Remote URL (WebView → redorbi.com)
 *
 * ¿Por qué Remote URL y no static export?
 * ORBI usa Next.js API routes en Netlify (/api/missions/*, /api/agents/*, etc.)
 * que no pueden ser exportados estáticamente. Con `server.url` el WebView nativo
 * carga directamente la URL de producción; las API routes, auth, RLS y JWT
 * permanecen exactamente igual sin ninguna modificación al backend.
 *
 * En desarrollo local: comentar `server.url` y usar `server.cleartext = true`
 * apuntando a la IP local (ver README de Capacitor).
 */
const config: CapacitorConfig = {
  appId: "com.redorbi.app",
  appName: "Orbi",
  webDir: "out",                // directorio de salida de next export (para builds locales)
  server: {
    url: "https://redorbi.com", // en producción: WebView apunta a la URL desplegada
    cleartext: false,           // HTTP solo en desarrollo; producción siempre HTTPS
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#05070d",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    backgroundColor: "#05070d",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // true en dev builds únicamente
  },
};

export default config;
