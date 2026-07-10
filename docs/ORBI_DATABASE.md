# ORBI — Esquema de Base de Datos

> **Versión:** 2026-07-09  
> **Motor:** PostgreSQL (Supabase)  
> **Proyecto Supabase:** tkgownrugjbmugwxbkog  
> **RLS:** Activo en todas las tablas públicas. Las API Routes lo bypasean con `SUPABASE_SERVICE_ROLE_KEY`.

---

## Estructura de Clientes Supabase

ORBI usa cuatro instancias del cliente de Supabase JS, cada una con su propia sesión aislada:

| Cliente | Archivo | `storageKey` | Storage | Para |
|---------|---------|--------------|---------|------|
| Usuario | `lib/supabase.ts` | `sb-orbi-user` | localStorage | Clientes ORBI |
| Agente | `lib/supabase-agent-client.ts` | `sb-orbi-agent` | localStorage | Agentes |
| Negocio | `lib/supabase-business-client.ts` | `sb-orbi-business` | localStorage | Negocios |
| Admin | `lib/supabase-admin-client.ts` | `sb-orbi-admin` | sessionStorage | Administradores |

El cliente Admin (service_role) para rutas API:
- Archivo: `lib/supabase-admin.ts`
- Función: `getAdmin()` → singleton que usa `SUPABASE_SERVICE_ROLE_KEY`
- Bypasea RLS completamente

---

## Variables de Entorno

```bash
# Públicas (expuestas al browser)
NEXT_PUBLIC_SUPABASE_URL=https://tkgownrugjbmugwxbkog.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...

# Solo servidor
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# [PRÓXIMO — Diseño v3] Centro operativo configurable por red
NEXT_PUBLIC_NETWORK_LAT=   # lat del centro operativo de la red
NEXT_PUBLIC_NETWORK_LNG=   # lng del centro operativo de la red

# [PRÓXIMO — Diseño v3] Feature flag LocationPicker
NEXT_PUBLIC_LOCATION_PICKER_ENABLED=false
```

---

## Tabla: `missions`

**Propósito:** Registro de todas las misiones de entrega, tanto activas como históricas.

**Campo crítico:** `id` es el `draftId` del cliente, que actúa como idempotency key. El backend verifica si ya existe una misión con ese `id` antes de hacer INSERT. Inmutable post-INSERT.

```sql
CREATE TABLE public.missions (
  id                      uuid         PRIMARY KEY,
  status                  text         NOT NULL,
  mission_type            text,
  service_type            text,
  detail                  text,
  estimated_orbit         text,

  -- Identidad del cliente
  user_id                 uuid         REFERENCES auth.users(id),
  guest_id                uuid,
  requester_name          text,
  requester_phone         text,
  customer_name           text,
  customer_phone          text,
  guest_name              text,
  guest_phone             text,

  -- Geografía (campos actuales)
  origin_text             text,
  origin_lat              float8,
  origin_lng              float8,
  destination_text        text,
  destination_lat         float8,
  destination_lng         float8,

  -- Catálogo
  business_id             uuid         REFERENCES public.businesses(id),
  business_name           text,
  business_lat            float8,
  business_lng            float8,
  product_id              uuid,
  product_name            text,
  items                   jsonb,        -- snapshot autoritativo del carrito; inmutable
  subtotal_productos      float8,

  -- Financiero (calculado exclusivamente por el servidor)
  service_fee             float8,
  total_amount            float8,
  costo_agente            float8,
  ganancia_orbi           float8,
  pricing_rule            text,         -- siempre "ORBI_MOTOR_1.0"
  motor_params_version    integer,

  -- Agente
  selected_agent_id       uuid,
  selected_agent_name     text,
  selected_agent_lat      float8,
  selected_agent_lng      float8,
  selected_agent_zone     text,
  selected_agent_vehicle  text,
  selected_agent_trust    text,
  active_agent_id         uuid,

  -- Pago
  payment_status          text,         -- siempre "pendiente" al crear
  payment_method          text,

  -- Routing (metadata — no afecta precios)
  distance_km             float8,
  duration_min            float8,
  route_geometry          jsonb,        -- [[lat,lng], ...] en orden Leaflet

  -- Metadata
  sector                  text,
  created_at              timestamptz,
  updated_at              timestamptz,
  accepted_at             timestamptz
);
```

### Columnas pendientes de agregar (Migración v3)

Estas columnas no existen todavía en producción. La migración es aditiva — todas `nullable`, ninguna `NOT NULL`.

```sql
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS origin_place_name       text,
  ADD COLUMN IF NOT EXISTS origin_provider_id      text,   -- "photon:N:12345678"
  ADD COLUMN IF NOT EXISTS origin_provider         text,   -- "photon"|"nominatim"|"gps"|"map"|"manual"
  ADD COLUMN IF NOT EXISTS origin_confirmed        boolean,
  ADD COLUMN IF NOT EXISTS origin_reference        text,   -- "casa amarilla junto a la cancha"
  ADD COLUMN IF NOT EXISTS destination_place_name  text,
  ADD COLUMN IF NOT EXISTS destination_provider_id text,
  ADD COLUMN IF NOT EXISTS destination_provider    text,
  ADD COLUMN IF NOT EXISTS destination_confirmed   boolean,
  ADD COLUMN IF NOT EXISTS destination_reference   text;
```

### Estados válidos de misión

```
esperando_negocio → preparando → por_tomar → aceptada → en_mision → cumplida
                                                                    ↘ cancelada
cumplida | cancelada → archivada
```

### Reglas de negocio críticas

- `payment_status` al crear siempre es `"pendiente"` — el servidor lo fuerza, el cliente no puede cambiarlo.
- `items` es el snapshot autoritativo del carrito — se genera solo en misiones de catálogo, es inmutable post-INSERT.
- Los campos financieros (`service_fee`, `total_amount`, `costo_agente`, `ganancia_orbi`) son calculados exclusivamente por el servidor. Nunca confiar en los valores del cliente.
- `pricing_rule` siempre es `"ORBI_MOTOR_1.0"` (constante de `lib/pricing/config.ts`).
- `motor_params_version` referencia la fila de `motor_params` que se usó para calcular los precios.

---

## Tabla: `customers`

**Propósito:** Clientes de ORBI, registrados o en proceso de registro.

```sql
CREATE TABLE public.customers (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid         REFERENCES auth.users(id),  -- ÚNICA identidad válida
  name            text,
  phone           text,        -- normalizado: solo dígitos
  email           text,
  is_registered   boolean      DEFAULT false,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);
```

### Reglas críticas

- `auth_user_id` es la ÚNICA identidad del cliente en todo el sistema.
- La vinculación de un customer a un `auth_user_id` NUNCA se hace solo porque el correo coincide.
- Un customer con `is_registered = true` ya tiene cuenta activa en Supabase Auth.
- No existen customers con `auth_user_id` compartido entre distintos registros.

### Operaciones permitidas

| Operación | Endpoint | Restricción |
|-----------|----------|-------------|
| Crear o actualizar | `POST /api/customers/upsert` | Solo con `auth_user_id` verificado |
| Activar cuenta | `POST /api/customers/activate` | Solo admin o el propio usuario |
| Listar | `GET /api/customers/list` | Solo admin (JWT verificado) |

---

## Tabla: `agents`

**Propósito:** Agentes de la red ORBI.

```sql
CREATE TABLE public.agents (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id         uuid         REFERENCES auth.users(id),
  name            text         NOT NULL,
  zone            text,
  vehicle         text,
  trust_level     text,
  status          text,        -- "Disponible" | "Fuera de servicio"  (AGENT_STATUS en lib/agents.ts)
  service_type    text,
  lat             float8,      -- actualizado por GPS watcher cada 20s/15m
  lng             float8,
  is_on_orbit     boolean      DEFAULT false,
  radius_km       float8,
  availability    text,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);
```

### GPS del agente

El GPS watcher (`lib/agent-gps.ts`) actualiza `lat` y `lng` en tiempo real:
- Condición de escritura: movimiento ≥ 15 m Y tiempo ≥ 20 s desde último write
- El watcher es un singleton a nivel de módulo (sobrevive navegación de página)
- El cliente ve la posición actual del agente vía suscripción realtime

---

## Tabla: `businesses`

**Propósito:** Negocios locales que participan en el catálogo de ORBI.

```sql
CREATE TABLE public.businesses (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    uuid         REFERENCES auth.users(id),
  name            text         NOT NULL,
  sector          text,
  email           text,
  lat             float8,
  lng             float8,
  base_text       text,        -- dirección o descripción de ubicación
  is_active       boolean      DEFAULT false,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);
```

---

## Tabla: `requests`

**Propósito:** Solicitudes de registro de nuevos agentes y negocios. Los interesados las envían desde el formulario público (`AgentAccessPanel` / `BusinessAccessPanel`) usando la clave anónima — sin cuenta. El admin las revisa y aprueba o rechaza desde `AdminPendingRequests`.

```sql
CREATE TABLE public.requests (
  id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  type      text         NOT NULL,   -- "agent" | "business"
  status    text         NOT NULL DEFAULT 'pending',  -- "pending" | "approved" | "rejected"
  name      text         NOT NULL,
  email     text         NOT NULL,
  phone     text         NOT NULL,
  message   text,
  created_at timestamptz DEFAULT now()
);
```

**Reglas de acceso:**
- INSERT: clave anónima (cualquier visitante puede enviar solicitud). `addPendingRequest()` en `lib/pendingRequests.ts` no encadena `.select()` tras el INSERT porque la política RLS anon no incluye SELECT — hacerlo revierte la transacción completa (comportamiento de PostgREST con `Prefer: return=representation`).
- SELECT / UPDATE: solo service_role (admin).

**APIs que usan esta tabla:**
- `GET /api/requests/list` — lista solicitudes pendientes (admin)
- `POST /api/requests/update` — aprueba o rechaza (admin)
- `DELETE /api/requests/delete` — elimina solicitud (admin)

---

## Tabla: `products`

**Propósito:** Catálogo de productos por negocio.

```sql
CREATE TABLE public.products (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid         REFERENCES public.businesses(id) ON DELETE CASCADE,
  name            text         NOT NULL,
  price           float8       NOT NULL,  -- ÚNICO precio autoritativo — solo el servidor lee esto
  category        text,
  is_active       boolean      DEFAULT true,
  created_at      timestamptz  DEFAULT now(),
  updated_at      timestamptz  DEFAULT now()
);
```

### Regla crítica

El `price` de `products` es la única fuente de verdad para precios de catálogo. El backend lo lee directamente al crear la misión — el cliente no puede enviar precios de productos que el servidor acepte.

---

## Tabla: `motor_params`

**Propósito:** Parámetros de pricing configurables sin redeploy de código.

```sql
CREATE TABLE public.motor_params (
  id              integer      PRIMARY KEY,
  version         integer      NOT NULL,
  tarifa_base     float8,      -- tarifa base misiones directas (default: 45)
  costo_por_km    float8,      -- costo por km (default: 12)
  comision_agente float8,      -- fracción al agente 0-1 (default: 0.70)
  created_at      timestamptz  DEFAULT now()
);
```

### Fallback

Si `motor_params` no está disponible o la lectura falla, el servidor usa los valores hardcodeados en `lib/pricing/config.ts`:

```typescript
export const DIRECT = {
  tarifaBase: 45,
  costoPorKm: 12,
  comisionAgente: 0.70,
  tarifaMinima: 45,
}
```

El fallback se registra como `warn` en el `event_log`.

---

## Tabla: `ledger_entries`

**Propósito:** Libro contable de transacciones económicas de la red ORBI.

Consultado por `/api/ledger/summary` para el panel admin de economía.

---

## Tabla: `event_log`

**Propósito:** Auditoría completa de eventos del sistema. Cada API Route escribe aquí al inicio, al éxito y al error.

```sql
CREATE TABLE public.event_log (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text         NOT NULL,   -- e.g. "api.create.error_422"
  severity        text,                    -- "info" | "warn" | "error"
  source          text,                    -- "api_route" | "client" | "system"
  entity_type     text,                    -- "mission" | "customer" | etc.
  entity_id       text,
  actor_type      text,                    -- "customer" | "agent" | "admin" | "system"
  payload         jsonb,
  error_detail    text,
  http_status     integer,
  duration_ms     integer,
  request_id      uuid,
  created_at      timestamptz  DEFAULT now()
);
```

---

## Realtime Subscriptions

Todos los componentes que necesitan actualizaciones en tiempo real usan `subscribeToTableChanges()`:

```typescript
// lib/supabase.ts
export function subscribeToTableChanges(
  table: string,
  callback: () => void,
  options?: { schema?: string }
): () => void {
  // Crea un canal único por subscripción (Math.random en el nombre)
  // Escucha INSERT, UPDATE, DELETE
  // Retorna función de cleanup (unsubscribe)
}
```

| Componente | Tablas suscritas |
|------------|-----------------|
| `ServiceRequestFlow` | `missions`, `agents` |
| `MissionOrbitTracker` | `missions`, `agents` |
| Panel del agente | `missions` |
| Panel admin | `missions`, `agents`, `businesses`, `customers` |

---

## Motor de Precios

### Misiones directas (Mandado, Entrega, Traslado, etc.)

```
distancia = haversine(agente.lat, agente.lng, origen.lat, origen.lng)
serviceFee = tarifaBase + costoPorKm * distancia
costoAgente = serviceFee * comisionAgente
gananciaOrbi = serviceFee * (1 - comisionAgente)
totalCliente = serviceFee
```

Si el cliente envía `distance_km` (OSRM):
- Se acepta solo si está dentro del ±25% del haversine calculado por el servidor
- Si difiere más del 25%: se usa el haversine del servidor (posible manipulación)

### Misiones de catálogo (Compra local)

```
distancia = haversine(negocio.lat, negocio.lng, destino.lat, destino.lng)
```

Tramos de tarifa base:
```
≤ 2 km  → $25
≤ 5 km  → $35
≤ 8 km  → $45
≤ 12 km → $60
≤ 20 km → $80
> 20 km → outOfRange = true → Error 422
```

Recargos por valor del pedido:
```
subtotal ≥ $600 → +$20
subtotal ≥ $300 → +$10
```

Límite operativo: `CATALOG.radioMaximoKm = 30 km` → si la distancia supera este valor → HTTP 422.

---

## Migraciones Pendientes

### Migración GEO-v3 (pendiente de autorización)

```sql
-- Agregar columnas de georreferenciación enriquecida
-- TODAS nullable — los INSERTs existentes no se ven afectados

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS origin_place_name       text,
  ADD COLUMN IF NOT EXISTS origin_provider_id      text,
  ADD COLUMN IF NOT EXISTS origin_provider         text,
  ADD COLUMN IF NOT EXISTS origin_confirmed        boolean,
  ADD COLUMN IF NOT EXISTS origin_reference        text,
  ADD COLUMN IF NOT EXISTS destination_place_name  text,
  ADD COLUMN IF NOT EXISTS destination_provider_id text,
  ADD COLUMN IF NOT EXISTS destination_provider    text,
  ADD COLUMN IF NOT EXISTS destination_confirmed   boolean,
  ADD COLUMN IF NOT EXISTS destination_reference   text;
```

**Plan de rollback de esta migración:**

```sql
ALTER TABLE public.missions
  DROP COLUMN IF EXISTS origin_place_name,
  DROP COLUMN IF EXISTS origin_provider_id,
  DROP COLUMN IF EXISTS origin_provider,
  DROP COLUMN IF EXISTS origin_confirmed,
  DROP COLUMN IF EXISTS origin_reference,
  DROP COLUMN IF EXISTS destination_place_name,
  DROP COLUMN IF EXISTS destination_provider_id,
  DROP COLUMN IF EXISTS destination_provider,
  DROP COLUMN IF EXISTS destination_confirmed,
  DROP COLUMN IF EXISTS destination_reference;
```

Nota: el rollback elimina datos. Si ya se crearon misiones con datos enriquecidos, se perderían esos campos. Los demás campos de la misión no se afectan.

---

## Supabase Auth

### Configuración

- **Confirm email:** OFF — decisión definitiva del MVP
- **Proveedor:** email + contraseña (email/password)
- **Sin OAuth social** (Google, Facebook, etc.) — MVP
- **Email de recuperación:** enviado vía Resend (configurado en el dashboard de Supabase)
- **`redirectTo` en recovery:** `${window.location.origin}/pedir` (configurable desde el componente)

### Flujo de recuperación de contraseña

```
Cliente en /pedir → AuthGatePanel (modo "recovery") 
  → supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/pedir" })
  → Supabase envía email con link
  → Usuario hace clic → llega a /pedir con token en URL
  → SupabaseAuthListener detecta PASSWORD_RECOVERY
  → router.push("/usuarios/reset-password?returnTo=%2Fpedir")
  → Usuario ingresa nueva contraseña
  → supabase.auth.updateUser({ password })
  → setTimeout(1500) → router.push("/pedir")
  → Draft intacto en localStorage
```
