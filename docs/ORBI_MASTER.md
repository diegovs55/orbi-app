# ORBI — Documento Maestro de Arquitectura

> **Versión:** 2026-07-09  
> **Estado:** MVP en estabilización  
> **Este documento es la memoria técnica oficial del proyecto. No resumir. No omitir.**

---

## 1. Visión del Proyecto

### Propósito

ORBI es una red logística local que conecta a personas que necesitan realizar mandados, entregas, traslados, compras y pagos con agentes humanos de confianza que operan en su misma comunidad o ciudad.

### Problema que resuelve

En comunidades medianas y pequeñas (y en zonas periféricas de ciudades grandes), no existen servicios de mensajería urbana accesibles. Las personas dependen de conocidos, de WhatsApp o de servicios costosos diseñados para grandes metrópolis. ORBI llena ese vacío con una red de agentes locales coordinados tecnológicamente.

### Filosofía del producto

- **Simplicidad radical:** el cliente no necesita una app, solo un navegador.
- **Confianza humana:** cada agente es conocido en su comunidad, no un anonimato.
- **Operación local primero:** ORBI funciona donde otros servicios no llegan.
- **Arquitectura escalable:** la primera red opera en Zumpahuacán, pero el sistema puede replicarse a cualquier municipio sin reescribir el código.
- **Cero fricción inicial:** el cliente puede pedir sin cuenta; la cuenta se crea al momento de necesitarla, sin interrumpir el flujo.

### Objetivos del MVP

1. Permitir que un cliente haga un pedido completo (origen, destino, detalle, solicitante) desde el navegador.
2. Mostrar agentes compatibles disponibles en tiempo real.
3. Crear una misión en Supabase al presionar "Poner en órbita" (acción única y explícita).
4. Permitir al agente ver, aceptar y completar la misión desde su panel.
5. Mostrar al cliente el estado de la misión en tiempo real desde `/orbita/[missionId]`.
6. Gestionar autenticación, registro y recuperación de contraseña sin perder el pedido en curso.
7. Persistir borradores localmente con idempotencia real.

### Objetivos de mediano plazo

- Búsqueda de lugares con autocomplete (Photon + Nominatim vía proxy).
- Catálogo de negocios locales integrado al flujo de pedido.
- Panel de negocios para gestión de pedidos de catálogo.
- Métricas operativas en panel admin (conversión, tiempo de respuesta, ingresos).
- Notificaciones push o WhatsApp al agente cuando llega una misión.

### Objetivos de largo plazo

- Multi-red: ORBI como plataforma para múltiples ciudades con configuración por red.
- App nativa (PWA primero, luego React Native si el tráfico lo justifica).
- Sistema de reputación de agentes.
- Integración de pagos digitales (Clip, MercadoPago).
- Agentes especializados por tipo de servicio o zona.

---

## 2. Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                            │
│                                                                     │
│  Next.js 15.5 App Router — "use client" components                 │
│  Tailwind CSS — tema oscuro orbi-black / orbi-cyan                  │
│  Leaflet (react-leaflet) — mapas interactivos                       │
│  localStorage — draft + session cache + GPS state                   │
│                                                                     │
│  Supabase JS Client (4 instancias aisladas por storageKey):        │
│    supabase.ts          → sb-orbi-user    (localStorage)            │
│    supabase-agent       → sb-orbi-agent   (localStorage)            │
│    supabase-business    → sb-orbi-business (localStorage)           │
│    supabase-admin-client → sb-orbi-admin  (sessionStorage)          │
└──────────────┬──────────────────────────────────────────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Next.js API Routes (servidor)                   │
│                                                                     │
│  /api/missions/create        POST — crear misión con idempotencia   │
│  /api/missions/cancel-customer POST — cancelar misión               │
│  /api/missions/complete       POST — completar misión               │
│  /api/customers/upsert        POST — crear/actualizar customer       │
│  /api/customers/activate      POST — activar cuenta existente       │
│  /api/customers/list          GET  — listar customers (admin)        │
│  /api/agents/activate         POST — crear sesión de agente         │
│  /api/agents/reset-access     POST — resetear contraseña agente      │
│  /api/businesses/activate     POST — activar negocio                │
│  /api/businesses/reset-access POST — resetear contraseña negocio    │
│  /api/businesses/set-email    POST — asignar email a negocio        │
│  /api/businesses/update-profile POST — actualizar perfil negocio    │
│  /api/admin/verify            POST — verificar token admin           │
│  /api/admin/motor-params      GET/POST — parámetros de pricing      │
│  /api/ledger/summary          GET  — resumen financiero             │
│  /api/requests/list           GET  — listar pedidos en espera       │
│  /api/requests/update         POST — actualizar pedido en espera    │
│  /api/requests/delete         DELETE — eliminar pedido en espera    │
│  /api/routing/route           GET  — proxy OSRM para ruta de manejo │
│                                                                     │
│  [PRÓXIMO] /api/geocoding/search  GET — autocomplete vía Photon     │
│  [PRÓXIMO] /api/geocoding/reverse GET — reverse geocode vía Nominatim│
│                                                                     │
│  Todos usan supabase-admin.ts (SERVICE_ROLE_KEY) para bypasear RLS │
└──────────────┬──────────────────────────────────────────────────────┘
               │ Supabase JS SDK (service_role)
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SUPABASE (Backend)                          │
│                                                                     │
│  Auth:                                                              │
│    - Confirm email: OFF (decisión definitiva del MVP)               │
│    - Identidad: auth_user_id (UUID de auth.users)                   │
│    - Sin usuarios anónimos                                          │
│    - Sin backfill por teléfono o correo                             │
│    - La vinculación NUNCA se hace solo porque el correo coincide     │
│                                                                     │
│  Tablas (public schema):                                            │
│    missions          — misiones de entrega                          │
│    customers         — clientes registrados o en proceso            │
│    agents            — agentes de la red                            │
│    businesses        — negocios locales                             │
│    products          — catálogo de productos por negocio            │
│    motor_params      — parámetros de pricing configurables          │
│    ledger_entries    — entradas del libro contable                  │
│    event_log         — auditoría de eventos del sistema             │
│                                                                     │
│  Realtime:                                                          │
│    - subscribeToTableChanges() para missions, agents, businesses    │
│    - Canal por componente con nombre único (Math.random)            │
│                                                                     │
│  Storage: no utilizado actualmente                                  │
│                                                                     │
│  RLS: activo — las API Routes lo bypasean con service_role          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       SERVICIOS EXTERNOS                            │
│                                                                     │
│  OSRM (router.project-osrm.org)                                     │
│    - Proxy: /api/routing/route                                      │
│    - Calcula distancia real y geometría de ruta                     │
│    - Timeout: 8 s; fallback: haversine                              │
│                                                                     │
│  Nominatim (nominatim.openstreetmap.org) — uso actual               │
│    - Búsqueda geocoding directa desde el browser (MVP)              │
│    - SERÁ MIGRADO a proxy /api/geocoding/reverse (Diseño v3)        │
│    - No usar para autocomplete                                       │
│                                                                     │
│  Photon (photon.komoot.io) — próxima implementación                 │
│    - Autocomplete y búsqueda de lugares                             │
│    - SOLO vía proxy /api/geocoding/search                           │
│                                                                     │
│  Resend / SMTP                                                      │
│    - Transaccional: recuperación de contraseña                      │
│    - Configurado en Supabase Auth (no en código ORBI directamente)  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT                                    │
│  Vercel (serverless — Next.js)                                      │
│  Cloudflare (DNS / CDN)                                             │
│  Supabase (base de datos + auth + realtime)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Flujo Completo del Usuario

### 3.1 Ingreso a /pedir

1. Usuario llega a `https://orbi.app/pedir`
2. `ServiceRequestFlow` monta y ejecuta efecto de carga de draft
3. **Si existe draft significativo en localStorage:**
   - `showDraftChoice = true`
   - Pantalla muestra: "Tienes un pedido pendiente. ¿Deseas continuar o empezar uno nuevo?"
   - Opción A "Continuar pedido" → `handleContinueDraft()`: restaura servicio, paso, detalles, items, agente pendiente
   - Opción B "Empezar uno nuevo" → `handleStartNewOrder()`: limpia draft y draftId
4. **Si no hay draft:**
   - Pantalla inicial: campo de texto libre + 6 botones de categoría (Mandado, Entrega, Traslado, Compra local, Recolección, Pago o trámite)

### 3.2 Selección de servicio

- Usuario escribe en el campo libre o elige una categoría
- `selectedService` se actualiza
- Wizard avanza a paso `"pedido"`

### 3.3 Paso Pedido (origen + detalle)

- Campo de texto: detalle de la solicitud
- Campo de origen: texto libre + [Elegir en mapa] + [Usar ubicación actual como origen]
- El botón GPS llama a `handleUseCurrentLocation("origin")`:
  - `navigator.geolocation.getCurrentPosition`
  - Actualiza `originLat`, `originLng`
  - Llama `reverseGeocodePoint` → actualiza `origin` (texto)
- El botón mapa abre `LocationPickerDialog`:
  - Mapa Leaflet interactivo centrado en punto actual o `networkDefaultCenter`
  - El usuario arrastra el pin
  - Al confirmar: `handleConfirmMapPoint()` → `reverseGeocodePoint` → actualiza coords y texto
- Auto-save del draft cada 800 ms (debounce) al cambiar estado
- `ContinueStepButton` habilitado cuando el paso está completo
- Pulsar "Continuar" → confirma sección "pedido" → avanza a `"destino"`

### 3.4 Paso Destino

- Campo de destino: texto libre + [Elegir en mapa] + [Usar ubicación actual como destino]
- Misma lógica GPS / mapa que en origen
- `ScheduleField`: inmediato vs. programado (fecha y hora)
- `ContinueStepButton` habilitado cuando `destinationIsComplete`:
  - `Boolean(destinationCoordinatePair)` hoy
  - **Será:** `destinationLat !== null && isFinite(destinationLat) && destinationConfirmed` (Diseño v3)
- Confirmar → sección "destino" marcada → avanza a `"solicitante"`

### 3.5 Paso Solicitante

- Nombre del solicitante + teléfono
- Si hay `customerSession` (localStorage) y `authUserId` → banner "Usando tu cuenta ORBI" + datos pre-rellenados
- Confirmar → sección "solicitante" marcada → avanza a `"agente"`

### 3.6 Sección de agentes

- `isRequestReady = true`
- Se consultan agentes compatibles de Supabase (`agents` tabla, status "En línea", service_type compatible)
- **Estado A — Con agentes:**
  - Lista de `AgentOptionCard` mostrando nombre, zona, vehículo, distancia estimada
  - Usuario elige un agente → `selectedAgent` se actualiza
  - Aparece sección de confirmación "¿Lo pedimos así?" con resumen completo

- **Estado B — Sin agentes disponibles:**
  - `WaitingRequestCard` con opciones:
    - "Seguir esperando" → `handleCreateWaitingRequest()`
    - "Modificar pedido" → vuelve al formulario
  - Si el usuario no está autenticado y pulsa "Seguir esperando":
    - `setShowAuthGate(true)`
    - `AuthGatePanel` aparece inline bajo el card

### 3.7 AuthGatePanel

Visible cuando:
- `selectedService && selectedAgent && !isOrbitExperienceActive && showAuthGate` (flujo con agente)
- `selectedService && isRequestReady && !selectedAgent && showAuthGate` (flujo sin agente — WaitingRequestCard)

Modos:
- `"register"`: crear cuenta — nombre, teléfono, correo, contraseña
- `"login"`: iniciar sesión — correo, contraseña + enlace "¿Olvidaste tu contraseña?"
- `"recovery"`: enviar email de recuperación

**Al autenticarse exitosamente (`handleAuthGateSuccess`):**
- Llama `setAuthUserId(userId)`
- Llama `setShowAuthGate(false)`
- Llama `saveCustomerSession(name, phone, email, userId)`
- Actualiza `details.requesterName` y `details.requesterPhone`
- **NO llama `createMission()`** — el usuario debe presionar "Poner en órbita" explícitamente

### 3.8 Confirmación y creación de misión

**Flujo con agente:**
- Pantalla "¿Lo pedimos así?" muestra resumen completo
- Botón "Poner en órbita":
  - Si no hay sesión → muestra AuthGatePanel
  - Si hay sesión → llama `handleSendMissionToAgent()`
    - Pasa `id: draftId ?? undefined` como idempotency key
    - En éxito: `clearDraft()`, `setDraftId(null)`, `setActiveMission(mission)`, navega a `/orbita/[missionId]`

**Flujo sin agente:**
- Botón "Seguir esperando" → `handleCreateWaitingRequest()`
  - Guarda `isSending` guard para evitar doble envío
  - Pasa `id: draftId ?? undefined` como idempotency key
  - En éxito: `clearDraft()`, `setDraftId(null)`, `setActiveMission(mission)`

### 3.9 Órbita (/orbita/[missionId])

- Página de seguimiento en tiempo real
- Muestra estado actual de la misión
- Mapa con posición del agente (GPS en tiempo real)
- Ruta calculada por OSRM con trim progresivo desde posición del agente
- Cámara del mapa sigue al agente suavemente
- Estados visibles: `por_tomar`, `aceptada`, `en_mision`, `cumplida`, `cancelada`

### 3.10 Panel del agente (/agente)

- Login con email y contraseña (cliente Supabase aislado `sb-orbi-agent`)
- Misiones disponibles en tiempo real
- GPS watcher singleton (module scope, sobrevive navegación entre páginas)
- Acepta, inicia y completa misiones
- Actualiza posición GPS cada 20 s o 15 m de movimiento

---

## 4. Modelo de Datos

### 4.1 Tabla `missions`

**Propósito:** misiones de entrega activas e históricas.

| Campo | Tipo | Restricción | Descripción |
|-------|------|-------------|-------------|
| `id` | uuid | PK, NOT NULL | Idempotency key = draftId del cliente |
| `status` | text | NOT NULL | Estado de la misión |
| `mission_type` | text | | `"directa"` o `"compra_negocio"` |
| `service_type` | text | | `"Mandado"`, `"Entrega"`, etc. |
| `detail` | text | | Descripción del pedido |
| `estimated_orbit` | text | | Tiempo estimado |
| `user_id` | uuid | FK auth.users | Cliente autenticado (fuente de verdad) |
| `guest_id` | uuid | | ID temporal cliente sin cuenta |
| `requester_name` | text | | Nombre al momento del pedido |
| `requester_phone` | text | | Teléfono al momento del pedido |
| `customer_name` | text | | Nombre del customer registrado |
| `customer_phone` | text | | Teléfono del customer registrado |
| `guest_name` | text | | Nombre del guest |
| `guest_phone` | text | | Teléfono del guest |
| `origin_text` | text | | Texto de origen |
| `origin_lat` | float8 | | Latitud de origen |
| `origin_lng` | float8 | | Longitud de origen |
| `destination_text` | text | | Texto de destino |
| `destination_lat` | float8 | | Latitud de destino |
| `destination_lng` | float8 | | Longitud de destino |
| `business_id` | uuid | FK businesses | Negocio (misiones catálogo) |
| `business_name` | text | | Nombre del negocio |
| `business_lat` | float8 | | Lat del negocio |
| `business_lng` | float8 | | Lng del negocio |
| `product_id` | uuid | | Producto (misiones simples) |
| `product_name` | text | | Nombre del producto |
| `items` | jsonb | | Array de líneas de pedido (catálogo autoritativo) |
| `subtotal_productos` | float8 | | Subtotal de productos |
| `service_fee` | float8 | | Comisión de servicio ORBI |
| `total_amount` | float8 | | Total a pagar por el cliente |
| `costo_agente` | float8 | | Costo que recibe el agente |
| `ganancia_orbi` | float8 | | Ganancia neta de ORBI |
| `pricing_rule` | text | | Versión del motor de precios (`"ORBI_MOTOR_1.0"`) |
| `motor_params_version` | integer | | Versión de parámetros de pricing en DB |
| `selected_agent_id` | uuid | FK agents | Agente asignado |
| `selected_agent_name` | text | | Nombre del agente |
| `selected_agent_lat` | float8 | | Lat del agente al asignarse |
| `selected_agent_lng` | float8 | | Lng del agente al asignarse |
| `selected_agent_zone` | text | | Zona del agente |
| `selected_agent_vehicle` | text | | Vehículo del agente |
| `selected_agent_trust` | text | | Nivel de confianza del agente |
| `active_agent_id` | uuid | | ID del agente que aceptó actualmente |
| `payment_status` | text | | Estado de pago (`"pendiente"` al crear) |
| `payment_method` | text | | Método de pago |
| `distance_km` | float8 | | Distancia de ruta (OSRM o haversine) |
| `duration_min` | float8 | | Duración estimada |
| `route_geometry` | jsonb | | Geometría de ruta [lat,lng][] |
| `sector` | text | | Sector/zona |
| `created_at` | timestamptz | | Timestamp de creación |
| `updated_at` | timestamptz | | Timestamp de última actualización |
| `accepted_at` | timestamptz | | Timestamp de aceptación |

**Columnas pendientes de agregar (Diseño v3 — migración aditiva):**

```sql
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS origin_place_name       text,
  ADD COLUMN IF NOT EXISTS origin_provider_id      text,   -- "photon:N:12345678"
  ADD COLUMN IF NOT EXISTS origin_provider         text,
  ADD COLUMN IF NOT EXISTS origin_confirmed        boolean,
  ADD COLUMN IF NOT EXISTS origin_reference        text,
  ADD COLUMN IF NOT EXISTS destination_place_name  text,
  ADD COLUMN IF NOT EXISTS destination_provider_id text,
  ADD COLUMN IF NOT EXISTS destination_provider    text,
  ADD COLUMN IF NOT EXISTS destination_confirmed   boolean,
  ADD COLUMN IF NOT EXISTS destination_reference   text;
```

**Campos críticos que nunca deben cambiar:**
- `id` — idempotency key; inmutable después del INSERT
- `user_id` — única identidad del cliente autenticado
- `payment_status` al crear siempre es `"pendiente"` (servidor lo fuerza)
- `items` — snapshot autoritativo del carrito; inmutable

### 4.2 Tabla `customers`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | ID interno del customer |
| `auth_user_id` | uuid | FK a auth.users — única identidad; NUNCA NULL en clientes registrados |
| `name` | text | Nombre del cliente |
| `phone` | text | Teléfono normalizado (solo dígitos) |
| `email` | text | Correo electrónico |
| `is_registered` | boolean | True si tiene cuenta activa |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Regla crítica:** la vinculación de un customer existente a un `auth_user_id` NUNCA se hace únicamente porque el correo coincide. Siempre requiere que el `auth_user_id` sea verificado como propietario.

### 4.3 Tabla `agents`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | ID del agente |
| `auth_id` | uuid | FK a auth.users |
| `name` | text | Nombre del agente |
| `zone` | text | Zona de operación |
| `vehicle` | text | Tipo de vehículo |
| `trust_level` | text | Nivel de confianza |
| `status` | text | `"Disponible"` / `"Fuera de servicio"` — constantes en `lib/agents.ts::AGENT_STATUS` |
| `service_type` | text | Tipo de servicio que ofrece |
| `lat` | float8 | Latitud actual (GPS) |
| `lng` | float8 | Longitud actual (GPS) |
| `is_on_orbit` | boolean | True si tiene una misión activa |
| `radius_km` | float8 | Radio operativo |
| `availability` | text | Estado de disponibilidad |

### 4.4 Tabla `businesses`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | |
| `name` | text | Nombre del negocio |
| `sector` | text | Categoría del negocio |
| `auth_user_id` | uuid | FK a auth.users |
| `email` | text | Correo del negocio |
| `lat` | float8 | Latitud del negocio |
| `lng` | float8 | Longitud del negocio |
| `base_text` | text | Dirección o descripción de ubicación |
| `is_active` | boolean | Si el negocio está activo |

### 4.5 Tabla `products`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid PK | |
| `business_id` | uuid | FK businesses |
| `name` | text | Nombre del producto |
| `price` | float8 | Precio autoritativo (solo el servidor lo usa) |
| `category` | text | Categoría del producto |
| `is_active` | boolean | |

### 4.6 Tabla `motor_params`

Parámetros de pricing configurables sin redeploy.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | integer PK | |
| `version` | integer | Versión del set de parámetros |
| `tarifa_base` | float8 | Tarifa base misiones directas |
| `costo_por_km` | float8 | Costo por km |
| `comision_agente` | float8 | Fracción al agente (0.70 = 70%) |
| `created_at` | timestamptz | |

Si `motor_params` falla → fallback a `DIRECT` hardcodeado en `config.ts`.

### 4.7 Tabla `ledger_entries`

Libro contable de transacciones económicas de la red.

### 4.8 Tabla `event_log`

Auditoría de eventos del sistema. Cada API Route escribe aquí.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `event_type` | text | Tipo de evento (e.g., `"api.create.error_422"`) |
| `severity` | text | `"info"`, `"warn"`, `"error"` |
| `source` | text | Origen del evento |
| `entity_type` | text | Tipo de entidad relacionada |
| `entity_id` | text | ID de la entidad |
| `actor_type` | text | Quién disparó el evento |
| `payload` | jsonb | Datos adicionales del evento |
| `error_detail` | text | Mensaje de error si aplica |
| `http_status` | integer | Status HTTP de la operación |
| `duration_ms` | integer | Duración de la operación |
| `request_id` | uuid | ID único del request |

---

## 5. Sistema de Autenticación

### 5.1 Cuatro clientes Supabase aislados

| Cliente | Archivo | storageKey | Storage | Usuarios |
|---------|---------|------------|---------|---------|
| Usuario/Cliente | `lib/supabase.ts` | `sb-orbi-user` | localStorage | Clientes ORBI |
| Agente | `lib/supabase-agent-client.ts` | `sb-orbi-agent` | localStorage | Agentes |
| Negocio | `lib/supabase-business-client.ts` | `sb-orbi-business` | localStorage | Negocios |
| Admin | `lib/supabase-admin-client.ts` | `sb-orbi-admin` | sessionStorage | Administradores |

El aislamiento por `storageKey` garantiza que una sesión de agente no interfiere con la de cliente, aunque ambas usen el mismo proyecto Supabase.

### 5.2 Decisiones de autenticación definitivas

- **Confirm email: OFF** — decisión irreversible del MVP
- **auth_user_id** es la única identidad del cliente en el sistema
- **Sin usuarios anónimos** — no existen, no se crean, no se admiten
- **Sin backfill** — no se vincula un pedido a una cuenta solo porque el teléfono o correo coinciden
- **La vinculación NUNCA se hace por coincidencia de correo** — solo si el `auth_user_id` pertenece al mismo customer

### 5.3 Flujo de registro

1. Usuario llena nombre, teléfono, correo, contraseña en `AuthGatePanel` (modo `"register"`)
2. Pre-check: `supabase.from("customers").select().eq("email", ...).maybeSingle()` → si ya existe y `is_registered=true` → error claro
3. `supabase.auth.signUp({ email, password, options: { data: { name, phone } } })`
4. Si `data.user` es null sin error → Supabase rechazó silenciosamente (email duplicado con "Confirm email" OFF) → error claro
5. Post-check: `supabase.from("customers").select().eq("auth_user_id", userId).maybeSingle()` → si ya registrado → error
6. `POST /api/customers/upsert` con `auth_user_id`, nombre, teléfono, correo → crea o actualiza customer
7. `handleAuthGateSuccess(userId, name, phone, email)` → actualiza estado local

### 5.4 Flujo de login

1. Usuario llena correo y contraseña en `AuthGatePanel` (modo `"login"`)
2. `supabase.auth.signInWithPassword({ email, password })`
3. En éxito → obtiene sesión → `supabase.auth.getUser()` → `handleAuthGateSuccess`
4. Los datos de nombre y teléfono se recuperan del customer en Supabase vía `/api/customers/upsert`

### 5.5 Flujo de recuperación de contraseña

1. En modo `"login"` del `AuthGatePanel` → enlace "¿Olvidaste tu contraseña?"
2. Cambia a modo `"recovery"` con correo pre-rellenado desde el campo de login
3. `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/pedir\` })`
4. Supabase envía email con enlace (vía Resend/SMTP configurado en dashboard)
5. Usuario hace clic en el email → llega a `/pedir?token=...` (o equivalente según config)
6. `SupabaseAuthListener` detecta evento `PASSWORD_RECOVERY`:
   - Lee `returnTo` del query string
   - Redirige a `/usuarios/reset-password?returnTo=%2Fpedir` (si había draft en `/pedir`)
7. En `/usuarios/reset-password`: formulario de nueva contraseña
   - `supabase.auth.updateUser({ password: newPassword })`
   - En éxito: espera 1.5 s → `router.push(returnTo ?? "/usuarios")`
8. El usuario vuelve a `/pedir` con su draft intacto

### 5.6 SupabaseAuthListener

```typescript
// components/SupabaseAuthListener.tsx
// Escucha PASSWORD_RECOVERY a nivel de layout — preserva returnTo
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    const returnTo = new URLSearchParams(window.location.search).get("returnTo") ?? "";
    router.push("/usuarios/reset-password" + (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""));
  }
});
```

### 5.7 CustomerSession (caché local)

```typescript
// localStorage key: "orbi_customer_session"
type CustomerSession = {
  name: string;
  phone: string;
  email?: string;
  userId?: string;  // auth_user_id de Supabase
};
```

La sesión de customer en localStorage es un caché de conveniencia. Supabase Auth es la fuente de verdad. Si `userId` está presente, el cliente tiene cuenta.

### 5.8 Edge cases de autenticación

| Caso | Manejo |
|------|--------|
| Email duplicado en registro | Pre-check + post-check + mensaje claro al usuario |
| `signUp` devuelve null user | Detectado como email duplicado con confirm-email OFF |
| Sesión expirada durante el flujo | `supabase.auth.getUser()` devuelve error → AuthGate vuelve a mostrarse |
| Recuperación desde flujo de pedido | `returnTo=/pedir` preservado; draft intacto al volver |
| Login con sesión de agente activa | No interfiere (storageKey aislado) |
| Dos tabs con el mismo usuario | Supabase maneja el refresh token; sin conflicto en auth |

---

## 6. Sistema Draft

### 6.1 Concepto

Un draft es el pedido en construcción persistido en localStorage. El `draftId` sirve simultáneamente como identificador del borrador y como `idempotencyKey` enviado al backend. Una misma sesión de pedido nunca puede generar dos misiones en la base de datos, incluso si el usuario recarga la página o pierde conexión.

### 6.2 Constantes y claves

```typescript
// Estado ACTUAL en lib/order-draft.ts (implementado)
const DRAFT_KEY = "orbi_order_draft";   // localStorage key
const SCHEMA_VERSION = 1;               // versión actual en producción
const EXPIRY_HOURS = 72;                // 3 días de vigencia
```

**Nota:** `SCHEMA_VERSION` será `2` cuando se implemente el Diseño v3 de geocodificación. Ver sección 6.6 para el plan de migración.

### 6.3 Tipo `OrderDraft` (estado actual — schemaVersion: 1)

```typescript
type OrderDraft = {
  draftId: string;              // UUID generado al primer auto-save; = idempotencyKey
  idempotencyKey: string;       // SIEMPRE === draftId; redundante para explicitez
  schemaVersion: 1;             // versión actual en producción
  createdAt: string;            // ISO 8601; no cambia en actualizaciones
  updatedAt: string;            // actualiza en cada save
  expiresAt: string;            // createdAt + 72 h (se resetea en cada save)
  selectedService: DraftServiceOption | null;
  selectedStep: string;         // WizardStep
  details: DraftRequestDetails;
  cartItems: DraftCartItem[];
  selectedAgent: DraftAgent | null;
  paymentStatus: string;
  paymentMethod: string;
  confirmedDraftSections: Record<string, boolean>;
}

type DraftRequestDetails = {
  origin: string;               // texto canónico (NUNCA renombrar — usado por missions)
  originLat: number | null;
  originLng: number | null;
  destination: string;          // texto canónico
  destinationLat: number | null;
  destinationLng: number | null;
  detail: string;
  scheduleMode: "asap" | "scheduled";
  scheduledAt: string;
  requesterName: string;
  requesterPhone: string;
}
```

**Campos geo adicionales (planeados para schemaVersion: 2 — Diseño v3, no implementados aún):**

```typescript
// Estos campos se agregarán en DraftRequestDetails cuando se implemente el Diseño v3:
originReference?: string;
originPlaceName?: string | null;
originProviderId?: string | null;
originProvider?: string | null;
originConfirmed?: boolean;
destinationReference?: string;
destinationPlaceName?: string | null;
destinationProviderId?: string | null;
destinationProvider?: string | null;
destinationConfirmed?: boolean;
```

### 6.4 Auto-save (debounce 800 ms)

El efecto de auto-save se dispara cuando cambia cualquiera de estos estados:

```
[selectedService, selectedStep, details, cartItems, selectedAgent, paymentStatus, paymentMethod, confirmedDraftSections]
```

Solo guarda si `selectedService !== null` (el draft no tiene sentido sin servicio seleccionado).

### 6.5 Ciclo de vida del draft

```
MOUNT
  → loadDraft()
  → Si existe y es significativo (selectedService != null):
      setDraftId(draft.draftId)
      setShowDraftChoice(true)
      → Pantalla: "Tienes un pedido pendiente"

CONTINUAR PEDIDO
  → handleContinueDraft()
  → Restaura: selectedService, selectedStep, details, paymentStatus,
              paymentMethod, confirmedDraftSections, cartItems
  → Si draft.selectedAgent → pendingDraftAgentId.current = draft.selectedAgent.id
  → setDraftId(draft.draftId)
  → setShowDraftChoice(false)

AGENTE RESTAURADO (efecto separado)
  → Cuando agents.length > 0 y pendingDraftAgentId.current != null
  → agents.find(a => a.id === pendingDraftAgentId.current)
  → Si encontrado: setSelectedAgent(match), pendingDraftAgentId.current = null

EMPEZAR NUEVO
  → handleStartNewOrder()
  → clearDraft()
  → setDraftId(null)
  → setShowDraftChoice(false)

AUTO-SAVE (800ms debounce)
  → saveDraft(payload, draftId)
  → Si no hay draftId: crypto.randomUUID() → nuevo draftId

MISIÓN CREADA (éxito)
  → clearDraft()
  → setDraftId(null)
  → (el draftId ya viajó al backend como idempotency key)
```

### 6.6 Migración v1 → v2

Los drafts con `schemaVersion: 1` se migran automáticamente al cargarse, sin descartarse.

```typescript
function migrateDraftV1ToV2(v1: OrderDraftV1): OrderDraft {
  return {
    ...v1,
    idempotencyKey: v1.idempotencyKey ?? v1.draftId, // nunca perder por falta de este campo
    schemaVersion: 2,
    details: {
      ...v1.details,
      originReference: "",
      originPlaceName: null,
      originProviderId: null,
      originProvider: null,
      originConfirmed:
        v1.details.originLat !== null && Number.isFinite(v1.details.originLat) &&
        v1.details.originLng !== null && Number.isFinite(v1.details.originLng),
      destinationReference: "",
      destinationPlaceName: null,
      destinationProviderId: null,
      destinationProvider: null,
      destinationConfirmed:
        v1.details.destinationLat !== null && Number.isFinite(v1.details.destinationLat) &&
        v1.details.destinationLng !== null && Number.isFinite(v1.details.destinationLng),
    },
  };
}
```

### 6.7 Reglas de descarte del draft

| Condición | Acción |
|-----------|--------|
| JSON inválido | Descartar (catch) |
| Sin `draftId` | Descartar |
| Expirado (`expiresAt < now`) | Descartar |
| `schemaVersion === 1` | **Migrar** (nunca descartar) |
| `schemaVersion === 2` | Usar |
| `schemaVersion > 2` | Descartar (versión futura desconocida) |

### 6.8 Idempotencia

El `draftId` viaja como campo `id` al crear la misión:

```typescript
// En handleSendMissionToAgent y handleCreateWaitingRequest:
await createMission({
  ...otrosCampos,
  id: draftId ?? undefined,
})
```

El backend verifica:

```typescript
// app/api/missions/create/route.ts
const { data: existingMission } = await admin
  .from("missions").select().eq("id", id).maybeSingle();
if (existingMission) {
  return NextResponse.json({ mission: existingMission }); // devuelve la existente
}
```

Resultado: si la conexión se pierde después del INSERT pero antes de que el cliente reciba la respuesta, el segundo intento devuelve la misión ya creada. El cliente limpia el draft y navega a la órbita correcta.

### 6.9 Casos borde del draft

| Caso | Comportamiento |
|------|----------------|
| `lat: 0, lng: 0` en draft v1 | `Number.isFinite(0) === true` → `confirmed: true` (coordenada válida) |
| Dos tabs con el mismo draft | La última escritura gana (localStorage no es transaccional) |
| Draft expirado al volver | Descartado; se muestra flujo normal sin choice screen |
| Draft sin agente disponible al restaurar | `pendingDraftAgentId` → cuando cargue la lista de agentes, si el agente ya no está online, no se selecciona automáticamente |
| Usuario modifica texto post-selección de lugar | `confirmed = false`; coords conservadas pero bloqueadas (Diseño v3) |

---

## 7. Sistema de Creación de Misión

### 7.1 Dónde vive

```
lib/missions.ts → export async function createMission(mission: CreateMissionInput): Promise<ActiveMission>
```

### 7.2 Quién puede llamarlo

| Llamador | Contexto |
|----------|----------|
| `handleSendMissionToAgent()` | Usuario autenticado presiona "Poner en órbita" con agente seleccionado |
| `handleCreateWaitingRequest()` | Usuario autenticado presiona "Seguir esperando" sin agente disponible |

### 7.3 Quién NUNCA puede llamarlo

| Quien | Por qué |
|-------|---------|
| `handleAuthGateSuccess` | La autenticación no debe crear misiones automáticamente |
| Efectos de React (useEffect) | Ningún efecto puede llamar `createMission` |
| Callbacks de autenticación | La creación es acción explícita del usuario |
| `LocationPicker` | La selección de ubicación no crea misiones |
| Cualquier autocomplete o búsqueda | La búsqueda no crea misiones |

### 7.4 Flujo interno de `createMission`

```
1. Construir nextMission: ActiveMission con id = mission.id ?? crypto.randomUUID()
2. POST /api/missions/create con body = JSON.stringify(nextMission)
3. Si response.ok:
   a. Parsear { mission: serverMission }
   b. Sobrescribir campos financieros con valores del servidor
   c. addActiveMission(finalMission) → agrega a estado en memoria
   d. return finalMission
4. Si !response.ok:
   throw new Error(body.error ?? "Error al crear misión")
```

### 7.5 Lógica de idempotencia en el backend

```typescript
// app/api/missions/create/route.ts
// Paso 1: check idempotencia
const { data: existingMission } = await admin
  .from("missions").select().eq("id", id).maybeSingle();
if (existingMission) {
  return NextResponse.json({ mission: existingMission }); // 200 con misión existente
}
// Paso 2: INSERT normal
const { data, error } = await admin.from("missions").insert(missionRow).select().single();
```

### 7.6 Motor de precios (servidor es única autoridad)

**Misiones directas:**
- Distancia: `haversineKm(agentLat, agentLng, originLat, originLng)`
- Si cliente envía `distance_km` (OSRM): aceptar si está dentro del ±25% del haversine del servidor
- Leer `motor_params` de Supabase → si falla, usar `DIRECT` de `config.ts` como fallback
- `serviceFee = tarifaBase + costoPorKm * distancia`; `costoAgente = serviceFee * comisionAgente`

**Misiones de catálogo:**
- Distancia: `haversineKm(businessLat, businessLng, destinationLat, destinationLng)`
- Tarifas por tramos de distancia (`CATALOG.tramos`)
- Recargos por valor del pedido (`CATALOG.recargos`)
- Si `outOfRange` (distancia > `CATALOG.radioMaximoKm = 30 km`) → 422

**Los precios del cliente SIEMPRE son ignorados por el servidor.** El servidor recalcula de forma independiente.

### 7.7 Guard contra doble envío

```typescript
// En handleCreateWaitingRequest:
const [isSending, setIsSending] = useState(false);

if (isSending) return;  // guard
setIsSending(true);
try {
  // ... createMission ...
} finally {
  setIsSending(false);
}
```

Más el check de idempotencia en el backend: dos capas de protección.

### 7.8 Estados de misión y transiciones

```
esperando_negocio → preparando → por_tomar → aceptada → en_mision → cumplida
                                                                    ↘ cancelada
cualquier estado activo → cancelada → archivada
```

---

## 8. Flujo de Agentes

### 8.1 Consulta de agentes compatibles

```typescript
// ServiceRequestFlow — cuando isRequestReady = true
// Consulta agentes: status = AGENT_STATUS.ONLINE, service_type compatible
// Filtra los que tienen lat/lng válidos (isNaN check)
// Ordena por distancia al origen (si hay coords de origen)
```

### 8.2 Estado: con agentes disponibles

- Se muestran `AgentOptionCard` para cada agente compatible
- Datos mostrados: nombre, zona, vehículo, nivel de confianza, distancia estimada desde origen
- El usuario selecciona → `setSelectedAgent(agent)`
- Aparece sección de confirmación

### 8.3 Estado: sin agentes disponibles

- `WaitingRequestCard` con estado actual:
  - Si no hay misión activa: "Seguir esperando" + "Modificar pedido"
  - Si hay misión en espera: muestra estado actual + "Cancelar"
  - Si misión fue cancelada: "Cambiar algo"

### 8.4 GPS del agente (singleton)

```typescript
// lib/agent-gps.ts
// MIN_DISTANCE_M = 15 m — mínimo movimiento para escribir a Supabase
// MIN_INTERVAL_MS = 20000 ms — mínimo tiempo entre writes
// watchId — singleton a nivel de módulo (sobrevive navegación)
// Llama updateAgentOrbit(agentId, lat, lng) para actualizar agents.lat/lng
```

### 8.5 Seguimiento en tiempo real

- `/orbita/[missionId]` suscribe a cambios de la misión vía `subscribeToMissions()`
- `MissionOrbitTracker` suscribe a cambios del agente vía `subscribeToAgents()`
- Actualización de posición GPS del agente: se recibe en tiempo real
- La ruta polyline se "recorta" progresivamente desde la posición del agente (`liveAgentPoint`)
- La cámara del mapa sigue al agente suavemente (interpolación)

---

## 9. Flujo de Negocios

### 9.1 Propósito

Los negocios locales (farmacias, tiendas de abarrotes, papelerías, etc.) participan en el catálogo de ORBI. Un cliente puede pedir un producto de catálogo y un agente lo recoge en el negocio y lo lleva al domicilio del cliente. El flujo de negocios es independiente del flujo de cliente: tiene su propio login, su propia sesión en localStorage, su propia instancia de Supabase.

### 9.2 Rutas del sistema de negocios

| Ruta | Componente | Función |
|------|-----------|---------|
| `/negocios` | `components/BusinessCatalog.tsx` dentro de panel | Panel del negocio (catálogo, pedidos) |
| `/negocios/login` | Página dedicada | Login vía `sb-orbi-business` |
| `/negocios/cambiar-contrasena` | Página dedicada | Cambio de contraseña del negocio |

### 9.3 Sesión de negocio

```typescript
// lib/businessSession.ts
// localStorage key: "orbi_business_session"
export type BusinessSession = {
  id: string;                   // ID del negocio en public.businesses
  name: string;
  email: string;
  phone?: string;
  supabaseBusinessId?: string;  // puede diferir de id en algunos contextos
};
```

Funciones: `getBusinessSession()`, `saveBusinessSession()`, `clearBusinessSession()`.  
La sesión en localStorage es caché de conveniencia. Supabase Auth (`sb-orbi-business`) es la fuente de verdad.

### 9.4 Solicitud de registro de nuevo negocio

Antes de tener acceso, un negocio envía una solicitud de registro desde `BusinessAccessPanel`:

1. El visitante llena nombre, correo y teléfono
2. `addPendingRequest({ type: "business", ... })` inserta en la tabla `requests` con clave anónima
3. El admin revisa en `AdminPendingRequests` y aprueba/rechaza
4. Si aprueba → `POST /api/businesses/activate` → crea cuenta en Supabase Auth + registro en `public.businesses`
5. El negocio recibe credenciales y puede loguearse

El mismo flujo aplica para agentes (`type: "agent"`), usando `AgentAccessPanel` y `/api/agents/activate`.

### 9.5 Catálogo de negocios

```typescript
// lib/catalog.ts
export type CatalogBusiness = {
  id: string;
  name: string;
  category: BusinessSector;     // "Alimentos y bebidas" | "Farmacia" | "Papelería" | ...
  zone: string;
  lat: number | null;
  lng: number | null;
  status: "activo" | "inactivo";
  rating: number | null;
  availability: string;
  availabilityStart: string;
  availabilityEnd: string;
};

export type CatalogProduct = {
  id: string;
  businessId: string;
  name: string;
  price: number;                // autoritativo — el servidor lo lee de public.products
  category: ProductCategory;
  status: "disponible" | "agotado" | "pausado";
  available: boolean;
};
```

Los productos del negocio se gestionan en `components/BusinessCatalog.tsx`. Los cambios de disponibilidad se persisten localmente en `lib/localProducts.ts` (localStorage key: `orbi_local_products`) y se sincronizan con Supabase.

### 9.6 APIs del sistema de negocios

| Endpoint | Método | Función |
|----------|--------|---------|
| `/api/businesses/activate` | POST | Crea cuenta Supabase Auth + registro en `public.businesses` |
| `/api/businesses/reset-access` | POST | Resetea contraseña del negocio |
| `/api/businesses/set-email` | POST | Asigna o cambia email del negocio |
| `/api/businesses/update-profile` | POST | Actualiza nombre, teléfono, zona, etc. |

### 9.7 Diagrama del flujo de negocios

```
Visitante → BusinessAccessPanel → addPendingRequest (anon) → tabla "requests"
                                                                   ↓
                                                           Admin aprueba
                                                                   ↓
                                                    /api/businesses/activate
                                                    → Supabase Auth (sb-orbi-business)
                                                    → public.businesses
                                                                   ↓
                                                    Negocio recibe credenciales
                                                                   ↓
                                                    /negocios/login → BusinessCatalog
                                                    → gestiona productos y pedidos
```

---

## 10. Sistema de Geolocalización

### 9.1 Estado actual (implementado)

#### 9.1.1 Captura de ubicación

| Método | Implementación | Resultado |
|--------|----------------|-----------|
| Texto manual | Input libre, `updateLocationText(target, value)` | Solo texto; coords = null |
| GPS | `navigator.geolocation.getCurrentPosition()` → `handleUseCurrentLocation(target)` | Coords + reverse geocode |
| Mapa | `LocationPickerDialog` (Leaflet) → pin draggable → `handleConfirmMapPoint()` | Coords + reverse geocode |

#### 9.1.2 Geocodificación inversa (actual — a migrar)

```typescript
// reverseGeocodePoint(point: {lat, lng})
// Llama directamente: https://nominatim.openstreetmap.org/reverse?format=json&lat=...
// ⚠️ PROBLEMA: llamada directa desde browser — viola política de uso de Nominatim
// ⚠️ PROBLEMA: hardcodea "Zumpahuacán" en buildLocalGeocodeQuery
// SERÁ MIGRADO: a /api/geocoding/reverse (proxy)
```

#### 9.1.3 Geocodificación directa (actual — a migrar)

```typescript
// handleGeocodeLocation(target)
// Llama: https://nominatim.openstreetmap.org/search?format=json&limit=1&q=...
// buildLocalGeocodeQuery: hardcodea "Zumpahuacán, Estado de México, México"
// ⚠️ PROBLEMA: toma el primer resultado sin mostrárselo al usuario
// ⚠️ PROBLEMA: hardcodea municipio
// ⚠️ PROBLEMA: usa Nominatim para autocomplete (prohibido por política)
// SERÁ REEMPLAZADO: por LocationPicker con Photon vía proxy
```

#### 9.1.4 Fallback del mapa

```typescript
const zumpahuacanCenter: MapPoint = { lat: 18.8349, lng: -99.5818 };
// Usado en handleOpenMap cuando no hay coords previas
// SERÁ REEMPLAZADO: por resolveSearchCenter() → networkDefaultCenter (env var)
```

### 9.2 Roadmap de geolocalización (Diseño v3 aprobado conceptualmente)

#### Etapa 1: Migración de schema Supabase
- Agregar 10 columnas nullable a `missions` (ver sección 4.1)

#### Etapa 2: Backend geocoding routes
- `GET /api/geocoding/search` — Photon vía proxy, timeout 4 s, caché best effort
- `GET /api/geocoding/reverse` — Nominatim vía proxy, User-Agent identificable, caché 15 min
- Eliminar llamadas directas del browser a Nominatim

#### Etapa 3: Draft v2 + tipos enriquecidos
- `SCHEMA_VERSION = 2`, `migrateDraftV1ToV2()`
- Extender `RequestDetails` con campos de lugar
- Extender `ActiveMission` con campos geo

#### Etapa 4: SearchCenter dinámico
- Resolver el centro de búsqueda en este orden: GPS actual → extremo contrario confirmado → última zona del draft → centro operativo configurable (env var) → null (sin sesgo)
- Eliminar `zumpahuacanCenter` hardcodeado
- Nuevo env var: `NEXT_PUBLIC_NETWORK_LAT`, `NEXT_PUBLIC_NETWORK_LNG`

#### Etapa 5: LocationPicker (solo destino, feature flag)
- Nuevo componente con autocomplete, sugerencias explícitas, confirmación obligatoria
- Feature flag: `NEXT_PUBLIC_LOCATION_PICKER_ENABLED=true`

#### Etapas 6-8: QA, extensión a origen, QA integral

### 9.3 Proveedor geográfico

| Rol | Proveedor | Restricción |
|-----|-----------|-------------|
| Autocomplete / sugerencias | Photon (Komoot) | Solo vía proxy ORBI; timeout 4 s |
| Geocodificación inversa | Nominatim (OSM) | Solo vía proxy; User-Agent identificable; caché; no para autocomplete |
| Routing (distancias y rutas) | OSRM | Vía proxy `/api/routing/route`; timeout 8 s |

### 9.4 Separación de conceptos (v3)

```
searchCenter / searchRadius   → para encontrar y ordenar lugares
serviceCoverage               → para validar si ORBI puede ejecutar la misión
```

Hoy no existe validación de cobertura geográfica autoritativa en el backend (solo validación por distancia de pricing en misiones de catálogo). Esto es deuda técnica registrada.

### 9.5 Contexto operativo de la misión — Principio permanente

**Enunciado:**
ORBI nunca busca lugares de forma aislada. Siempre busca lugares dentro del contexto operativo de la misión que el usuario está resolviendo.

El `SearchCenter` es una *consecuencia* del contexto operativo, no el concepto central.

**Prioridad oficial del contexto (invariante — no modificar sin revisión explícita):**

| Prioridad | Fuente | Condición |
|-----------|--------|-----------|
| 1 | Origen confirmado de la misión | `originCoordinatePair !== null` |
| 2 | GPS actual del usuario | Solo si no existe origen con coordenadas |
| 3 | Centro configurado de la Red ORBI | `NEXT_PUBLIC_NETWORK_LAT` / `NEXT_PUBLIC_NETWORK_LNG` |
| 4 | Sin contexto geográfico | `null` — nunca `{ lat: 0, lng: 0 }` (INV-019) |

**Nunca usar coordenadas hardcodeadas** (INV-020).

**Alcance del principio:** No aplica solo a geocodificación. Este mismo contexto operativo guía:
- Búsqueda y autocomplete de lugares (PR-05.2)
- Cálculo de rutas y ETA
- Selección y radio operativo de agentes
- Cálculo de precios
- Recomendaciones contextuales

**Implementación actual (`resolveSearchCenter`):**

```typescript
// Nivel de módulo — sin hooks. Prioridad definida en §9.5.
function resolveSearchCenter(
  originCoordinatePair: { lat: number; lng: number } | null
): { lat: number; lng: number } | null {
  if (originCoordinatePair) return originCoordinatePair;               // P1
  // P2 (GPS live) — requiere estado async; implementar en PR-05.4
  const netLat = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LAT ?? "");
  const netLng = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LNG ?? "");
  if (Number.isFinite(netLat) && Number.isFinite(netLng))
    return { lat: netLat, lng: netLng };                               // P3
  return null;                                                          // P4
}
```

**Deuda pendiente:** P2 (GPS live sin origen) requiere almacenar la última posición GPS del usuario como estado de módulo. Registrado como parte de PR-05.4.

---

## 11. Componentes Importantes

| Componente | Archivo | Función | Nunca romper |
|------------|---------|---------|--------------|
| `ServiceRequestFlow` | `components/ServiceRequestFlow.tsx` | Flujo completo de pedido del cliente | Todo el flujo |
| `AuthGatePanel` | Dentro de `ServiceRequestFlow.tsx` (línea ~3160) | Registro, login, recuperación | Modos, returnTo |
| `SupabaseAuthListener` | `components/SupabaseAuthListener.tsx` | Intercepta PASSWORD_RECOVERY | returnTo preservation |
| `MissionOrbitTracker` | `components/MissionOrbitTracker.tsx` | Seguimiento GPS en tiempo real | GPS trim, camera |
| `MyAccount` | `components/MyAccount.tsx` | Panel de cuenta del cliente | auth_user_id identity |
| `AdminCustomers` | `components/AdminCustomers.tsx` | Gestión de customers (admin) | auth_user_id check |
| `AdminControlPanel` | `components/AdminControlPanel.tsx` | Panel de control admin principal | |
| `LocationField` | Dentro de `ServiceRequestFlow.tsx` (línea ~2684) | UI de campo de ubicación (actual) | Mapa + GPS funcionando |
| `LocationPickerDialog` | Dentro de `ServiceRequestFlow.tsx` (línea ~2748) | Modal de mapa para seleccionar punto | Coordenadas al confirmar |
| `WaitingRequestCard` | Dentro de `ServiceRequestFlow.tsx` (línea ~2946) | Card de pedido en espera | AuthGate inline |
| `AgentOptionCard` | Dentro de `ServiceRequestFlow.tsx` | Tarjeta de agente seleccionable | |
| `OrbitExperienceStage` | Dentro de `ServiceRequestFlow.tsx` | Vista de órbita embebida | |
| `AdminAccessGate` | `components/AdminAccessGate.tsx` | Guard de autenticación admin | |

### Dependencias críticas

```
ServiceRequestFlow
  ├── lib/missions.ts → createMission
  ├── lib/customers.ts → registerCustomerAccount, loginCustomerAccount, saveCustomerSession
  ├── lib/order-draft.ts → loadDraft, saveDraft, clearDraft
  ├── lib/routing.ts → fetchRoute (OSRM vía proxy)
  ├── lib/pricing/ → estimateMissionCost, calculateServiceFee
  └── lib/supabase.ts → subscribeToMissions, subscribeToAgents
```

---

## 12. Decisiones de Arquitectura

### DA-001: Confirm email: OFF (definitiva)

- **Problema:** Con confirm email ON, un usuario puede registrarse pero no puede operar inmediatamente, lo que rompe el flujo de pedido mid-session.
- **Alternativas:** Confirm email ON (flujo limpio pero disruptivo), magic link, OTP por SMS.
- **Decisión:** Confirm email **permanentemente OFF** en el proyecto Supabase.
- **Razón:** ORBI debe permitir que el usuario complete un pedido sin interrupciones. El email se verifica socialmente (comunidad conocida).
- **Impacto:** `signUp` puede devolver `null user` sin error cuando el email ya existe → se detecta con check explícito.

### DA-002: auth_user_id como única identidad

- **Problema:** Múltiples customers con el mismo correo/teléfono creaban duplicados y misiones huérfanas.
- **Alternativas:** Identificación por teléfono, por correo, por device fingerprint.
- **Decisión:** `auth_user_id` (UUID de Supabase Auth) es la **única** identidad válida.
- **Razón:** Es el único identificador que Supabase garantiza único, verificado y no transferible.
- **Impacto:** Sin usuarios anónimos; sin backfill por coincidencia de correo o teléfono.

### DA-003: Sin usuarios anónimos

- **Problema:** Los usuarios anónimos creaban estados inconsistentes y dificultaban la vinculación de misiones.
- **Alternativas:** Usuarios anónimos que se "upgradean" al registrarse.
- **Decisión:** No existen usuarios anónimos en ORBI.
- **Razón:** La vinculación "anónimo → registrado" es una fuente de bugs de identidad. ORBI muestra el AuthGate solo cuando es necesario, sin forzar registro antes de explorar.
- **Impacto:** El cliente puede hacer pedidos sin cuenta; al primer intento de creación real de misión, se muestra el AuthGate.

### DA-004: La misión solo se crea al presionar "Poner en órbita"

- **Problema:** En versiones anteriores, `handleAuthGateSuccess` llamaba a `createMission()` automáticamente después de registrar una cuenta, creando misiones sin confirmación explícita del usuario.
- **Alternativas:** Crear misión automáticamente post-autenticación.
- **Decisión:** `handleAuthGateSuccess` NUNCA llama `createMission()`. La creación es siempre una acción explícita del usuario.
- **Razón:** El usuario debe revisar el resumen del pedido antes de confirmarlo. La autenticación y la creación de misión son dos acciones separadas.
- **Impacto:** El flujo es: auth → vuelve a la pantalla de confirmación → usuario presiona "Poner en órbita" → misión creada.

### DA-005: draftId === idempotencyKey

- **Problema:** Sin idempotencia, un retry por timeout podía crear dos misiones idénticas.
- **Alternativas:** UUID generado solo al presionar el botón, token de sesión.
- **Decisión:** El `draftId` generado al primer auto-save es el mismo UUID que viaja como `id` de la misión al backend.
- **Razón:** Permite que el backend rechace el segundo INSERT si ya existe un registro con ese `id`.
- **Impacto:** El draft persiste mientras la misión no se haya creado exitosamente; se limpia solo en éxito confirmado.

### DA-006: Cuatro clientes Supabase aislados

- **Problema:** Un agente logueado en el mismo browser que un cliente causaba conflictos de sesión.
- **Alternativas:** Un solo cliente con lógica de roles, JWT custom.
- **Decisión:** Cuatro instancias del cliente Supabase JS con `storageKey` diferente.
- **Razón:** El aislamiento es completo — diferentes sessiones de auth, diferentes tokens, sin interferencia.
- **Impacto:** Un agente y un cliente pueden estar logueados simultáneamente en el mismo browser sin conflicto.

### DA-007: Servidor es única autoridad para precios

- **Problema:** El cliente podía enviar precios manipulados.
- **Decisión:** El servidor ignora todos los campos financieros del cliente y los recalcula de forma independiente.
- **Razón:** Seguridad económica básica; el cliente no puede influir en `service_fee`, `total_amount`, `costo_agente`.
- **Impacto:** El backend lee `motor_params` de Supabase; si falla, usa `DIRECT` hardcodeado como fallback.

### DA-008: OSRM vía proxy del servidor

- **Problema:** Las llamadas directas al API de OSRM desde el browser exponen la URL y generan CORS.
- **Decisión:** Proxy en `/api/routing/route` que llama a OSRM desde el servidor.
- **Impacto:** El cliente nunca conoce la URL de OSRM; el servidor tiene timeout y maneja errores.

### DA-009: AuthGatePanel en flujo sin agente (WaitingRequestCard)

- **Problema:** El `AuthGatePanel` solo renderizaba cuando `selectedAgent !== null`, por lo que el flujo sin agente nunca lo mostraba aunque `showAuthGate = true`.
- **Decisión:** Agregar bloque `{showAuthGate ? <AuthGatePanel ...> : null}` inline en la sección de `WaitingRequestCard`.
- **Impacto:** Los tests I, J, K (recovery link, email send, returnTo) ahora funcionan en el flujo sin agente.

### DA-010: Nominatim nunca para autocomplete (Diseño v3)

- **Problema:** Usar la instancia pública de Nominatim para sugerencias mientras el usuario escribe viola la política de uso de Nominatim.
- **Decisión:** Photon para autocomplete; Nominatim solo para reverse geocoding puntual; ambos vía proxy del servidor.
- **Razón:** Cumplimiento de términos de uso de OpenStreetMap; resiliencia ante cambios de política.

### DA-011: Caché serverless best-effort (Diseño v3)

- **Problema:** ORBI corre en serverless. Un `Map` singleton en Node no puede ser compartido entre instancias.
- **Decisión:** Caché in-memory por instancia (best effort). Deuda técnica registrada para migrar a Upstash Redis.
- **Razón:** El tráfico de MVP no justifica la complejidad de Redis aún.

### DA-012: No hardcodear Zumpahuacán

- **Problema:** `buildLocalGeocodeQuery` y `zumpahuacanCenter` asumen que ORBI solo opera en Zumpahuacán.
- **Decisión:** Eliminar toda referencia a municipios específicos del código. Usar `resolveSearchCenter()` dinámico y `NEXT_PUBLIC_NETWORK_LAT/LNG` como env vars configurables.
- **Razón:** ORBI debe poder replicarse a cualquier municipio sin modificar el código.

### DA-013: La vinculación de customer nunca por coincidencia de correo

- **Problema:** Dos personas pueden compartir un correo (familia, trabajo). Vincular automáticamente por email es un bug de identidad grave.
- **Decisión:** La vinculación de un customer existente a un `auth_user_id` requiere verificación explícita del propietario, nunca inferida por email.
- **Razón:** Principio de seguridad de identidad. Una vez implementado, nunca debe revertirse.

---

## 13. Restricciones Obligatorias

### 12.1 Restricciones absolutas (NUNCA violar)

1. **`handleAuthGateSuccess` NO llama `createMission()`** — jamás, bajo ningún contexto.
2. **La misión solo se crea cuando el usuario presiona "Poner en órbita"** — único punto de entrada.
3. **`draftId` NO se regenera** mientras hay un draft activo — el mismo UUID debe llegar al backend.
4. **`idempotencyKey === draftId`** siempre — no crear un nuevo UUID para la misión.
5. **La vinculación de customer NUNCA por coincidencia de correo** — solo por `auth_user_id` verificado.
6. **Sin usuarios anónimos** — no crear, no usar, no migrar desde anónimos.
7. **Sin backfill por teléfono o correo** — no asumir ownership por datos coincidentes.
8. **Confirm email permanece OFF** — no cambiarlo.
9. **auth_user_id es la única identidad del cliente** — no inventar otros identificadores de sesión.
10. **Los precios del cliente son ignorados por el servidor** — el servidor recalcula siempre.
11. **No modificar RLS** — las API Routes usan service_role; no cambiar la política.
12. **El draft se limpia SOLO en éxito confirmado de creación de misión** — no antes.
13. **GPS, mapa y referencia manual siempre disponibles** — ninguna nueva funcionalidad los elimina.
14. **Nominatim no se usa para autocomplete** — solo para reverse geocoding puntual vía proxy.
15. **El frontend nunca llama directamente a Nominatim o Photon** — solo vía `/api/geocoding/*`.

### 12.2 Restricciones de flujo

16. **`handleContinueDraft()` no crea misión** — solo restaura estado.
17. **`handleStartNewOrder()` no crea misión** — solo limpia draft.
18. **`LocationPicker` no llama `createMission()`** — la selección de lugar es solo datos.
19. **Ningún efecto de React llama `createMission()`** — solo handlers de click explícito.
20. **`WaitingRequestCard.onWait` llama `handleCreateWaitingRequest()`** con guard `isSending`.

### 12.3 Restricciones de datos

21. **`missions.id` es inmutable post-INSERT** — no se puede cambiar el idempotency key.
22. **`missions.payment_status`** siempre `"pendiente"` al crear — el servidor lo fuerza.
23. **`missions.items`** es el snapshot autoritativo del carrito — inmutable.
24. **`customers.auth_user_id`** es inmutable una vez asignado — no reasignar.

---

## 14. Deudas Técnicas

### Alta prioridad (antes de escalar)

| ID | Deuda | Descripción | Impacto si no se resuelve |
|----|-------|-------------|--------------------------|
| DEUDA-GEO-01 | Caché compartida y rate limiting global | Reemplazar caché in-memory por Upstash Redis para geocoding | Con múltiples instancias serverless, cada una llama a Photon/Nominatim independientemente |
| DEUDA-GEO-02 | Llamadas directas a Nominatim desde browser | `reverseGeocodePoint` y `handleGeocodeLocation` llaman directamente a Nominatim | Viola política de uso; puede resultar en bloqueo del IP |
| DEUDA-GEO-03 | `buildLocalGeocodeQuery` hardcodea Zumpahuacán | Función en línea 3626 de ServiceRequestFlow | ORBI no puede operar en otra ciudad |
| DEUDA-GEO-04 | `zumpahuacanCenter` hardcodeado | Línea 199 de ServiceRequestFlow | El mapa siempre abre en Zumpahuacán |
| DEUDA-COB-01 | Sin validación de cobertura geográfica | El backend no valida si el destino está en zona de operación | Una misión puede crearse fuera de cobertura real |

### Media prioridad

| ID | Deuda | Descripción |
|----|-------|-------------|
| DEUDA-AUTH-01 | Rate limiting en registro | No hay límite de intentos de registro por IP |
| DEUDA-DRAFT-01 | Sin sincronización entre tabs | localStorage no es transaccional; dos tabs pueden sobreescribirse |
| DEUDA-AGENT-01 | GPS watcher no persiste entre recargas del agente | El watcher se reinicia al recargar la página del agente |
| DEUDA-PRICE-01 | `motor_params` sin validación de schema | Si un admin sube parámetros inválidos, el fallback es silencioso |
| DEUDA-NOTIF-01 | Sin notificaciones push al agente | El agente debe mantener la pestaña abierta para ver misiones |

### Baja prioridad / futuro

| ID | Deuda | Descripción |
|----|-------|-------------|
| DEUDA-UI-01 | `ServiceRequestFlow.tsx` es muy grande | ~3680 líneas; candidato a refactoring por secciones |
| DEUDA-TEST-01 | Sin tests automatizados | Todo QA es manual |
| DEUDA-PERF-01 | Sin paginación en admin | Con muchas misiones, la consulta puede ser lenta |

---

## 15. Roadmap

### Sprint actual: Georreferenciación enriquecida (Diseño v3)

Orden de implementación aprobado:

1. **Etapa 1** — Migración schema Supabase (10 columnas nullable en `missions`)
2. **Etapa 2** — Backend geocoding routes (`/api/geocoding/search` y `/api/geocoding/reverse`)
3. **Etapa 3** — Draft v2 + tipos enriquecidos + `ActiveMission` extendida
4. **Etapa 4** — `resolveSearchCenter()` dinámico; eliminar `zumpahuacanCenter`
5. **Etapa 5** — `LocationPicker` con autocomplete (solo destino, feature flag)
6. **Etapa 6** — QA de destino
7. **Etapa 7** — Extensión a origen
8. **Etapa 8** — QA integral + pruebas de idempotencia + recuperación de contraseña

**Condición para comenzar:** autorización expresa de Diego tras revisión del diseño v3.

### Próximos sprints sugeridos

| Orden | Sprint | Descripción |
|-------|--------|-------------|
| 1 | Georreferenciación | En curso — diseño v3 aprobado |
| 2 | Notificaciones | WhatsApp o push para agentes |
| 3 | Multi-red | Configuración por ciudad/zona |
| 4 | Pagos digitales | Clip o MercadoPago |
| 5 | PWA | App instalable |

---

## 16. Checklist de QA

### 15.1 Draft y persistencia

- [ ] **A** — Al seleccionar un servicio, el draft se guarda con `draftId === idempotencyKey` y `schemaVersion: 2`
- [ ] **B** — El draft persiste exactamente tras recargar la página
- [ ] **C** — Al volver a `/pedir` con draft activo, aparece "Tienes un pedido pendiente"
- [ ] **D** — "Continuar pedido" restaura: servicio, paso, detalles, agente pendiente, con el mismo `draftId`
- [ ] **E** — "Empezar uno nuevo" limpia el draft completamente (`localStorage.getItem("orbi_order_draft") === null`)
- [ ] **F** — El draft se limpia únicamente en éxito confirmado de creación de misión, no antes
- [ ] **G** — Solo existe un draft activo simultáneamente (el segundo save sobrescribe el primero)

### 15.2 Autenticación

- [ ] **H** — Registrar una cuenta nueva desde `AuthGatePanel` no crea automáticamente la misión
- [ ] **I** — El modo login de `AuthGatePanel` muestra el enlace "¿Olvidaste tu contraseña?"
- [ ] **J** — Al hacer clic en "¿Olvidaste tu contraseña?", aparece el formulario de recovery y envía el email
- [ ] **K** — El `returnTo=/pedir` se preserva a través de todo el flujo de recuperación de contraseña
- [ ] **H2** — Login exitoso desde `AuthGatePanel` no crea misión; el usuario ve el resumen de pedido y debe presionar "Poner en órbita"

### 15.3 Creación de misión e idempotencia

- [ ] **L** — Presionar "Poner en órbita" con el mismo `draftId` dos veces (simulando timeout) devuelve la misma misión y no crea duplicado
- [ ] **M** — La misión se crea correctamente con agente seleccionado y navega a `/orbita/[missionId]`
- [ ] **N** — La misión se crea correctamente sin agente ("Seguir esperando") y muestra estado de espera
- [ ] **O** — Si la red se pierde post-INSERT pre-respuesta, el segundo intento recupera la misión existente

### 15.4 Flujos de agente

- [ ] **P** — El agente ve la misión en tiempo real al crearse
- [ ] **Q** — El agente acepta la misión y el cliente ve el cambio de estado en `/orbita`
- [ ] **R** — El GPS del agente actualiza la posición en tiempo real en el mapa del cliente
- [ ] **S** — La ruta se recorta correctamente desde la posición del agente
- [ ] **T** — La cámara del mapa sigue al agente suavemente

### 15.5 Precios

- [ ] **U** — El precio calculado por el servidor difiere del que el cliente envía → el servidor usa el suyo
- [ ] **V** — Misión de catálogo a 35 km → error 422 "Distancia fuera de cobertura"
- [ ] **W** — `motor_params` leído correctamente de Supabase; si falla → fallback a `DIRECT` hardcodeado

### 15.6 Regresiones críticas (verificar en cada release)

- [ ] AuthGatePanel no llama `createMission()` en ninguno de sus callbacks
- [ ] `draftId` no cambia entre el primer auto-save y el momento de crear la misión
- [ ] El cliente puede hacer un pedido completo sin necesitar cuenta hasta "Poner en órbita"
- [ ] Un agente logueado en el mismo browser no interfiere con la sesión del cliente
- [ ] La recuperación de contraseña funciona desde dentro del flujo de pedido

---

## 17. Estado Actual del Proyecto

### Terminado y estabilizado

| Funcionalidad | Estado |
|---------------|--------|
| Flujo completo de pedido (selección → confirmación) | ✅ Estabilizado |
| AuthGatePanel (registro, login, recovery) | ✅ Estabilizado |
| Draft persistente con `schemaVersion: 1` | ✅ Funcionando |
| Idempotencia `draftId === idempotencyKey` | ✅ Funcionando |
| AuthGate en flujo sin agente (WaitingRequestCard) | ✅ Corregido |
| Recuperación de contraseña desde flujo de pedido | ✅ Funcionando |
| `returnTo` preservado en recuperación | ✅ Funcionando |
| GPS watcher singleton del agente | ✅ Estabilizado |
| Seguimiento en tiempo real (`/orbita/[missionId]`) | ✅ Funcionando |
| Motor de precios v1.0 (directo + catálogo) | ✅ Funcionando |
| Panel admin (misiones, agentes, negocios, customers) | ✅ Funcionando |
| Cuatro clientes Supabase aislados | ✅ Estabilizado |

### En desarrollo / diseño aprobado

| Funcionalidad | Estado |
|---------------|--------|
| Búsqueda de lugares (LocationPicker + geocoding routes) | 🔄 Diseño v3 — pendiente autorización de implementación |
| Draft schemaVersion 2 con campos geo | 🔄 Pendiente (parte del diseño v3) |
| Migración schema Supabase (10 columnas geo) | 🔄 Pendiente |

### Pendiente

| Funcionalidad | Estado |
|---------------|--------|
| Notificaciones push/WhatsApp al agente | ⬜ No iniciado |
| Multi-red (configuración por ciudad) | ⬜ No iniciado |
| Validación de cobertura geográfica en backend | ⬜ No iniciado |
| Caché compartida (Upstash Redis) para geocoding | ⬜ No iniciado |
| Tests automatizados | ⬜ No iniciado |

---

## 18. Principios de Desarrollo

### "Nunca romper"

Estas reglas son inmutables. Cualquier cambio que las viole debe ser rechazado y revertido antes de hacer merge.

**Identidad:**
- `auth_user_id` es la única identidad válida del cliente en todo el sistema.
- No crear, no usar, no admitir usuarios anónimos.
- No vincular customers por coincidencia de correo o teléfono.

**Flujo de pedido:**
- `handleAuthGateSuccess` NUNCA llama `createMission()`.
- La misión solo se crea cuando el usuario presiona explícitamente "Poner en órbita".
- El `draftId` no cambia durante una sesión de pedido.
- El draft solo se limpia en éxito confirmado de creación de misión.

**Idempotencia:**
- `draftId === idempotencyKey` siempre.
- El backend siempre verifica si ya existe una misión con ese `id` antes de INSERT.
- Dos presiones del mismo botón nunca crean dos misiones.

**Autenticación:**
- Confirm email permanece OFF.
- La recuperación de contraseña preserva `returnTo` en todo el flujo.
- Las cuatro instancias de Supabase permanecen aisladas por `storageKey`.

**Geocodificación:**
- Photon y Nominatim nunca se llaman directamente desde el browser.
- Nominatim no se usa para autocomplete.
- No hardcodear municipios, ciudades ni coordenadas específicas.
- `lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)` — nunca truthiness para validar coordenadas.
- `SearchCenter | null` — nunca `{ lat: 0, lng: 0 }` como ausencia de contexto.

**Arquitectura:**
- No modificar RLS.
- No agregar TypeScript `as any` ni `!` para silenciar errores.
- No desactivar ESLint global ni ignorar reglas sin justificación explícita.
- No agregar complejidad nueva sin eliminar otra equivalente.
- No diseñar para problemas que aún no existen en producción.

---

## 19. Guía para Otra IA

### "Cómo continuar ORBI"

#### Lo que debes entender antes de tocar código

1. **ORBI está en fase de estabilización**, no de construcción nueva. El MVP está funcionando. Cada cambio tiene el riesgo de romper algo que ya funciona. La prioridad es no romper antes que agregar.

2. **El flujo de pedido es el corazón del sistema.** `ServiceRequestFlow.tsx` tiene ~3680 líneas y contiene todo: formulario, wizard, draft, auth gate, creación de misión, resumen. No refactorices este archivo sin autorización explícita.

3. **La idempotencia no es opcional.** El `draftId` es el idempotency key. Si lo cambias, generas una brecha donde el mismo pedido puede crear dos misiones.

4. **`handleAuthGateSuccess` NO llama `createMission()`.** Esto fue una decisión tomada después de un bug real en producción. No reviertálo aunque parezca más conveniente.

#### Qué auditar antes de cualquier cambio

1. **Leer el archivo completo que vas a modificar** — no solo las líneas que parecen relevantes.
2. **Verificar que `handleAuthGateSuccess` sigue sin llamar `createMission()`** después de tu cambio.
3. **Verificar que `draftId` no se modifica** en tu cambio.
4. **Verificar que el draft se limpia solo en éxito** de creación de misión.
5. **Compilar con `npx tsc --noEmit`** — el proyecto usa TypeScript estricto.
6. **Buscar en el código si ya existe una función que hace lo que necesitas** antes de crear una nueva.

#### Qué nunca debes asumir

- Que el código antiguo (pre-decisión) está bien. Hay deudas técnicas documentadas.
- Que `buildLocalGeocodeQuery` está bien como está — está hardcodeando Zumpahuacán y será eliminada.
- Que `zumpahuacanCenter` debe conservarse — será reemplazada por `resolveSearchCenter()`.
- Que las llamadas directas a Nominatim desde el browser son correctas — serán migradas.
- Que un `Map` singleton en módulo Next.js es global entre todas las instancias serverless.
- Que `lat: 0, lng: 0` indica "sin coordenadas" — es una coordenada válida (Atlántico, frente a África).
- Que agregar una columna a `missions` no requiere migración SQL — siempre requiere `ALTER TABLE`.

#### Cómo proponer cambios

1. **Auditar primero** — leer el código relevante, identificar efectos secundarios.
2. **Diseño técnico antes de código** — proponer el diseño, esperar aprobación expresa.
3. **Un cambio por etapa** — no combinar refactoring con nueva funcionalidad.
4. **Documentar qué no se toca** — igual de importante que documentar qué se cambia.
5. **Rollback plan** — cada etapa debe tener un plan de rollback explícito.

#### Cómo evitar regresiones

1. Después de cada cambio, verificar manualmente:
   - El draft se guarda y restaura correctamente
   - El AuthGate aparece y funciona (registro, login, recovery)
   - La misión se crea una sola vez al presionar "Poner en órbita"
   - El `returnTo` se preserva en recuperación de contraseña
2. Compilar TypeScript limpio: `npx tsc --noEmit`
3. No usar `as any` para silenciar errores — resolver el tipo correctamente.

#### Cómo respetar la arquitectura existente

- El servidor es la única autoridad para precios financieros.
- Las cuatro instancias de Supabase deben permanecer aisladas.
- `auth_user_id` es la única identidad — no crear campos alternativos de identidad.
- Los campos `origin` y `destination` en `RequestDetails` son los nombres canónicos — no crear aliases.
- Las funciones estabilizadas (`handleAuthGateSuccess`, `handleSendMissionToAgent`, `handleCreateWaitingRequest`, `clearDraft`, `saveDraft`) solo se modifican si hay una razón técnica ineludible y con aprobación explícita.

#### Jerarquía de autoridad

```
1. Principios en ORBI_MASTER.md (este documento) — siempre
2. Decisiones en ORBI_DECISIONS.md — siempre
3. Instrucciones del owner (Diego) en la conversación — siempre
4. El código existente — como referencia de lo que está funcionando
5. Tu criterio técnico — solo en espacios no cubiertos por los anteriores
```

Cuando hay conflicto entre el criterio técnico de la IA y una decisión documentada, gana la decisión documentada. Si crees que una decisión fue incorrecta, **documéntalo como hallazgo** y espera confirmación antes de revertirla.
