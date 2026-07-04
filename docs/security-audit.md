# ORBI — Historial Oficial de Auditorías de Seguridad

Documento vivo. Se actualiza al cierre de cada sprint de seguridad.

---

## Auditoría Completa de Rutas API

Fecha de auditoría inicial: 2026-07-03
Auditada en: Sprint 1.1

| Ruta | Clasificación | Riesgo | Estado | Sprint | Notas |
|------|---------------|--------|--------|--------|-------|
| `GET /api/admin/verify` | Admin | 🟡 MEDIO | ✅ Protegida | 1.2 | `assertAdminJWT` — valida JWT y email en `ADMIN_EMAILS` |
| `POST /api/agents/activate` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — activación de agente requiere admin |
| `POST /api/agents/reset-access` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — reset de acceso requiere admin |
| `POST /api/businesses/activate` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — activación de negocio requiere admin |
| `POST /api/businesses/reset-access` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — reset de acceso requiere admin |
| `POST /api/businesses/set-email` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — cambio de email requiere admin |
| `PATCH /api/businesses/update-profile` | Negocio | 🟡 MEDIO | ⚠️ Pendiente | — | Sin validación de ownership por negocio. Ruta compartida con flujo de auto-edición del negocio (`lib/catalog.ts:624`). No se puede proteger con `assertAdminJWT` sin romper ese flujo. Registrado P2 para Sprint futuro. |
| `POST /api/customers/activate` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — activación de cliente requiere admin |
| `GET /api/customers/list` | Admin | 🔴 ALTO | ✅ Protegida | 1.3 | `assertAdminJWT` — expone PII completo de clientes (nombre, teléfono, email, total gastado) |
| `POST /api/customers/upsert` | Público | 🔴 ALTO | ✅ Protegida | 1.5 | `auth_user_id` eliminado del body aceptado. Solo se preserva el valor existente en BD. Nunca se acepta del caller. PoC: 4 vectores, todos retornan `auth_user_id=null`. |
| `GET /api/ledger/summary` | Admin | 🔴 ALTO | ✅ Protegida | 1.3 | `assertAdminJWT` — expone GMV, comisión ORBI, pagos agentes/negocios |
| `POST /api/missions/cancel-customer` | Público | 🟡 MEDIO | ⚠️ Pendiente | — | Sin verificación de ownership del cliente. Aceptable en MVP anónimo. Registrado P2 para cuando clientes tengan autenticación. |
| `POST /api/missions/complete` | Agente | 🔴 ALTO | ✅ Protegida | 1.4 | JWT Bearer obligatorio + `admin.auth.getUser` server-side + `agents.auth_user_id` ownership check. Sin token → 401. JWT ajeno → 403. Agente no asignado a la misión → 409. |
| `POST /api/missions/create` | Público | 🟢 BAJO | ✅ Corregida | 1.2 | Corrección BLOQUEANTE-2: `business_id` requerido para misiones de catálogo (antes aceptaba null, causaba corrupción de datos) |
| `GET /api/requests/list` | Admin | 🔴 ALTO | ✅ Protegida | 1.3 | `assertAdminJWT` — expone PII de solicitantes (nombre, email, teléfono, mensaje) |
| `POST /api/requests/update` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — modificación de solicitudes requiere admin |
| `DELETE /api/requests/delete` | Admin | 🔴 ALTO | ✅ Protegida | 1.2 | `assertAdminJWT` — eliminación de solicitudes requiere admin |
| `GET /api/routing/*` | Interno | 🟡 MEDIO | 🔍 Pendiente revisión | — | No auditado en profundidad. Clasificar en Sprint 1.6. |

---

## Resumen por Estado

| Estado | Cantidad |
|--------|----------|
| ✅ Protegida / Corregida | 12 |
| ⚠️ Pendiente (registrado) | 4 |
| 🔍 Pendiente revisión | 1 |

---

## Historial de Sprints de Seguridad

### Sprint 1.1 — Auditoría Inicial
- Fecha: 2026-07-03
- Resultado: Auditoría completa de 18 rutas. Clasificadas por riesgo. Se identificaron 3 rutas 🔴 ALTO sin protección y 3 bloqueantes críticos.

### Sprint 1.2 — Corrección de Bloqueantes Críticos
- Fecha: 2026-07-03
- Commits: `fa1bdd5`, `b22d752`
- Correcciones:
  - **B-1** `assertAdminJWT` aplicado a 9 rutas admin (`agents/activate`, `agents/reset-access`, `businesses/activate`, `businesses/reset-access`, `businesses/set-email`, `customers/activate`, `requests/update`, `requests/delete`, `admin/verify`)
  - **B-2** `missions/create` — guard para `business_id` null en misiones de catálogo
  - **B-3** `businesses/update-profile` — eliminado `status: "activo"` forzado en PATCH
- PoC verificado: todas las rutas admin retornan 401 sin token válido.
- TypeScript: 0 errores. E2E: 52/52 + 105/105 ✅

### Sprint 1.3 — Cierre de Rutas Críticas
- Fecha: 2026-07-03
- Commit: `3be419d`
- Correcciones:
  - `GET /api/customers/list` — `assertAdminJWT` + `adminFetch` en `AdminCustomers`, `lib/customers.ts`
  - `GET /api/ledger/summary` — `assertAdminJWT` + `adminFetch` en `AdminNetworkEconomy`
  - `GET /api/requests/list` — `assertAdminJWT` + `adminFetch` en `AdminLiveOperations`, `AdminPendingRequests`
- PoC verificado: 3/3 rutas → HTTP 401 sin token, HTTP 401 con token inválido.
- TypeScript: 0 errores. E2E: 52/52 + 105/105 ✅

---

### Sprint 1.4 — Ownership y autenticación del agente
- Fecha: 2026-07-03
- Commit: `2b67153`
- Correcciones:
  - **P1** `POST /api/missions/complete` — JWT Bearer obligatorio: `admin.auth.getUser(token)` server-side obtiene `callerUid`; query `agents WHERE id=agent_id AND auth_user_id=callerUid` verifica que el caller sea el agente declarado. El guard existente `.eq("selected_agent_id", agent_id)` verifica que ese agente sea el asignado a la misión.
- PoC verificado: 4 vectores de ataque, todos bloqueados. Ledger = 0 en todos los ataques.
- TypeScript: 0 errores. E2E: 52/52 ✅

### Sprint 1.5 — Permisos y consistencia
- Fecha: 2026-07-03
- Commit: `bb7fa94`
- Correcciones:
  - **P1** `POST /api/customers/upsert` — eliminado `auth_user_id` del tipo del body. La expresión `body.auth_user_id ?? existing?.auth_user_id ?? null` reemplazada por `existing?.auth_user_id ?? null`. El campo es ahora exclusivamente server-side.
- PoC verificado: 4 vectores (UID arbitrario, UID ajeno, omitir, campos inesperados) → `auth_user_id=null` en todos los casos. Ninguno modifica el campo.
- TypeScript: 0 errores. E2E: 52/52 ✅

## Pendientes Registrados (futuros sprints)

| Prioridad | Ruta | Vulnerabilidad | Sprint objetivo |
|-----------|------|----------------|-----------------|
| ~~P1~~ | ~~`POST /api/missions/complete`~~ | ~~Agente no autenticado puede cerrar cualquier misión~~ | ✅ Corregido en 1.4 |
| ~~P1~~ | ~~`POST /api/customers/upsert`~~ | ~~`auth_user_id` aceptado del caller → account takeover~~ | ✅ Corregido en 1.5 |
| P2 | `PATCH /api/businesses/update-profile` | Sin ownership validation — separar ruta admin de ruta negocio | 1.5 |
| P2 | `POST /api/missions/cancel-customer` | Sin ownership del cliente (aceptable en MVP anónimo) | 1.5+ |
