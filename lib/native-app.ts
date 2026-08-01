/**
 * lib/native-app.ts — Inicialización de capacidades nativas de Capacitor.
 *
 * Este módulo centraliza toda la configuración nativa que debe ejecutarse
 * UNA SOLA VEZ al arrancar la app en dispositivo. En web (browser normal)
 * todas las funciones son no-ops seguros.
 *
 * Fases cubiertas:
 *   Phase 4 — SplashScreen nativo (ocultar después de primer render)
 *   Phase 5 — Safe Areas (padding via CSS env variables — configurado en globals.css)
 *   Phase 6 — Keyboard (ajuste de viewport al abrir teclado)
 *   Phase 7 — Botón Back de Android (interceptar para navegar o cerrar)
 *   Phase 8 — Browser.open para WhatsApp y links externos
 */

import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";

// ── Detección ─────────────────────────────────────────────────────────────────

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroid(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function isIos(): boolean {
  return Capacitor.getPlatform() === "ios";
}

// ── Phase 4 — SplashScreen ───────────────────────────────────────────────────

/**
 * Oculta el SplashScreen nativo con fade-out.
 * Debe llamarse después de que React haya completado el primer render.
 * En web es un no-op.
 */
export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 300 });
  } catch {
    // SplashScreen ya oculta o no disponible — no es error crítico
  }
}

// ── Phase 5 — StatusBar (Safe Areas) ─────────────────────────────────────────

/**
 * Configura la StatusBar nativa con el tema oscuro de ORBI.
 * Las safe areas del sistema ya están expuestas como env(safe-area-inset-*)
 * por Capacitor; globals.css las consume con padding-top/bottom.
 * En web es un no-op.
 */
export async function configureStatusBar(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: "#05070d" });
    }
  } catch {
    // StatusBar no disponible en este dispositivo
  }
}

// ── Phase 6 — Keyboard ───────────────────────────────────────────────────────

let _keyboardListeners: PluginListenerHandle[] = [];

/**
 * Configura el comportamiento del teclado virtual nativo.
 * - En iOS: el WebView se redimensiona (resizeOnFullScreen=false en capacitor.config.ts)
 * - En Android: mantenemos el resize nativo del sistema
 * Aplica/quita clase CSS `keyboard-open` en <body> para que los estilos
 * puedan ajustar los elementos flotantes (ej. botones de acción inferiores).
 * En web es un no-op.
 */
export async function setupKeyboard(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");

    const showHandle = await Keyboard.addListener("keyboardWillShow", () => {
      document.body.classList.add("keyboard-open");
    });
    const hideHandle = await Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("keyboard-open");
    });

    _keyboardListeners = [showHandle, hideHandle];
  } catch {
    // Keyboard plugin no disponible
  }
}

export async function teardownKeyboard(): Promise<void> {
  for (const h of _keyboardListeners) {
    await h.remove();
  }
  _keyboardListeners = [];
}

// ── Phase 7 — Botón Back de Android ─────────────────────────────────────────

let _backButtonHandle: PluginListenerHandle | null = null;

/**
 * Intercepta el botón Back de Android.
 * - Si hay historial de navegación → retrocede (window.history.back())
 * - Si estamos en la raíz → minimiza la app (no la cierra)
 * Solo se activa en Android nativo. En iOS y web es un no-op.
 */
export async function setupAndroidBackButton(): Promise<void> {
  if (!isNativeApp() || !isAndroid()) return;
  try {
    const { App } = await import("@capacitor/app");

    _backButtonHandle = await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.minimizeApp();
      }
    });
  } catch {
    // App plugin no disponible
  }
}

export async function teardownAndroidBackButton(): Promise<void> {
  if (_backButtonHandle) {
    await _backButtonHandle.remove();
    _backButtonHandle = null;
  }
}

// ── Phase 8 — Browser.open para links externos (WhatsApp, etc.) ──────────────

/**
 * Abre una URL en el navegador in-app nativo de Capacitor (SFSafariViewController
 * en iOS, Chrome Custom Tab en Android) en lugar del WebView del sistema.
 *
 * Uso:
 *   await nativeOpenUrl("https://wa.me/521234567890?text=Hola");
 *
 * En web delega a window.open.
 */
export async function nativeOpenUrl(url: string): Promise<void> {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    // Fallback por si Browser.open falla
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// ── Inicialización completa ───────────────────────────────────────────────────

/**
 * Punto de entrada único. Llamar desde el root layout o el primer componente
 * cliente que se monta tras el splash.
 *
 * El orden importa:
 *   1. hideSplashScreen  — primero, para no bloquear la UI
 *   2. configureStatusBar — safe areas ya disponibles al renderizar
 *   3. setupKeyboard      — antes de que el usuario pueda interactuar
 *   4. setupAndroidBackButton — antes de cualquier navegación
 */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  await hideSplashScreen();
  await configureStatusBar();
  await setupKeyboard();
  await setupAndroidBackButton();
}
