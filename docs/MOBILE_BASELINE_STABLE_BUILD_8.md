# MOBILE_BASELINE_STABLE — Build 8

**Fecha:** 2026-08-07
**Build iOS (TestFlight):** 1.0 (8)
**Rama:** `testflight-01`
**HEAD funcional (commit baseline):** `d8bc948`
**WEB_BASELINE_STABLE:** `e8cf6a8` (merge commit en `main`; equivalente funcional en rama: `10a4341`)
**MOBILE_BASELINE_STABLE_BUILD_7:** `d01db3c`
**Estado:** 🟢 VALIDADO — flujo completo + RESUME-SYNC-01 probados en dispositivos reales

---

## Commit nuevo respecto a Build 7

| Hash | Mensaje |
|------|---------|
| `d8bc948` | fix(ios): reconcile critical views on foreground resume ← **HEAD BUILD_8** |

## Historial completo incluido en Build 8

| Hash | Mensaje |
|------|---------|
| `d8bc948` | fix(ios): reconcile critical views on foreground resume |
| `d01db3c` | docs: MOBILE_BASELINE_STABLE_BUILD_7 — hito iOS validado en dispositivos reales |
| `38fc27c` | fix(ios): resolve business reverse geocoding via apiUrl |
| `589742b` | fix(mobile): rutas de API absolutas para WebView de Capacitor |
| `1ed64af` | fix(push): use absolute API URL for iOS token registration |
| `bd5d67d` | fix(push): PUSH-01e — corrige API del bridge Capacitor en AppDelegate.swift |
| `f80770d` | feat(push): PUSH-01e — puente FCM nativo AppDelegate→JavaScript y fix build móvil |
| `f06d7f0` | feat(push): iOS Firebase Messaging integration (PUSH-01d) |
| `e8cf6a8` | fix(push): corrige imports firebase-admin v14 en lib/push.ts ← WEB_BASELINE_STABLE |

---

## Flujo manual validado en dispositivos reales

Recorrido completo ejecutado entre app iOS (cliente), app iOS/web (negocio), app iOS/web (agente):

| # | Actor | Acción | Resultado |
|---|-------|--------|-----------|
| 1 | Cliente | Crea pedido (wizard completo) | `esperando_negocio` |
| 2 | Negocio | Recibe pedido, conserva sesión | Panel actualizado |
| 3 | Negocio | Confirma pedido | `preparando` |
| 4 | Agente | Entra en órbita | `is_on_orbit=true` |
| 5 | Agente | Acepta misión | `aceptada` |
| 6 | Cliente | Ve que el agente aceptó | Estado correcto visible |
| 7 | Multi-actor | App en background → volver a foreground | Estado reconciliado sin navegar (RESUME-SYNC-01) |

### Interoperabilidad multi-dispositivo/multi-superficie validada

Flujo ejecutado simultáneamente con actores en distintas superficies (app iOS, redorbi.com) e distintos dispositivos físicos. Los estados de misión se sincronizaron correctamente entre todas las superficies.

---

## RESUME-SYNC-01 — Reconciliación en foreground

Implementado en commit `d8bc948`. Al volver a foreground (`visibilitychange`, `document.hidden === false`), las vistas críticas ejecutan un refetch autoritativo a Supabase:

| Vista | Ruta | Función(es) | Guard |
|-------|------|-------------|-------|
| `ServiceRequestFlow` | `/pedir` | `fetchActiveMission(authUserId)` | `isReconcilingMissionRef` |
| `BusinessCatalog/PendingOrders` | `/negocios` | `load()` | — |
| `AgentPrivatePanel` | `/agente` | `refreshMissions()` + `loadAgent()` | — |
| `MissionOrbitTracker` | `/orbita/[id]` | `fetchMissionByIdAuthenticated` / `fetchActiveMissions()` + `getAgentById` | — |

**Guard de entorno:** `isNativeApp()` de `lib/native-app.ts` — listeners registrados **exclusivamente en Capacitor (iOS/Android)**. En `redorbi.com` y `localhost` el efecto es un no-op completo. WEB_BASELINE_STABLE permanece intacto.

**Semántica de `null`:** `setActiveMission(mission)` se llama siempre (incluyendo `null`), limpiando misiones stale cuando ya no existe misión activa en Supabase.

---

## Verificaciones técnicas

| Verificación | Resultado |
|---|---|
| Smoke test (`scripts/smoke-operational-baseline.mjs --prod`) | 🟢 12/12 PASS |
| Web build (`npm run build`) | ✅ Compiled successfully |
| Mobile build (`scripts/build-mobile.sh`) | ✅ Compiled + `app/api` restaurado |
| Fetch relativas `/api/...` en bundle iOS | ✅ 0 coincidencias |
| `xcodebuild` nativo (sin Archive) | ✅ BUILD SUCCEEDED |
| `[patch-package-swift]` firebase-ios-sdk | ✅ Inyectado correctamente |

---

## Capacidades confirmadas en Build 8

- ✅ Autenticación y sesiones persistentes entre reinicios (cliente, negocio, agente)
- ✅ Catálogo de negocio carga correctamente en iOS
- ✅ GPS del agente funcional en dispositivo real
- ✅ Creación y transición completa de misión
- ✅ Geocoding (search y reverse) funcional en iOS
- ✅ Interoperabilidad multi-dispositivo/multi-superficie
- ✅ **RESUME-SYNC-01:** 4 vistas reconcilian estado al volver a foreground (solo nativo)

---

## Funcionalidades no probadas todavía

- PUSH-01: verificación de registro de token en tabla `device_tokens`
- PUSH-02: envío de notificaciones push a eventos de misión (no implementado)
- Android nativo
- Flujo de cancelación de misión desde cliente
- Flujo de misión directa (`mission_type: directa`)

---

## Deuda técnica registrada

| ID | Descripción | Severidad | Estado |
|----|-------------|-----------|--------|
| DEBT-REALTIME-01 | Reconexión de WebSocket Supabase al volver a foreground no gestionada explícitamente; RESUME-SYNC-01 mitiga con refetch | Media | Pendiente |
| DEBT-REALTIME-02 | `ServiceRequestFlow` aplica `payload.new` directo sin SELECT de respaldo; payload parcial podría desincronizar | Baja | Pendiente |
| PUSH-01-PENDING | Token FCM registrado; envío a eventos de misión no conectado (PUSH-02) | Media | Pendiente de autorización |
| DEAD-CODE-01 | `AdminCatalog.tsx` líneas 1047, 1074: fetch relativas sin `apiUrl` — no importado, no alcanzable en iOS | Baja | No urgente |
| RC-01a2..f | Entregas de seguridad pendientes de autorización independiente | Variable | Pendiente |
