# ORBI — Contrato de Arquitectura (Invariants)

> **Versión:** 2026-07-10  
> **Estatus:** Documento normativo. Las reglas aquí tienen el mismo peso que una decisión de arquitectura firmada.  
> **Jerarquía:** Este documento está por encima de cualquier criterio técnico de una IA o de un desarrollador. Solo Diego puede modificarlo, y únicamente con justificación explícita documentada en ORBI_DECISIONS.md.

---

## Cómo leer este documento

Cada invariante tiene:

- **ID** — identificador permanente. No cambia aunque el invariante se actualice.
- **Regla** — lo que no puede romperse, en una oración.
- **Por qué** — el incidente o razonamiento que produjo esta regla.
- **Señal de violación** — cómo reconocer que la regla está siendo rota, en código o en PR.
- **Consecuencia** — qué puede salir mal si se viola.

Una regla que no tiene "Por qué" es especulativa. Todas las reglas aquí tienen razón documentada.

---

## Bloque I — Identidad y Autenticación

### INV-001: auth_user_id es la única identidad del cliente

**Regla:** La identidad de un cliente en todo el sistema es exclusivamente `auth_user_id` (UUID de `auth.users`). Ningún otro campo — teléfono, correo, nombre, device fingerprint — puede usarse para afirmar quién es el usuario.

**Por qué:** ORBI acumuló customers duplicados en producción. Un agente (Nicolás) aparecía en cinco registros distintos porque la identidad se infería de datos que podían coincidir entre personas. `auth_user_id` es el único identificador que Supabase garantiza único, no transferible y verificado por Auth.

**Señal de violación:**
```typescript
// ❌ Identidad inferida por datos personales
customers.select().eq("email", email)   // puede devolver el customer de otra persona
customers.select().eq("phone", phone)   // lo mismo

// ✅ Identidad verificada
customers.select().eq("auth_user_id", verifiedAuthUserId)
```

**Consecuencia:** Un cliente puede acceder a las misiones de otra persona. Regresión crítica de seguridad.

---

### INV-002: La vinculación de customer NUNCA por coincidencia de datos

**Regla:** Vincular un registro de `public.customers` a un `auth_user_id` requiere verificación explícita de que ese `auth_user_id` le pertenece al mismo customer. La coincidencia de correo, teléfono o nombre no es suficiente.

**Por qué:** Dos personas pueden compartir un correo (familia, trabajo compartido). La vinculación automática por email creó en producción un bug donde un nuevo registro "heredaba" el historial de misiones de alguien más.

**Señal de violación:**
```typescript
// ❌ Vinculación por coincidencia de correo
const existing = await supabase.from("customers").select().eq("email", email).single();
if (existing) await supabase.from("customers").update({ auth_user_id: newUserId }).eq("id", existing.id);

// ✅ Solo vincular si auth_user_id ya coincide, o si el registro es nuevo
```

**Consecuencia:** Suplantación de identidad. Un usuario malicioso con el correo de otra persona hereda su historial y acceso.

---

### INV-003: Sin usuarios anónimos de Supabase Auth

**Regla:** ORBI no crea sesiones anónimas en Supabase Auth. No existe código que llame `supabase.auth.signInAnonymously()` ni que migre sesiones anónimas a cuentas registradas.

**Por qué:** El "upgrade" de anónimo a registrado es una fuente de bugs de identidad. ORBI resuelve el problema distinto: el cliente puede explorar todo el flujo sin cuenta; el AuthGate aparece solo cuando es estrictamente necesario (al crear la misión).

**Señal de violación:**
```typescript
// ❌ Nunca
await supabase.auth.signInAnonymously();
// ❌ Nunca
await supabase.auth.linkIdentity({ provider: "anonymous" });
```

**Consecuencia:** Estados inconsistentes entre la sesión anónima y la registrada; duplicación de customers; misiones huérfanas.

---

### INV-004: Confirm email permanece OFF

**Regla:** La configuración de Supabase Auth "Confirm email" está permanentemente desactivada en el proyecto de ORBI. No se activa, ni temporalmente, ni para pruebas.

**Por qué:** Con confirm email ON, un usuario que se registra durante el flujo de pedido debe interrumpir el proceso para verificar su correo. El draft y el contexto del pedido se pueden perder. ORBI opera en comunidades donde la confianza es social, no verificada por email.

**Señal de violación:** El switch "Confirm email" en Supabase Dashboard > Authentication > Providers > Email está en ON.

**Consecuencia:** `supabase.auth.signUp()` devuelve usuario pero con `email_confirmed_at: null`. El usuario no puede hacer nada hasta verificar. El flujo de pedido se rompe.

---

### INV-005: Las cuatro instancias de Supabase permanecen aisladas

**Regla:** Cada actor del sistema (cliente, agente, negocio, admin) usa su propia instancia del cliente Supabase JS con su propio `storageKey` y su propio storage. Las instancias no se comparten entre actores.

| Actor | storageKey | Storage |
|-------|-----------|---------|
| Cliente | `sb-orbi-user` | localStorage |
| Agente | `sb-orbi-agent` | localStorage |
| Negocio | `sb-orbi-business` | localStorage |
| Admin | `sb-orbi-admin` | sessionStorage |

**Por qué:** Sin aislamiento, un agente logueado en el mismo browser que un cliente sobreescribe la sesión de Supabase y el cliente pierde su acceso.

**Señal de violación:**
```typescript
// ❌ Usar el cliente del cliente para operaciones del agente
import { supabase } from "@/lib/supabase";  // solo para clientes
// en código del agente
```

**Consecuencia:** Pérdida de sesión entre actores. Bugs imposibles de reproducir en desarrollo pero frecuentes en uso real donde agente y cliente comparten dispositivo.

---

### INV-006: Sin backfill por teléfono o correo

**Regla:** ORBI no realiza ninguna operación que vincule, actualice o migre datos de misiones o customers basándose únicamente en la coincidencia de teléfono o correo entre registros.

**Por qué:** Los datos de contacto son fuzzy — se normalizan diferente, se comparten entre personas, cambian con el tiempo. Usar coincidencia de datos para backfill produce vinculaciones incorrectas que son difíciles de detectar y revertir.

**Señal de violación:**
```typescript
// ❌ Backfill de misiones por teléfono
UPDATE missions SET user_id = $newUserId WHERE requester_phone = $phone;
// ❌ Vinculación de customer por correo
UPDATE customers SET auth_user_id = $uid WHERE email = $email;
```

**Consecuencia:** Un usuario hereda las misiones de otra persona. Violación de privacidad.

---

## Bloque II — Creación de Misión

### INV-007: La misión solo se crea al presionar "Poner en órbita"

**Regla:** `createMission()` solo puede ser llamada desde `handleSendMissionToAgent()` y desde `handleCreateWaitingRequest()`. Ambas se activan exclusivamente por acción explícita del usuario (presionar un botón). Ningún efecto de React, ningún callback de autenticación, ningún componente de búsqueda o selección de lugar puede llamar `createMission()`.

**Por qué:** Una versión anterior llamaba `createMission()` automáticamente desde `handleAuthGateSuccess()`. El resultado fue misiones creadas sin que el usuario pudiera revisar el resumen — con datos incorrectos, sin el agente correcto, o duplicadas.

**Señal de violación:**
```typescript
// ❌ En handleAuthGateSuccess
function handleAuthGateSuccess(userId: string, ...) {
  setAuthUserId(userId);
  createMission(...);  // ← NUNCA
}

// ❌ En useEffect
useEffect(() => {
  if (isReady) createMission(...);  // ← NUNCA
}, [isReady]);

// ✅ Solo aquí
async function handleSendMissionToAgent() { await createMission(...); }
async function handleCreateWaitingRequest() { await createMission(...); }
```

**Consecuencia:** Misiones fantasma creadas en Supabase sin intención del usuario. El usuario ve una misión activa que no solicitó. El agente recibe una misión incorrecta.

---

### INV-008: draftId no cambia durante una sesión de pedido

**Regla:** El `draftId` generado al primer auto-save del draft es el mismo UUID que llega al backend como campo `id` de la misión. No se regenera, no se sobreescribe, no se remplaza con un UUID nuevo al presionar "Poner en órbita".

**Por qué:** El `draftId` es el idempotency key. Si cambia entre el primer auto-save y el momento de crear la misión, el backend no puede detectar que ya existe una misión con ese pedido y la crea duplicada.

**Señal de violación:**
```typescript
// ❌ Generar un nuevo UUID al crear la misión
const missionId = crypto.randomUUID();  // ignorando draftId
await createMission({ id: missionId, ... });

// ✅ Usar el draftId existente
await createMission({ id: draftId ?? undefined, ... });
```

**Consecuencia:** Con pérdida de red después del INSERT: el segundo intento crea una segunda misión. El cliente paga dos veces; el agente recibe dos asignaciones.

---

### INV-009: idempotencyKey === draftId siempre

**Regla:** En el objeto `OrderDraft`, `idempotencyKey` es siempre igual a `draftId`. Son el mismo valor. `idempotencyKey` existe como campo explícito para que cualquier código que consuma el draft entienda su rol sin necesidad de conocer la convención de `draftId`.

**Por qué:** Ver INV-008. La redundancia es intencional y documentada.

**Señal de violación:**
```typescript
// ❌ Diferente valor
const draft: OrderDraft = {
  draftId: crypto.randomUUID(),
  idempotencyKey: crypto.randomUUID(),  // diferente — rompe la invariante
  ...
};
```

**Consecuencia:** El backend recibe un idempotency key diferente al `id` de la misión, anulando toda protección contra duplicados.

---

### INV-010: El backend verifica idempotencia antes de INSERT

**Regla:** `/api/missions/create` siempre consulta si ya existe una misión con el `id` recibido antes de hacer INSERT. Si existe, devuelve la misión existente con HTTP 200 sin hacer nada más.

**Por qué:** Sin este check, el segundo request (por timeout, doble-clic o retry) crearía una segunda misión incluso con el mismo `id` si el INSERT no tiene restricción UNIQUE.

**Señal de violación:**
```typescript
// ❌ INSERT sin check previo
await admin.from("missions").insert(missionRow);

// ✅ Check previo
const { data: existing } = await admin.from("missions").select().eq("id", id).maybeSingle();
if (existing) return NextResponse.json({ mission: existing });
await admin.from("missions").insert(missionRow);
```

**Consecuencia:** Misiones duplicadas en Supabase con el mismo contenido. El agente recibe múltiples asignaciones del mismo pedido.

---

### INV-011: El draft se limpia SOLO en éxito confirmado de creación de misión

**Regla:** `clearDraft()` se llama únicamente después de recibir una respuesta HTTP exitosa de `/api/missions/create`. No se limpia antes de hacer el request, no se limpia en el `finally` del try-catch, no se limpia ante cualquier otro evento (logout, navegación, timeout).

**Por qué:** Si el draft se limpia antes de confirmar el éxito, y la red falla, el usuario pierde su pedido y no puede hacer el retry. El draftId desapareció y con él la protección de idempotencia.

**Señal de violación:**
```typescript
// ❌ Limpiar antes de confirmar éxito
clearDraft();
const mission = await createMission(...);  // si esto falla, el draft ya no existe

// ✅ Limpiar solo en éxito
const mission = await createMission(...);
if (mission) {
  clearDraft();
  setDraftId(null);
}
```

**Consecuencia:** Pedido perdido. El usuario debe empezar desde cero. El draftId que servía de idempotency key ya no existe.

---

## Bloque III — Precios y Datos Financieros

### INV-012: El servidor es la única autoridad para precios financieros

**Regla:** Los campos `service_fee`, `total_amount`, `costo_agente`, `ganancia_orbi` son calculados exclusivamente por el servidor en `/api/missions/create`. Los valores que el cliente envía para esos campos son ignorados y sobreescritos.

**Por qué:** Sin esto, cualquier usuario con DevTools puede modificar el `service_fee` en el body del request y pagar lo que quiera.

**Señal de violación:**
```typescript
// ❌ En el backend, usar precio del cliente
const missionRow = {
  service_fee: body.service_fee,  // precio del cliente — nunca
  ...
};

// ✅ Precio calculado por el servidor
const serviceFee = tarifaBase + costoPorKm * distancia;
const missionRow = { service_fee: serviceFee, ... };
```

**Consecuencia:** Fraude económico. Un usuario puede pagar $0 por un servicio de $50.

---

### INV-013: payment_status siempre "pendiente" al crear

**Regla:** El campo `missions.payment_status` siempre es `"pendiente"` al momento del INSERT. El servidor lo fuerza independientemente de lo que envíe el cliente.

**Por qué:** El pago no se confirma al crear la misión. Confirmarlo en el INSERT crearía misiones con estado de pago incorrecto.

**Señal de violación:**
```typescript
// ❌ Usar payment_status del cliente
payment_status: body.payment_status,

// ✅ Forzar siempre
payment_status: "pendiente",
```

**Consecuencia:** Misiones marcadas como pagadas antes de que el agente las complete.

---

### INV-014: items es el snapshot autoritativo e inmutable del carrito

**Regla:** En misiones de catálogo, el campo `missions.items` contiene el snapshot del carrito tal como lo calculó el servidor al crear la misión. Es inmutable post-INSERT. No se actualiza por ninguna razón después de creada la misión.

**Por qué:** Si el precio de un producto cambia después de que se crea la misión, el agente ya fue asignado con base en el precio original. Cambiar `items` retroactivamente crea inconsistencias contables.

**Señal de violación:**
```typescript
// ❌ Actualizar items post-INSERT
await admin.from("missions").update({ items: newItems }).eq("id", missionId);
```

**Consecuencia:** Inconsistencia entre lo que el cliente pidió, lo que el agente entregó y lo que el libro contable registró.

---

## Bloque IV — Draft

### INV-015: Draft con draftId válido no se descarta por schemaVersion desconocida baja

**Regla:** Si un draft tiene `schemaVersion` anterior a la actual pero tiene `draftId` válido y no está expirado, se migra; no se descarta. Solo se descarta si la `schemaVersion` es mayor a la conocida (versión futura) o si no tiene `draftId`.

**Por qué:** Un usuario puede dejar un pedido a medias y volver días después con una versión actualizada del código. Descartar su draft porque cambió el schema es perder un pedido que el usuario consideraba activo.

**Señal de violación:**
```typescript
// ❌ Descartar por schema mismatch sin intentar migrar
if (parsed.schemaVersion !== SCHEMA_VERSION) {
  localStorage.removeItem(DRAFT_KEY);
  return null;
}

// ✅ Intentar migrar si la versión es conocida y anterior
if (parsed.schemaVersion === 1 && SCHEMA_VERSION === 2) {
  return migrateDraftV1ToV2(parsed);
}
```

**Consecuencia:** El usuario pierde un pedido en progreso sin aviso.

---

### INV-016: lat:0, lng:0 es una coordenada válida

**Regla:** El valor `0` para latitud o longitud es una coordenada válida (frente a la costa de África, en el Atlántico). ORBI nunca trata `lat === 0` o `lng === 0` como "sin coordenadas". La validación de coordenadas es siempre:

```typescript
// ✅ Coordenada válida
const isValid = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng);

// ❌ Falsy check — rechaza la coordenada 0,0 incorrectamente
const isValid = !!lat && !!lng;
```

**Por qué:** El Diseño v3 de geocodificación incluyó inicialmente `{ lat: 0, lng: 0 }` como centinela de "sin contexto". Esto es un error: enviarlo como sesgo a Photon devuelve resultados de África occidental.

**Consecuencia:** Sugerencias de lugares incorrectas. Una misión con origen `{lat: 0, lng: 0}` puede ser aceptada silenciosamente como válida.

---

## Bloque V — Geocodificación

### INV-017: Photon y Nominatim nunca se llaman desde el browser

**Regla:** El frontend nunca hace requests directos a `nominatim.openstreetmap.org` ni a `photon.komoot.io`. Todo acceso a esos servicios ocurre a través de `/api/geocoding/search` y `/api/geocoding/reverse` en el servidor de ORBI.

**Por qué:** Las llamadas directas desde el browser: (a) exponen la URL del proveedor, (b) violan la política de uso de Nominatim que requiere User-Agent identificable y máximo 1 req/s, (c) no permiten caché del lado del servidor, (d) generan CORS.

**Estado actual:** Las llamadas directas en `reverseGeocodePoint()` y `handleGeocodeLocation()` son deuda técnica documentada (`DEUDA-GEO-02`) que será eliminada en el Diseño v3.

**Señal de violación:**
```typescript
// ❌ Llamada directa desde el browser
fetch("https://nominatim.openstreetmap.org/reverse?...")
fetch("https://photon.komoot.io/api?...")

// ✅ Solo vía proxy
fetch("/api/geocoding/reverse?...")
fetch("/api/geocoding/search?...")
```

**Consecuencia:** Violación de términos de uso de OpenStreetMap. Riesgo de bloqueo del IP del servidor de ORBI.

---

### INV-018: Nominatim no se usa para autocomplete

**Regla:** Nominatim (ni ninguna de sus instancias) se usa para sugerir lugares mientras el usuario escribe. Solo se usa para geocodificación inversa puntual (un request por acción del usuario, no por keystroke).

**Por qué:** La política de uso de Nominatim prohíbe explícitamente el uso para autocomplete o sugerencias en tiempo real. El proveedor aprobado para autocomplete es Photon (Komoot).

**Señal de violación:**
```typescript
// ❌ Nominatim para autocomplete
useEffect(() => {
  if (query.length > 2) fetch(`/api/geocoding/search?q=${query}&provider=nominatim`);
}, [query]);
```

**Consecuencia:** Bloqueo del IP por parte de OpenStreetMap. La búsqueda de lugares deja de funcionar en toda la plataforma.

---

### INV-019: SearchCenter es null cuando no hay contexto geográfico

**Regla:** Cuando no existe contexto geográfico para sesgar la búsqueda de lugares (sin GPS activo, sin origen/destino confirmados, sin red con coordenadas configuradas), el `searchCenter` es `null`. Nunca se usa `{ lat: 0, lng: 0 }` como valor de "sin contexto".

**Por qué:** Ver INV-016. Además, `null` es inequívoco: cualquier código que recibe `null` sabe que no hay sesgo disponible y puede omitir los parámetros `lat/lon` de la query a Photon.

**Señal de violación:**
```typescript
// ❌ Coordenada cero como "sin contexto"
const searchCenter = userLocation ?? { lat: 0, lng: 0 };

// ✅ Null explícito
const searchCenter: SearchCenter | null = userLocation ?? null;
```

---

### INV-020: No hardcodear municipios, ciudades ni coordenadas de red

**Regla:** El código de ORBI no contiene nombres de municipios, ciudades, estados ni coordenadas específicas de ningún lugar. El centro operativo de la red se configura mediante variables de entorno (`NEXT_PUBLIC_NETWORK_LAT`, `NEXT_PUBLIC_NETWORK_LNG`).

**Por qué:** ORBI debe poder replicarse a cualquier municipio sin modificar el código. Hardcodear "Zumpahuacán" ata el sistema a esa ciudad; hardcodear `{ lat: 18.8349, lng: -99.5818 }` hace lo mismo de forma más silenciosa.

**Estado actual:** `buildLocalGeocodeQuery` y `zumpahuacanCenter` en `ServiceRequestFlow.tsx` son deuda técnica documentada (`DEUDA-GEO-03`, `DEUDA-GEO-04`) programada para eliminarse en el Diseño v3.

**Señal de violación:**
```typescript
// ❌ Ciudad hardcodeada
const query = `${text}, Zumpahuacán, Estado de México, México`;

// ❌ Coordenadas hardcodeadas
const center = { lat: 18.8349, lng: -99.5818 };

// ✅ Configurable por entorno
const center = process.env.NEXT_PUBLIC_NETWORK_LAT
  ? { lat: parseFloat(process.env.NEXT_PUBLIC_NETWORK_LAT), lng: parseFloat(process.env.NEXT_PUBLIC_NETWORK_LNG!) }
  : null;
```

**Consecuencia:** ORBI no puede operar en otra ciudad sin modificar código fuente.

---

## Bloque VI — Seguridad y Datos

### INV-021: No modificar RLS

**Regla:** Las políticas de Row Level Security (RLS) de Supabase no se modifican sin diseño explícito, revisión de seguridad y aprobación del owner. Las API Routes bypassean RLS usando `SUPABASE_SERVICE_ROLE_KEY` en el servidor; el frontend usa la clave anónima con las restricciones de RLS activas.

**Por qué:** RLS es la primera línea de defensa contra accesos no autorizados a datos. Un cambio accidental puede exponer todos los datos de `missions` o `customers` a cualquier usuario anónimo.

**Señal de violación:** Un PR que modifique políticas en `supabase/migrations/` o en el dashboard sin justificación documentada.

**Consecuencia:** Exposición de datos de todos los usuarios.

---

### INV-022: Los campos de misión con datos del agente son snapshot en el momento de asignación

**Regla:** `selected_agent_lat`, `selected_agent_lng`, `selected_agent_zone`, `selected_agent_vehicle`, `selected_agent_trust` capturan el estado del agente al momento de asignarse la misión. No se actualizan con cambios posteriores del agente.

**Por qué:** La asignación es un contrato: el cliente aceptó a este agente con estas características. Si el agente cambia de zona o vehículo después, la misión ya aceptada no debe verse afectada.

**Señal de violación:**
```typescript
// ❌ Actualizar datos del agente en la misión post-asignación
await admin.from("missions").update({
  selected_agent_zone: agent.zone  // zona actual, no la del momento de asignación
}).eq("id", missionId);
```

---

## Bloque VII — Calidad del Código

### INV-023: TypeScript estricto — sin as any ni operador !

**Regla:** ORBI no usa `as any` para silenciar errores de TypeScript, ni el operador `!` (non-null assertion) para afirmar que un valor no es null cuando TypeScript no puede probarlo. Los errores de tipo se resuelven correctamente.

**Por qué:** `as any` y `!` ocultan bugs en tiempo de compilación que explotan en runtime. ORBI tiene flujos críticos (draft, auth, misión) donde un null no manejado puede causar pérdida silenciosa de datos.

**Señal de violación:**
```typescript
// ❌
const userId = session.userId as string;
const lat = details.originLat!;

// ✅
if (!session.userId) throw new Error("No authenticated");
const userId: string = session.userId;

if (details.originLat === null) return;
const lat: number = details.originLat;
```

**Consecuencia:** Bugs en producción que TypeScript habría detectado en desarrollo. Código que pasa CI pero falla en runtime.

---

### INV-024: No agregar complejidad nueva sin eliminar otra equivalente

**Regla:** Antes de agregar un nuevo abstraction layer, un nuevo estado de React, una nueva tabla de Supabase, o una nueva librería, debe eliminarse o simplificarse algo de complejidad equivalente. La base de código no crece en complejidad neta sin justificación operativa.

**Por qué:** `ServiceRequestFlow.tsx` ya tiene ~3680 líneas. Más abstracciones sin eliminar las existentes producen código que nadie puede entender ni mantener.

**Señal de violación:** Un PR que agrega un nuevo hook, un nuevo contexto de React, una nueva tabla, o una nueva librería sin documentar qué complejidad existente se elimina.

---

### INV-025: No diseñar para problemas que aún no existen en producción

**Regla:** Las decisiones técnicas se toman con evidencia operativa, no con anticipación especulativa. Los sistemas de caché, rate limiting, paginación, notificaciones y multi-región se implementan cuando el tráfico real los justifica, no antes.

**Por qué:** ORBI es un MVP. El costo de sobre-ingeniería (tiempo, bugs, complejidad) supera el riesgo de los problemas que se anticipan pero que pueden no llegar.

**Señal de violación:** "Deberíamos agregar Redis ahora porque cuando escale vamos a necesitarlo." La respuesta correcta es registrar la deuda técnica y esperar evidencia.

---

## Resumen de Invariantes

| ID | Bloque | Regla (una línea) |
|----|--------|-------------------|
| INV-001 | Identidad | `auth_user_id` es la única identidad del cliente |
| INV-002 | Identidad | Vinculación de customer nunca por coincidencia de datos |
| INV-003 | Auth | Sin usuarios anónimos de Supabase Auth |
| INV-004 | Auth | Confirm email permanece OFF |
| INV-005 | Auth | Cuatro instancias de Supabase aisladas por storageKey |
| INV-006 | Auth | Sin backfill por teléfono o correo |
| INV-007 | Misión | `createMission()` solo al presionar "Poner en órbita" |
| INV-008 | Misión | `draftId` no cambia durante una sesión de pedido |
| INV-009 | Misión | `idempotencyKey === draftId` siempre |
| INV-010 | Misión | El backend verifica idempotencia antes de INSERT |
| INV-011 | Misión | El draft se limpia solo en éxito confirmado |
| INV-012 | Precios | El servidor es la única autoridad para precios financieros |
| INV-013 | Precios | `payment_status` siempre `"pendiente"` al crear |
| INV-014 | Precios | `items` es inmutable post-INSERT |
| INV-015 | Draft | Draft con `draftId` válido se migra, no se descarta |
| INV-016 | Draft | `lat:0, lng:0` es coordenada válida, no centinela |
| INV-017 | Geo | Photon y Nominatim nunca desde el browser |
| INV-018 | Geo | Nominatim no se usa para autocomplete |
| INV-019 | Geo | `SearchCenter` es `null` cuando no hay contexto |
| INV-020 | Geo | No hardcodear municipios, ciudades ni coordenadas de red |
| INV-021 | Seguridad | No modificar RLS sin diseño y aprobación |
| INV-022 | Datos | Datos del agente en misión son snapshot de asignación |
| INV-023 | Código | Sin `as any` ni operador `!` para silenciar TypeScript |
| INV-024 | Código | No agregar complejidad sin eliminar otra equivalente |
| INV-025 | Código | No diseñar para problemas sin evidencia operativa |

---

## Protocolo de modificación de este documento

1. Cualquier propuesta de modificar o eliminar un invariante debe ir acompañada de:
   - El ID del invariante a modificar
   - La razón técnica por la que la regla ya no aplica o debe cambiar
   - El incidente o razonamiento que justifica el cambio
   - Una nueva decisión en ORBI_DECISIONS.md que documente el cambio
2. La modificación solo puede ser aprobada por Diego explícitamente en la conversación.
3. Un desarrollador o IA que detecte que una regla fue violada en producción debe: (a) revertir el cambio, (b) documentar el incidente, (c) verificar que la invariante sigue siendo aplicable, (d) proponer refuerzo del test correspondiente en ORBI_QA.md.

**Este documento no se actualiza como parte de ningún sprint de feature. Solo se actualiza cuando una invariante existente resulta incorrecta o cuando una nueva regla emerge de un incidente real.**

---

## Invariantes de prueba

Estas reglas no gobiernan el código de producción sino el entorno de prueba. Su violación produce falsos positivos que llevan a diagnósticos incorrectos.

### INV-TEST-001: Cliente y agente no comparten instancia de Safari con watchPosition activo

**Regla:** Las pruebas del flujo del cliente (GPS, pedidos consecutivos) deben ejecutarse en un dispositivo o pestaña que no tenga una sesión de agente en órbita activa.

**Por qué:** `lib/agent-gps.ts` mantiene un `watchPosition` module-level que sobrevive a la navegación. Compartir la instancia con un agente en órbita produce TIMEOUT (código 3) en el segundo `getCurrentPosition` del cliente — un falso positivo que no existe en producción.

**Evidencia:** Incidente confirmado el 2026-07-15. Ver `ORBI_QA.md → INV-TEST-001` para el detalle completo.
