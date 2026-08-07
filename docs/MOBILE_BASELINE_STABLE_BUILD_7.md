# MOBILE_BASELINE_STABLE — Build 7

**Fecha:** 2026-08-07
**Build iOS:** 1.0 (7)
**Rama:** `testflight-01`
**HEAD funcional probado:** `38fc27c`
**WEB_BASELINE_STABLE:** `e8cf6a8`
**Estado:** 🟢 VALIDADO — flujo completo probado en dispositivos reales

---

## Commits incluidos en Build 7

| Hash | Mensaje |
|------|---------|
| `38fc27c` | fix(ios): resolve business reverse geocoding via apiUrl |
| `589742b` | fix(mobile): rutas de API absolutas para WebView de Capacitor |
| `1ed64af` | fix(push): use absolute API URL for iOS token registration |
| `bd5d67d` | fix(push): PUSH-01e — corrige API del bridge Capacitor en AppDelegate.swift |
| `f80770d` | feat(push): PUSH-01e — puente FCM nativo AppDelegate→JavaScript y fix build móvil |
| `f06d7f0` | feat(push): iOS Firebase Messaging integration (PUSH-01d) |
| `e8cf6a8` | fix(push): corrige imports firebase-admin v14 en lib/push.ts ← WEB_BASELINE_STABLE |

---

## Flujo manual validado en dispositivos reales

Recorrido completo ejecutado entre app iOS (cliente), app iOS / web (negocio), app iOS / web (agente):

| # | Actor | Acción | Resultado |
|---|-------|--------|-----------|
| 1 | Cliente | Crea pedido (wizard completo) | Pedido creado, `esperando_negocio` |
| 2 | Negocio | Conserva sesión, recibe el pedido | Panel actualizado |
| 3 | Negocio | Confirma pedido | `preparando` |
| 4 | Agente | Conserva sesión, entra en órbita | `is_on_orbit=true` |
| 5 | Agente | Ve la misión disponible y la acepta | `aceptada` |
| 6 | Cliente | Refleja posteriormente que el agente aceptó | Estado correcto visible |

### Capacidades confirmadas

- ✅ Autenticación y sesiones persistentes entre reinicios de la app
- ✅ Catálogo de negocio carga correctamente en iOS
- ✅ GPS del agente funcional en dispositivo real
- ✅ Creación y transición completa de misión
- ✅ Geocoding (search y reverse) funcional en iOS (corregido en `589742b` y `38fc27c`)
- ✅ Interoperabilidad comprobada entre app iOS, redorbi.com y distintos dispositivos

---

## Correcciones aplicadas en Build 7 (vs Build 6)

### Problema raíz
En Capacitor WebView (`capacitor://localhost`), las llamadas `fetch("/api/...")` con URL relativa
resuelven contra `capacitor://localhost/api/...` — un scheme sin servidor real — causando fallos
silenciosos. Adicionalmente, `new URL("/api/...", window.location.origin)` lanza `SyntaxError`
en WebKit porque `capacitor://localhost` no es un scheme válido para el constructor `URL()`.

### Archivos corregidos

| Archivo | Cambio | Commit |
|---------|--------|--------|
| `components/PushSetup.tsx` | `fetch(apiUrl("/api/push/register"))` | `1ed64af` |
| `lib/admin-fetch.ts` | `fetch(url.startsWith("/") ? apiUrl(url) : url)` | `589742b` |
| `components/ServiceRequestFlow.tsx` | 4 puntos: `new URL()` → `URLSearchParams + apiUrl()` | `589742b` |
| `components/BusinessCatalog.tsx` | `fetch(apiUrl("/api/geocoding/reverse?..."))` | `38fc27c` |

### Procedimiento de build móvil
`NEXT_PUBLIC_API_BASE=https://redorbi.com` se inyecta exclusivamente en `scripts/build-mobile.sh`
y nunca en `.env.local`. En dev web, `apiUrl()` devuelve rutas relativas (comportamiento correcto).

---

## Estado conocido — deuda de sincronización visual (no es pérdida de datos)

### Comportamiento observado
Cuando una vista permanece abierta y otro dispositivo produce un cambio de estado, el cambio
no aparece automáticamente. Al cambiar de sección/vista o reentrar en la app, los datos se
refrescan y el nuevo estado aparece correctamente.

### Causa raíz
Supabase Realtime usa WebSockets. iOS suspende procesos de red cuando la app pasa a segundo plano.
El WebSocket se interrumpe y los eventos `postgres_changes` emitidos durante la suspensión no se
reciben. Al volver a primer plano, el WebSocket puede no reconectarse de inmediato.

### Conclusión confirmada
**No existe evidencia de pérdida de datos.** La información persiste correctamente en Supabase.
Lo que ocurre es que el canal Realtime no entrega el evento mientras el WebSocket está suspendido.
El estado mostrado puede quedar temporalmente stale (visual), pero el dato en base de datos es siempre correcto.

### Workaround actual
Navegar a otra sección y volver, o reentrar en la app, dispara un fetch fresco al montar el componente
y recupera el estado correcto de Supabase.

---

## Inventario de vistas afectadas por el patrón Realtime

| Componente | Vista | Mecanismo de refresco | Vulnerable a WS suspendido |
|------------|-------|-----------------------|---------------------------|
| `BusinessCatalog.tsx` | `/negocios` | Realtime `postgres_changes` + fetch en mount | Sí — mientras permanece montado |
| `AgentPrivatePanel.tsx` | `/agente` | Realtime `postgres_changes` + fetch en mount | Sí — mientras permanece montado |
| `ServiceRequestFlow.tsx` | `/pedir` | Realtime con `payload.new` directo (sin refetch) | Sí — aplica payload directo sin SELECT de respaldo |
| `MissionOrbitTracker.tsx` | `/orbita/[id]` | Realtime (2 canales: missions + agent position) | Sí — posición GPS vía payload directo |
| `AdminLiveOperations.tsx` | `/admin` | Realtime + **polling cada 8 s** | Parcialmente mitigado — poll refresca aunque WS muera |
| `AgentCards.tsx` | `/agentes` | Realtime + `visibilitychange` + `window.focus` | Mitigado — visibilitychange refresca al volver |

### Implementación de `subscribeToTableChangesWithClient`
Escucha INSERT + UPDATE + DELETE vía `postgres_changes` en la tabla indicada.
Al recibir cualquier evento llama al callback (generalmente un re-fetch a Supabase).
No hay lógica de reconexión explícita ante WS interrumpido — depende del cliente Supabase.

---

## Smoke test automático (referencia)

Ejecutado contra producción y localhost antes del Archive. 12/12 PASS.
Ver `scripts/smoke-operational-baseline.mjs` y `BASELINE_OPERATIVA_01.md`.

---

## Deuda técnica registrada

| ID | Descripción | Severidad | Estado |
|----|-------------|-----------|--------|
| DEBT-REALTIME-01 | Reconexión de WebSocket Supabase al volver a foreground no está gestionada explícitamente | Media | Pendiente de planificación |
| DEBT-REALTIME-02 | `ServiceRequestFlow` aplica `payload.new` directo sin SELECT de respaldo; un payload parcial desincronizaría el estado | Baja | Pendiente |
| PUSH-01-PENDING | Token FCM registrado en `device_tokens`, pero el envío de notificaciones a eventos de misión no está conectado (PUSH-02) | Media | Pendiente de autorización |
| DEAD-CODE-01 | `AdminCatalog.tsx` contiene 2 llamadas `fetch("/api/...")` relativas pero el componente no está importado en ninguna página | Baja | No urgente |
