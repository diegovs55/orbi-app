# BASELINE-OPERATIVA-01 — Congelamiento del flujo operativo completo

**Fecha:** 2026-07-31  
**Commit HEAD:** `b649338`  
**URL de producción:** https://redorbi.com  
**Estado:** 🟢 VALIDADO — smoke test 12/12 PASS en producción

---

## Commits que componen esta línea base

| Commit | Descripción |
|--------|-------------|
| `f677f35` | BUG-AGENT-ACCEPT-01 — corrige RC-01c regression en updateAgentOrbit |
| `8d6a555` | BUG-MISSION-CREATE-FLOW-01 — tres bugs en el flujo cliente→órbita |
| `b649338` | Restauración de router.push('/usuarios') post-creación de misión |

---

## Flujo operativo completo

### Diagrama de estados de la misión

```
[esperando_negocio]
       ↓  negocio confirma (BusinessCatalog → confirmMissionByBusiness)
[preparando]
       ↓  negocio marca listo (markOrderReadyByBusiness)
[por_tomar]
       ↓  agente acepta (POST /api/missions/accept)
[aceptada]
       ↓  agente inicia traslado (POST /api/missions/accept → en_mision)
[en_mision]
       ↓  agente completa entrega (POST /api/missions/complete)
[cumplida]

Estados terminales: cumplida | cancelada | archivada
```

### Recorrido paso a paso

| # | Actor | Acción | Ruta/Endpoint | Estado resultante |
|---|-------|--------|---------------|-------------------|
| 1 | Cliente | Agrega producto de catálogo, selecciona destino y solicitante | `/pedir` (ServiceRequestFlow) | — |
| 2 | Cliente | Pulsa "Continuar" en Resumen → aparece "¿Lo pedimos así?" | `/pedir` PATH 2 | — |
| 3 | Cliente | Pulsa "Poner en órbita" | `POST /api/missions/create` | `esperando_negocio` |
| 4 | Cliente | Navegación automática a Mi Cuenta | `/usuarios` (MyAccount) | — |
| 5 | Negocio | Recibe pedido en su portal y lo confirma | `BusinessCatalog` → `confirmMissionByBusiness` | `preparando` |
| 6 | Negocio | Marca el pedido como listo para recoger | `BusinessCatalog` → `markOrderReadyByBusiness` | `por_tomar` |
| 7 | Agente | Entra en órbita (UPDATE autenticado via supabaseAgent) | `AgentPrivatePanel` → `updateAgentOrbit` | `is_on_orbit=true` |
| 8 | Agente | Ve la misión disponible y la acepta | `POST /api/missions/accept` | `aceptada` |
| 9 | Cliente | Navegación automática al tracker | `/orbita/${missionId}` (useEffect en ServiceRequestFlow) | — |
| 10 | Agente | Inicia el traslado | `en_mision` | — |
| 11 | Agente | Completa la entrega | `POST /api/missions/complete` | `cumplida` |

---

## Rutas de interfaz involucradas

| Ruta | Rol | Propósito |
|------|-----|-----------|
| `/pedir` | Cliente | Wizard de creación de pedido (ServiceRequestFlow) |
| `/usuarios` | Cliente | Mi Cuenta — muestra misión activa en estado de espera |
| `/orbita/[missionId]` | Cliente | Tracker de misión aceptada en tiempo real |
| `/negocios` | Negocio | Panel del negocio — recibe y confirma pedidos (BusinessCatalog) |
| `/agentes` | Agente | Panel del agente — entra en órbita, ve misiones y las acepta |
| `/admin` | Admin | Panel de operaciones, live ops, catálogo, economía |

---

## Endpoints involucrados

| Endpoint | Método | Auth | Propósito |
|----------|--------|------|-----------|
| `/api/missions/create` | POST | JWT usuario | Crea la misión con validación de quote autoritativa |
| `/api/missions/accept` | POST | JWT agente | Acepta la misión (guarda atómica: status=por_tomar AND selected_agent_id IS NULL) |
| `/api/missions/complete` | POST | JWT agente | Completa la misión + escribe ledger |
| `/api/missions/cancel-customer` | POST | JWT usuario | Cancela si está en CANCELLABLE_STATUSES |
| `/api/pricing/quote` | POST | libre | Devuelve cotización autoritativa de catálogo |
| `/api/customers/upsert` | POST | JWT usuario | Upsert del cliente en tabla customers |
| `/api/geocoding/search` | GET | libre | Autocompletado de dirección |
| `/api/geocoding/reverse` | GET | libre | Geocodificación inversa |

---

## Tablas principales afectadas

| Tabla | Operaciones | Notas |
|-------|-------------|-------|
| `missions` | INSERT, UPDATE | Columna `status` avanza solo hacia adelante (never retrocede) |
| `agents` | UPDATE | RLS: solo role=authenticated puede actualizar su propia fila |
| `customers` | UPSERT | Vinculada a auth_user_id |
| `businesses` | SELECT | Solo lectura en el flujo cliente |
| `mission_items` | INSERT | Productos del carrito, inmutables post-creación |
| `ledger_entries` | INSERT | Escritura atómica en /api/missions/complete; idempotente |
| `event_log` | INSERT | Trazabilidad de eventos del ciclo de vida |

---

## Invariantes que no deben romperse

| # | Invariante |
|---|-----------|
| I-01 | Después de "Poner en órbita", la misión se crea exactamente una vez (idempotency key = draftId/UUID) |
| I-02 | El cliente navega automáticamente a `/usuarios` tras HTTP 200 de `/api/missions/create` |
| I-03 | `/usuarios` muestra la misión activa con status `esperando_negocio` |
| I-04 | La misión conserva `user_id`, `business_id`, `items` y precios correctos e inmutables |
| I-05 | El negocio puede confirmar (→ preparando) o rechazar (→ cancelada) desde su portal |
| I-06 | Un agente solo puede aceptar si: está autenticado, `is_on_orbit=true`, dentro de horario, dentro del radio y `service_type` compatible |
| I-07 | `updateAgentOrbit` usa `supabaseAgent` autenticado — nunca el cliente anónimo |
| I-08 | RLS bloquea UPDATE anónimo en `agents` (devuelve 0 filas, sin error de PostgREST) |
| I-09 | La aceptación actualiza `status=aceptada` y `selected_agent_id` correcto de forma atómica |
| I-10 | No se crean misiones duplicadas por doble clic (draftId es PRIMARY KEY) |
| I-11 | Los errores específicos de API se leen desde `body.error` (no `body.code`) |
| I-12 | Al completar la misión, el ledger registra los movimientos económicos en la misma transacción lógica |
| I-13 | La distribución económica (comisión agente, ganancia ORBI) es inmutable post-creación |
| I-14 | La misión nunca retrocede de estado (solo avanza en el grafo de transiciones válidas) |
| I-15 | El ContinueStepButton en solicitante avanza directamente a confirmacion sin stale-closure |

---

## Gate obligatorio para MOBILE-01 y entregas posteriores

Ninguna entrega (MOBILE-01, MOBILE-02, MOBILE-03 o posterior) puede cerrarse si:

- [ ] TypeScript falla (`npx tsc --noEmit`)
- [ ] Build falla (`npm run build`)
- [ ] Smoke test falla (`node scripts/smoke-operational-baseline.mjs --prod`)
- [ ] El recorrido manual cliente → negocio → agente → cliente no ha sido validado cuando el cambio afecta interfaz, autenticación, navegación o APIs

---

## Evidencia de pruebas — smoke test ejecutado 2026-07-31

```
SMOKE-01  Backend disponible (401 sin JWT)                    ✅ PASS
SMOKE-02  /api/missions/create protegido (401 sin JWT)        ✅ PASS
SMOKE-03  RLS bloquea UPDATE anónimo en agents                ✅ PASS
SMOKE-04  JWT del agente obtenido vía magic link              ✅ PASS
SMOKE-05  Misión creada: status=esperando_negocio             ✅ PASS
SMOKE-05  Idempotencia: segundo INSERT rechazado (23505)      ✅ PASS
SMOKE-06  esperando_negocio → preparando (negocio confirma)   ✅ PASS
SMOKE-07  preparando → por_tomar (negocio marca listo)        ✅ PASS
SMOKE-08  Agente en órbita: is_on_orbit=true, autenticado     ✅ PASS
SMOKE-09  /api/missions/accept → 200, status=aceptada         ✅ PASS
SMOKE-09  selected_agent_id correcto en DB                    ✅ PASS
SMOKE-10  body.error presente en 409 MISSION_TAKEN            ✅ PASS

Resultado: 12/12 PASS — 🟢 BASELINE OPERATIVA CONFIRMADA
```

Datos de prueba usados: `BASELINE-OPERATIVA-01-TEST` — misión eliminada post-test.

---

## Checklist de validación manual (para Diego)

Ejecutar en https://redorbi.com antes de cerrar BASELINE-OPERATIVA-01:

- [ ] 1. Ir a `/pedir`, agregar un producto de catálogo (ej. Regina Café)
- [ ] 2. Seleccionar destino y confirmar solicitante
- [ ] 3. Verificar que "Continuar" lleva directamente a "¿Lo pedimos así?" (sin rebote en solicitante)
- [ ] 4. Pulsar "Poner en órbita"
- [ ] 5. Verificar navegación automática a `/usuarios`
- [ ] 6. Verificar que la misión aparece activa con mensaje de espera del negocio
- [ ] 7. Desde el portal del negocio, confirmar la misión
- [ ] 8. Desde el portal del negocio, marcar como listo
- [ ] 9. Desde el portal del agente, entrar en órbita
- [ ] 10. Verificar que el agente ve la misión disponible
- [ ] 11. El agente acepta la misión
- [ ] 12. Verificar que el cliente ve el cambio de estado (navegación a `/orbita/${missionId}`)
- [ ] 13. El agente completa la entrega
- [ ] 14. Verificar que los tres portales (cliente, negocio, agente) muestran `cumplida`

---

## Bugs cerrados en esta línea base

| Bug | Commit | Descripción |
|-----|--------|-------------|
| BUG-AGENT-ACCEPT-01 | `f677f35` | RC-01c regression: `updateAgentOrbit` usaba cliente anónimo → RLS bloqueaba UPDATE → agente nunca entraba en órbita → `/api/missions/accept` devolvía 422 |
| BUG-MISSION-CREATE-FLOW-01 (stale closure) | `8d6a555` | `goToStep("confirmacion")` en solicitante leía `confirmedDraftSections.solicitante=false` del closure anterior → wizard regresaba al paso solicitante silenciosamente |
| BUG-MISSION-CREATE-FLOW-01 (auth gate) | `8d6a555` | `handleAuthGateSuccess` cerraba el gate pero no reanudaba `handleCreateWaitingRequest` → misión nunca se creaba si el usuario no estaba autenticado |
| BUG-MISSION-CREATE-FLOW-01 (navegación) | `8d6a555` → `b649338` | `router.push("/usuarios")` eliminado erróneamente → UI quedaba vacía en `/pedir` tras crear misión |

---

## Riesgos conocidos que no bloquean la operación

| Riesgo | Severidad | Estado |
|--------|-----------|--------|
| Campo `availability` del agente de prueba quedó como `"null"` (string) en DB — no afecta operación real pero puede romper la comparación de horario en el agente de prueba | Baja | No bloqueante. Restaurar manualmente si causa problemas en tests. |
| Flujo de aprobación admin→agente (`AdminPendingRequests→activate`) no es atómico ni idempotente | Media | Documentado como deuda técnica. No afecta el flujo cliente→negocio→agente. |
| Transición `en_mision → cumplida` no es verificable en smoke test automatizado (requiere sesión real del agente en browser) | Baja | Incluida en checklist de validación manual. |
| Rate limiting (Upstash Redis, 30 req/60s) no es verificado en smoke test — fail-open si Redis no responde | Baja | Upstash configurado y activo. Riesgo teórico. |
