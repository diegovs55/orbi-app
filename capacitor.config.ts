import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — ORBI MVP
 *
 * Arquitectura: bundle local (webDir: "out") + API calls a https://redorbi.com
 *
 * El WebView carga archivos estáticos locales generados por `next export`.
 * Las llamadas a /api/* van a https://redorbi.com via NEXT_PUBLIC_API_BASE.
 *
 * Para desarrollo con hot-reload descomenta `server.url` y `server.cleartext`.
 */
const config: CapacitorConfig = {
  appId: "com.redorbi.app",
  appName: "Orbi",
  webDir: "out",
  // server.url solo para desarrollo local con hot-reload:
  // server: {
  //   url: "http://192.168.x.x:3000",
  //   cleartext: true,
  // },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#05070d",
    allowsLinkPreview: false,
    scrollEnabled: true,
    webContentsDebuggingEnabled: true,
  },
  android: {
    backgroundColor: "#05070d",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
