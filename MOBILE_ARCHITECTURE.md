# ORBI Mobile — Arquitectura definitiva (MOBILE-01B-BASELINE)

Tag: `MOBILE-01B-BASELINE` | Branch: `mobile-01b-static-export`

---

## Decisión arquitectónica

**Patrón elegido:** Bundle local + API remota

El WebView de Capacitor carga páginas estáticas desde el bundle local (`out/`),
generado por `next export`. Todas las llamadas a `/api/*` van a `https://redorbi.com`
mediante URLs absolutas bakeadas en el bundle.

**Por qué no `server.url`:** El enfoque `server.url: "https://redorbi.com"` fue
descartado — es un thin WebView sin activos locales, con riesgo de rechazo en
App Store (Guideline 4.2, Minimum Functionality).

---

## Archivos clave

| Archivo | Propósito |
|---|---|
| `capacitor.config.ts` | Config de Capacitor. `webDir: "out"`. Sin `server.url`. |
| `next.config.mjs` | `output:"export"` activado solo con `MOBILE_BUILD=true` |
| `lib/api-url.ts` | Helper único `apiUrl(path)` — NO concatenar directamente `NEXT_PUBLIC_API_BASE` |
| `lib/types/admin-intelligence.ts` | Tipos compartidos de admin (extraídos de route files) |
| `scripts/build-mobile.sh` | Comando único para build móvil completo |
| `app/orbita/[missionId]/page.tsx` | Server component con `generateStaticParams` |
| `app/orbita/[missionId]/client.tsx` | Client component — renderiza `MissionOrbitTracker` |

---

## Variables de entorno

| Variable | Web build | Mobile build |
|---|---|---|
| `MOBILE_BUILD` | no seteada | `true` |
| `NEXT_PUBLIC_API_BASE` | no seteada (paths relativos) | `https://redorbi.com` |

**Regla:** `NEXT_PUBLIC_API_BASE` debe estar vacía en web (el browser resuelve
contra el origen actual). En móvil, debe ser `https://redorbi.com` para que el
WebView local resuelva correctamente las rutas de API.

---

## Comandos

```bash
# Build web (producción Netlify — sin cambios respecto al flujo anterior)
npm run build

# Build móvil (genera out/ para Capacitor)
bash scripts/build-mobile.sh

# Sincronizar bundle con iOS y Android
npx cap sync

# Abrir en Xcode (iOS)
npx cap open ios

# Abrir en Android Studio
npx cap open android
```

---

## Cómo funciona `apiUrl()`

```typescript
// lib/api-url.ts
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  return `${base}${path}`;
}
```

- **Web:** `NEXT_PUBLIC_API_BASE` está vacía → `apiUrl("/api/missions/create")` → `"/api/missions/create"` (relativo al origen actual, redorbi.com)
- **Móvil:** `NEXT_PUBLIC_API_BASE=https://redorbi.com` → `apiUrl("/api/missions/create")` → `"https://redorbi.com/api/missions/create"` (absoluto)

**Regla permanente:** Todo `fetch` a `/api/*` DEBE usar `apiUrl()`. Nunca concatenar
`NEXT_PUBLIC_API_BASE` directamente fuera de `lib/api-url.ts`.

---

## Fetch migrados (13 en total)

| Archivo | Endpoint |
|---|---|
| `lib/missions.ts` | `/api/missions/create`, `/api/missions/complete`, `/api/missions/cancel-customer` |
| `lib/customers.ts` | `/api/customers/upsert` |
| `lib/agents.ts` | `/api/agents/delete` |
| `lib/catalog.ts` | `/api/businesses/update-profile` |
| `lib/routing.ts` | `/api/routing/route` |
| `components/AdminAccessGate.tsx` | `/api/admin/verify` |
| `components/ServiceRequestFlow.tsx` | `/api/pricing/quote` (×2), `/api/intention-logs` |
| `components/AgentPrivatePanel.tsx` | `/api/config/motor-params`, `/api/missions/accept` |

---

## Ruta dinámica `/orbita/[missionId]`

**Problema:** `output:"export"` requiere `generateStaticParams` en rutas dinámicas.
No es posible enumerar UUIDs de misiones en build time.

**Solución:** `generateStaticParams` retorna `[{missionId: "__mobile__"}]` — genera
un único HTML de placeholder. La navegación real ocurre siempre via `router.push()`
desde dentro de la app (client-side), no mediante carga directa de URL.

**Limitación conocida:** Deep links directos a `/orbita/<uuid>` no funcionan en
el bundle estático. No está planificado para este MVP.

---

## Cómo funciona el build script

`scripts/build-mobile.sh`:

1. Mueve `app/api/` fuera del árbol de Next.js (a `/tmp/`)
2. Limpia `.next/` para evitar cache
3. Ejecuta `MOBILE_BUILD=true NEXT_PUBLIC_API_BASE=https://redorbi.com npm run build`
4. Restaura `app/api/` via `trap EXIT` (garantizado incluso si el build falla)

**Por qué se mueve `app/api/`:** Con `output:"export"`, Next.js intenta pre-renderizar
todos los route handlers, pero los handlers de ORBI acceden a `request.headers`,
`request.url`, etc. — valores dinámicos incompatibles con la generación estática.
El bundle móvil no necesita esos archivos; llama a `https://redorbi.com/api/*`.

**Por qué no se modifican los route handlers:** Los tipos exportados por algunos
route files son importados por componentes. Solución: tipos migrados a
`lib/types/admin-intelligence.ts` y a `lib/routing/server`. Los route files
permanecen intactos.

---

## CORS

Configurado en `next.config.mjs` para el build web (producción Netlify):

```javascript
// Solo en /api/* — origins exactos, nunca *
{ key: "Access-Control-Allow-Origin", value: "capacitor://localhost" }  // iOS
// Android usa http://localhost (el servidor debe ser configurado por separado si aplica)
```

**Nota:** Las cabeceras `headers()` de Next.js NO aplican en `output:"export"`.
Son efectivas únicamente en el build web (servidor Netlify/Node.js).

---

## Invariantes permanentes de MOBILE-01B

1. `server.url` nunca debe activarse para producción — solo para dev local con hot-reload
2. `apiUrl()` es el único punto de construcción de URLs de API
3. `NEXT_PUBLIC_API_BASE` vacía = web; `https://redorbi.com` = móvil
4. Todo fetch nuevo a `/api/*` debe pasar por `apiUrl()`
5. El build script siempre restaura `app/api/` — nunca debe quedar movido
6. No implementar GPS, Push ni Deep Links hasta autorización explícita

---

## Plugins nativos pendientes (NO implementar aún)

- GPS / Geolocalización nativa
- Push Notifications
- Deep Links / App Links
- Biometría
- Cualquier otro plugin de Capacitor

**Gate de entrada para plugins:** merge de `mobile-01b-static-export` a `main`,
autorizado por Diego, después de validación manual en simulador/dispositivo real.
