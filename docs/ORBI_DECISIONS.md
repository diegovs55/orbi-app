# ORBI — Decisiones de Arquitectura

> **Versión:** 2026-07-09  
> **Propósito:** Registro cronológico de todas las decisiones arquitectónicas relevantes del proyecto.  
> Cada decisión documentada aquí tiene el mismo peso que código. No se revierte sin aprobación explícita del owner.

---

## DA-001: Confirm email permanentemente OFF

**Fecha:** Sprint inicial  
**Problema:** Con "Confirm email" ON en Supabase, un usuario que se registra durante el flujo de pedido necesita interrumpir el proceso para verificar su correo antes de poder continuar. Esto destruye la experiencia del flujo.  
**Alternativas evaluadas:**
- Confirm email ON: flujo limpio en teoría, pero disruptivo en práctica
- Magic link por correo: require múltiples pasos
- OTP por SMS: costo adicional, complejidad de integración
- Confirm email OFF: el usuario opera inmediatamente tras registro

**Decisión:** Confirm email **permanentemente OFF** en el proyecto Supabase de ORBI.  
**Razón:** ORBI opera en comunidades donde la confianza es social, no verificada por email. El flujo debe ser ininterrumpido. La verificación se puede agregar en el futuro sin romper la arquitectura.  
**Impacto técnico:** `supabase.auth.signUp()` puede devolver `null` en `data.user` (sin error) cuando el email ya existe. ORBI detecta esto como un email duplicado y muestra mensaje claro.  
**Nunca revertir sin:**
- Diseño completo del flujo interrumpido
- Verificación de que el draft sobrevive la interrupción
- Aprobación explícita de Diego

---

## DA-002: auth_user_id como única identidad

**Fecha:** Sprint de estabilización  
**Problema:** ORBI acumuló customers duplicados. Un mismo usuario con nombre y teléfono ligeramente diferentes tenía múltiples registros. Un agente (Nicolás) tenía cinco misiones en distintos customers.  
**Alternativas evaluadas:**
- Identificación por teléfono: normalización difícil, puede duplicarse
- Identificación por correo: coincidencias entre personas distintas posibles
- Identificación por device fingerprint: no funciona entre dispositivos
- `auth_user_id` (UUID Supabase Auth): único, verificado, no transferible

**Decisión:** `auth_user_id` es la **única** identidad válida del cliente. Sin backfill por teléfono. Sin backfill por correo. Sin usuarios anónimos.  
**Razón:** Es el único identificador que Supabase garantiza que es único, pertenece a una sola persona, y no puede duplicarse.  
**Impacto técnico:** 
- Customers sin `auth_user_id` no son linked a ninguna cuenta
- La vinculación requiere autenticación real, no coincidencia de datos
- Los pedidos históricos sin `auth_user_id` permanecen como están (no se backfillean)

---

## DA-003: Sin usuarios anónimos

**Fecha:** Sprint de estabilización (junto a DA-002)  
**Problema:** Los usuarios anónimos creaban estados inconsistentes. Cuando un anónimo se registraba, la "migración" de misiones era propensa a bugs de identidad.  
**Alternativas evaluadas:**
- Anónimos con upgrade automático: complejo, propenso a duplicados
- Anónimos sin upgrade (misiones sin dueño): imposible hacer seguimiento
- Sin anónimos: el cliente hace pedidos sin cuenta, solo ve AuthGate al momento de crear la misión

**Decisión:** No existen usuarios anónimos en ORBI.  
**Razón:** El cliente puede explorar el flujo completo sin cuenta. El AuthGate solo aparece cuando es estrictamente necesario (al crear la misión). No hay necesidad de un estado "anónimo" intermedio.  
**Impacto técnico:**
- No se crean sesiones anónimas en Supabase Auth
- No hay lógica de "upgrading" de sesión anónima a registrada
- El `guest_id` en `missions` es un UUID local (sin cuenta asociada), no una sesión anónima de Supabase

---

## DA-004: La misión solo se crea al presionar "Poner en órbita"

**Fecha:** Sprint de estabilización (post-bug crítico)  
**Problema:** Una versión anterior de `handleAuthGateSuccess` llamaba a `createMission()` automáticamente después de registrar una cuenta. Esto creaba misiones sin confirmación explícita del usuario, sin que el usuario pudiera revisar el resumen.  
**Alternativas evaluadas:**
- Crear misión automáticamente post-auth: conveniente pero sin confirmación
- Mostrar resumen post-auth antes de crear: dos pasos, UX más clara
- Crear misión solo al presionar botón explícito: requiere que el usuario tome acción consciente

**Decisión:** `handleAuthGateSuccess` NUNCA llama `createMission()`. La creación de misión es siempre y únicamente una acción explícita del usuario al presionar "Poner en órbita" (o "Seguir esperando" en el flujo sin agente).  
**Razón:** El usuario debe revisar el resumen completo del pedido antes de confirmarlo. La autenticación y la creación de misión son dos eventos independientes.  
**Impacto técnico:**
- `handleAuthGateSuccess` solo actualiza estado local: `setAuthUserId`, `setShowAuthGate(false)`, `saveCustomerSession`
- Después de autenticarse, el flujo regresa al botón de confirmación
- Ningún efecto de React puede llamar `createMission()`

**Esta decisión NUNCA se revierte.** Cualquier cambio que haga `handleAuthGateSuccess` llamar `createMission()` directa o indirectamente es un bug crítico.

---

## DA-005: draftId === idempotencyKey

**Fecha:** Sprint de idempotencia  
**Problema:** Sin idempotencia, un retry por timeout de red podía crear dos misiones idénticas. El usuario presionaba "Poner en órbita", la red fallaba antes de recibir respuesta, y al volver a presionar se creaba una segunda misión.  
**Alternativas evaluadas:**
- UUID generado al presionar el botón: no protege contra el mismo press dos veces
- Token de sesión del browser: no persiste entre recargas
- `draftId` como idempotency key: persiste en localStorage, sobrevive recargas

**Decisión:** El `draftId` (generado al primer auto-save del draft) es el mismo UUID que viaja como campo `id` al crear la misión. El backend verifica si ya existe una misión con ese `id` antes de hacer INSERT.  
**Razón:** El draft persiste mientras la misión no se confirma. Si la misión ya existe con ese ID, el backend la devuelve sin crear un duplicado.  
**Impacto técnico:**
- `createMission({ id: draftId })` en `handleSendMissionToAgent` y `handleCreateWaitingRequest`
- El draft se limpia SOLO después de confirmar el éxito de la creación
- El backend en `/api/missions/create` siempre hace el check de idempotencia primero

---

## DA-006: Cuatro clientes Supabase aislados por storageKey

**Fecha:** Sprint inicial  
**Problema:** Un agente logueado en el mismo browser que un cliente causaba conflictos: la sesión de Supabase se sobreescribía.  
**Alternativas evaluadas:**
- Un solo cliente con lógica de roles: conflictos inevitables de sesión
- JWT custom con roles: complejidad adicional significativa
- Cuatro instancias con storageKey diferente: aislamiento total, implementación simple

**Decisión:** Cuatro instancias del cliente Supabase JS, cada una con su propia `storageKey` y su propio storage (localStorage o sessionStorage).  
**Razón:** El aislamiento es completo y a prueba de bugs. No requiere lógica de roles en el cliente.  
**Impacto técnico:**
- `sb-orbi-user` (localStorage) → clientes
- `sb-orbi-agent` (localStorage) → agentes
- `sb-orbi-business` (localStorage) → negocios
- `sb-orbi-admin` (sessionStorage) → admin (no persiste al cerrar pestaña)

---

## DA-007: El servidor es la única autoridad para precios financieros

**Fecha:** Sprint de pricing  
**Problema:** Si el cliente puede enviar precios, puede manipularlos.  
**Decisión:** El backend recalcula todos los campos financieros independientemente. Los valores del cliente son ignorados para `service_fee`, `total_amount`, `costo_agente`, `ganancia_orbi`.  
**Razón:** Seguridad económica básica.  
**Impacto técnico:**
- `motor_params` leído de Supabase para cada cálculo
- Fallback a `DIRECT` hardcodeado en `config.ts` si falla la lectura
- `pricing_rule` siempre es `"ORBI_MOTOR_1.0"`
- Si el cliente envía `distance_km`, se acepta solo si está dentro del ±25% del haversine del servidor

---

## DA-008: OSRM vía proxy del servidor

**Fecha:** Sprint de routing  
**Problema:** Llamadas directas a OSRM desde el browser generan CORS y exponen la URL.  
**Decisión:** Proxy en `/api/routing/route` que llama a `router.project-osrm.org` desde el servidor.  
**Impacto técnico:**
- Timeout de 8 s en el servidor
- Si OSRM falla → el cliente cae back a haversine para estimación de distancia
- La geometría de ruta se convierte de GeoJSON `[lng, lat]` a Leaflet `[lat, lng]` en el servidor

---

## DA-009: AuthGatePanel renderiza en flujo sin agente (bug fix)

**Fecha:** Sprint de estabilización (post-implementación de draft/idempotencia)  
**Problema:** El `AuthGatePanel` estaba envuelto en `{selectedService && selectedAgent && !isOrbitExperienceActive ? ...}`. Cuando el usuario sin cuenta presionaba "Seguir esperando" en el flujo sin agente, `setShowAuthGate(true)` se ejecutaba pero el panel nunca renderizaba porque `selectedAgent === null`.  
**Decisión:** Agregar un bloque separado `{showAuthGate ? <AuthGatePanel ...> : null}` dentro de la sección de `WaitingRequestCard` (líneas 1859–1868).  
**Impacto:** Tests I, J, K (recovery link, email send, returnTo) ahora funcionan en ambos flujos.

---

## DA-010: Nominatim nunca para autocomplete

**Fecha:** Diseño geolocalización v3  
**Problema:** Usar la instancia pública de `nominatim.openstreetmap.org` para sugerencias mientras el usuario escribe viola la política de uso de Nominatim (máximo 1 req/s, sin autocomplete masivo).  
**Alternativas evaluadas:**
- Nominatim directamente: viola términos de uso, riesgo de bloqueo de IP
- Google Places: $0.017/req después de $200/mes, requiere billing
- Photon (Komoot): sin límite documentado estricto, datos OSM, buena cobertura MX
- Mapbox Geocoding: 100k req/mes gratis, requiere API key

**Decisión:**
- **Photon** → sugerencias y autocomplete (proxy `/api/geocoding/search`)
- **Nominatim** → solo reverse geocoding puntual (proxy `/api/geocoding/reverse`)
- **Frontend** nunca llama directamente a ninguno de los dos

**Razón:** Cumplimiento de términos de uso de OSM; resiliencia ante cambios de política; la interfaz `GeocodingProvider` permite migrar a Google Places sin tocar `LocationPicker`.

---

## DA-011: Caché serverless best-effort para geocoding (Opción B)

**Fecha:** Diseño geolocalización v3  
**Problema:** ORBI corre en infraestructura serverless. Un `Map` singleton en Node no puede ser compartido entre instancias concurrentes. Implementar Redis agrega complejidad y costo que no se justifica en el MVP.  
**Alternativas evaluadas:**
- Opción A (Redis/Upstash): caché y rate limiting globales garantizados; costo y complejidad adicionales
- Opción B (in-memory best-effort): sin costo; sin garantía entre instancias; funcional para tráfico bajo

**Decisión:** Opción B — caché in-memory por instancia como best effort. Deuda técnica registrada: `[DEUDA-GEO-01]`.  
**Razón:** En tráfico bajo de MVP, la probabilidad de múltiples instancias concurrentes es mínima. El valor de Redis no justifica el costo operativo en esta etapa.  
**Condición de migración:** Cuando el tráfico real genere evidencia de rate limiting o ineficiencia, migrar a Upstash Redis.

---

## DA-012: Eliminar hardcode de Zumpahuacán y municipios específicos

**Fecha:** Diseño geolocalización v3  
**Problema:** `buildLocalGeocodeQuery` (línea 3626 de ServiceRequestFlow) agrega automáticamente "Zumpahuacán, Estado de México, México" a queries cortos. `zumpahuacanCenter` (línea 199) es el fallback del mapa. ORBI queda técnicamente anclado a esa ciudad.  
**Decisión:**
- Eliminar `buildLocalGeocodeQuery` y `zumpahuacanCenter` del código
- Implementar `resolveSearchCenter()` dinámico (ver ORBI_MASTER.md sección 9.2)
- Configurar el centro operativo de la red vía `NEXT_PUBLIC_NETWORK_LAT/LNG` (env vars)

**Razón:** ORBI debe poder replicarse a cualquier municipio sin modificar el código. La ciudad de operación es configuración, no código.

---

## DA-013: La vinculación de customer nunca por coincidencia de correo

**Fecha:** Sprint de estabilización (post-bug de identidad)  
**Problema:** Una versión anterior detectaba correos existentes en `customers` y vinculaba automáticamente el customer al nuevo `auth_user_id` solo porque el correo coincidía. Dos personas con el mismo correo compartirían el mismo customer.  
**Decisión:** La vinculación de un customer existente a un `auth_user_id` requiere verificación explícita. El pre-check verifica si el correo ya está registrado (devuelve error), y el post-check verifica si el `auth_user_id` ya tiene un customer (también devuelve error). La coincidencia de correo sola no es suficiente.  
**Razón:** Principio de seguridad de identidad. Una cuenta pertenece a quien la creó, no a quien tenga el mismo correo.

---

## DA-014: Contrato HTTP para geocoding — 200 para indisponibilidad recuperable

**Fecha:** Diseño geolocalización v3  
**Problema:** El diseño inicial decía simultáneamente "habrá errores 503" y "nunca se devolverá un 5xx al frontend". Contradicción.  
**Decisión:** Contrato único:
- HTTP 200 para indisponibilidad recuperable (Photon/Nominatim caídos): `{ results: [], status: "unavailable", fallbackAvailable: true }`
- HTTP 400 para parámetros inválidos
- HTTP 500 solo para fallos internos no manejados (genuinamente inesperados)

**Razón:** Si el proveedor no está disponible, el usuario aún puede usar mapa, GPS o referencia manual. Esto no es un error desde la perspectiva del cliente — es una degradación graceful. Un 503 causaría que el frontend trate la respuesta como error genérico.

---

## DA-015: No mostrar badge de cobertura hasta que exista validación autoritativa

**Fecha:** Diseño geolocalización v3  
**Problema:** El diseño v2 proponía mostrar "Posiblemente fuera de cobertura" calculado contra `searchCenter`. El `searchCenter` puede ser el GPS del usuario, el origen, o el destino — no necesariamente el centro operativo de ORBI. La distancia respecto a ese punto no demuestra cobertura.  
**Auditoría:** El backend actual tiene una validación parcial de cobertura SOLO para misiones de catálogo (por distancia de pricing `outOfRange`). No existe ninguna validación geográfica de cobertura por zona u red.  
**Decisión:** No mostrar badge de cobertura hasta que exista una fuente autoritativa. Mostrar solo la distancia calculada desde el `searchCenter` si aporta valor informativo. La validación de cobertura real se registra como `[DEUDA-COB-01]`.

---

## DA-016: Providencia compuesta para identificadores de lugar

**Fecha:** Diseño geolocalización v3  
**Problema:** El `osm_id` solo no es universalmente único. Diferentes tipos de entidades OSM (node, way, relation) pueden tener el mismo número.  
**Decisión:** El identificador compuesto es `"photon:${osmType}:${osmId}"`, por ejemplo `"photon:N:12345678"`.  
**Razón:** Dos sucursales del mismo nombre nunca se confunden si tienen `osmType:osmId` diferentes. El proveedor está incluido para facilitar la migración futura a Google Places u otro proveedor.

---

## DA-017: origin y destination como nombres canónicos (sin aliases)

**Fecha:** Diseño geolocalización v3 (corrección del diseño v2)  
**Problema:** El diseño v2 proponía crear `originText` y `destinationText` como aliases de `origin` y `destination`, introduciendo dos fuentes de verdad para el mismo dato.  
**Decisión:** `origin` y `destination` son y seguirán siendo los nombres canónicos del texto operativo en `RequestDetails`, `DraftRequestDetails`, y `ActiveMission`. No se crean aliases. Los campos nuevos son ADICIONALES: `originReference`, `originPlaceName`, etc.  
**Razón:** No hay razón para dos fuentes de verdad. El refactoring de nombres rompe `handleSendMissionToAgent`, `handleCreateWaitingRequest`, y el mapeo de la API, sin ningún beneficio.

---

## DA-018: Draft v1 con draftId pero sin idempotencyKey → migrar, no descartar

**Fecha:** Diseño geolocalización v3  
**Problema:** El diseño v2 descartaba cualquier draft sin `idempotencyKey`. Pero drafts de versiones tempranas pueden tener `draftId` pero no `idempotencyKey` (el campo fue agregado después).  
**Decisión:** En `migrateDraftV1ToV2()`: `idempotencyKey: v1.idempotencyKey ?? v1.draftId`. Si `idempotencyKey` no existe en el draft v1, se usa `draftId`. El draft nunca se descarta si tiene `draftId` válido, no está expirado, y puede migrarse.  
**Razón:** Un pedido que el usuario dejó en progreso es valioso. No perderlo por un campo faltante que puede inferirse.

---

## DA-019: SearchCenter null en lugar de {lat:0, lng:0}

**Fecha:** Diseño geolocalización v3  
**Problema:** El diseño v2 usaba `{ lat: 0, lng: 0 }` para indicar ausencia de contexto geográfico. Pero `lat: 0, lng: 0` es una coordenada válida (Atlántico, frente a África). Enviarla como "bias" a Photon daría resultados sesgados hacia esa zona.  
**Decisión:** `SearchCenter | null` — cuando es `null`, el backend omite los parámetros de sesgo en la petición a Photon (búsqueda sin sesgo geográfico).  
**Razón:** Nunca confundir "sin contexto" con "coordenada cero". Validar coordenadas con `lat !== null && Number.isFinite(lat)`, no con truthiness.

---

## DA-020: "Buscar en zona más amplia" en lugar de "Buscar en todo México"

**Fecha:** Diseño geolocalización v3  
**Problema:** El diseño v2 proponía un botón "Buscar en todo México". ORBI puede operar fuera de México en el futuro. Hardcodear un país es la misma categoría de error que hardcodear una ciudad.  
**Decisión:** La acción de búsqueda ampliada se llama "Buscar en zona más amplia" (sin referencia a ningún país o región).  
**Razón:** La arquitectura no debe incorporar supuestos geográficos irreversibles. ORBI es una plataforma, no un servicio específico de México.
