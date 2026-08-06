/** @type {import('next').NextConfig} */
const SUPABASE_HOST = "tkgownrugjbmugwxbkog.supabase.co";

const isMobileBuild = process.env.MOBILE_BUILD === "true";
const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.fbcdn.net",
      `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://nominatim.openstreetmap.org`,
      "font-src 'self' data:",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; "),
  },
];

// CORS headers añadidos únicamente en rutas /api/* para permitir el WebView
// nativo de Capacitor (capacitor://localhost en iOS, http://localhost en Android).
// No se usa Access-Control-Allow-Origin: * para no relajar la política web.
const corsApiHeaders = [
  { key: "Access-Control-Allow-Origin", value: "capacitor://localhost" },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
];

const nextConfig = {
  // Build móvil: static export para el bundle de Capacitor.
  // Build web: sin output (Next.js SSR/ISR en Netlify), exactamente igual que antes.
  // ignoreBuildErrors solo en build móvil: los routes de app/api/ se excluyen del export
  // porque el app iOS llama al servidor Netlify, no a rutas locales.
  ...(isMobileBuild ? {
    output: "export",
    images: { unoptimized: true },
    typescript: { ignoreBuildErrors: true },
  } : {}),

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // CORS para WebView nativo — solo /api/*
      {
        source: "/api/(.*)",
        headers: corsApiHeaders,
      },
    ];
  },
};

export default nextConfig;
