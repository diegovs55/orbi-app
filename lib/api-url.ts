/**
 * apiUrl — helper central para rutas de API.
 *
 * Web (npm run build):
 *   NEXT_PUBLIC_API_BASE no está definida → paths relativos (/api/...)
 *   El browser resuelve contra el origen actual (redorbi.com).
 *
 * App móvil (MOBILE_BUILD=true npm run build):
 *   NEXT_PUBLIC_API_BASE=https://redorbi.com → paths absolutos
 *   El WebView local no tiene origen propio; los fetch deben ser absolutos.
 *
 * Uso:
 *   fetch(apiUrl("/api/missions/create"), { ... })
 *
 * No concatenar manualmente NEXT_PUBLIC_API_BASE fuera de este módulo.
 */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  return `${base}${path}`;
}
