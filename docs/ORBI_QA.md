# ORBI — Checklist de QA

> **Versión:** 2026-07-09  
> **Tipo:** Pruebas manuales y funcionales  
> **Política:** Ejecutar el checklist completo antes de cualquier release. Los tests marcados con 🔴 son bloqueadores — no hacer release si fallan.

---

## Cómo ejecutar las pruebas

```bash
# Iniciar servidor de desarrollo
npm run dev

# Verificar TypeScript
npx tsc --noEmit

# El servidor debe iniciar sin errores en localhost:3000 (o el puerto que asigne)
```

---

## Sección A: Draft y Persistencia

### A1 — Creación del draft 🔴

**Precondición:** No hay draft en localStorage (`localStorage.removeItem("orbi_order_draft")`)  
**Pasos:**
1. Ir a `/pedir`
2. Seleccionar "Mandado"
3. Llenar "Detalle de la solicitud"
4. Esperar 1 segundo

**Verificar en DevTools > Application > localStorage:**
- Existe la clave `"orbi_order_draft"`
- `draftId` es un UUID válido (formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
- `idempotencyKey === draftId` (mismos valores)
- `schemaVersion === 2` (cuando se implemente v2) o `1` (actualmente)
- `selectedService.label === "Mandado"`

**Resultado esperado:** Draft guardado correctamente con draftId consistente.

---

### A2 — Persistencia tras recarga 🔴

**Precondición:** A1 completado; hay un draft activo  
**Pasos:**
1. Recargar la página (`F5` o `Ctrl+R`)

**Verificar:**
- El `draftId` en localStorage es EXACTAMENTE el mismo que antes de recargar
- Los datos del draft están intactos (servicio, detalles)

---

### A3 — Pantalla de choice 🔴

**Precondición:** Draft activo con servicio seleccionado  
**Pasos:**
1. Ir a `/pedir` (con draft activo)

**Verificar:**
- Aparece el texto "Tienes un pedido pendiente."
- Aparece el texto "¿Deseas continuar donde lo dejaste o empezar uno nuevo?"
- Botón "Continuar pedido" visible
- Botón "Empezar uno nuevo" visible
- NO se muestra el formulario principal todavía

---

### A4 — Continuar pedido 🔴

**Precondición:** A3 completado  
**Pasos:**
1. Presionar "Continuar pedido"

**Verificar:**
- El `draftId` en localStorage es el MISMO que antes (no se regeneró)
- El servicio restaurado es el que se había seleccionado
- Los detalles restaurados son los que se habían llenado
- El paso del wizard es el correcto

---

### A5 — Empezar uno nuevo 🔴

**Precondición:** A3 completado  
**Pasos:**
1. Presionar "Empezar uno nuevo"

**Verificar:**
- `localStorage.getItem("orbi_order_draft") === null`
- Se muestra el formulario inicial limpio
- No aparece la pantalla de choice

---

### A6 — Draft se limpia SOLO en éxito de misión 🔴

**Precondición:** Draft activo + usuario autenticado  
**Pasos:**
1. Completar el flujo hasta "Poner en órbita"
2. Presionar "Poner en órbita"
3. Verificar que la misión se creó exitosamente en Supabase

**Verificar:**
- `localStorage.getItem("orbi_order_draft") === null` — solo DESPUÉS del éxito
- Si hay un error de red simulado (DevTools > Network > Offline) antes de recibir respuesta, el draft PERMANECE en localStorage

---

### A7 — Un solo draft activo

**Pasos:**
1. Iniciar un pedido (draft A creado)
2. Continuar llenando el formulario
3. Verificar que en localStorage solo existe una clave `"orbi_order_draft"`

**Verificar:**
- Nunca hay dos drafts simultáneos
- El segundo auto-save sobrescribe el primero

---

## Sección B: Autenticación

### B1 — Registro desde AuthGatePanel 🔴

**Precondición:** Usuario sin cuenta; pedido completo hasta el botón "Poner en órbita"  
**Pasos:**
1. Presionar "Poner en órbita" sin estar autenticado
2. El AuthGatePanel aparece en modo "register"
3. Llenar nombre, teléfono, correo nuevo, contraseña
4. Presionar "Crear cuenta"

**Verificar:**
- La cuenta se crea en Supabase Auth
- El customer se crea/actualiza en `public.customers`
- `handleAuthGateSuccess` es llamado
- **La misión NO se crea automáticamente**
- El usuario ve el resumen del pedido con botón "Poner en órbita" activo
- El `draftId` NO ha cambiado

---

### B2 — AuthGateSuccess no crea misión 🔴

**Precondición:** B1 completado  
**Verificar:**
- En Supabase Dashboard > Table Editor > missions: NO existe una nueva misión creada automáticamente tras el registro
- La misión solo existe si el usuario presionó "Poner en órbita" explícitamente después de registrarse

---

### B3 — Login desde AuthGatePanel 🔴

**Precondición:** Usuario con cuenta existente; pedido completo  
**Pasos:**
1. Presionar "Poner en órbita"
2. AuthGatePanel en modo "register" → cambiar a "Iniciar sesión"
3. Introducir correo y contraseña correctos
4. Presionar "Iniciar sesión"

**Verificar:**
- Login exitoso
- **La misión NO se crea automáticamente**
- El usuario ve el resumen con botón activo
- El `draftId` NO ha cambiado

---

### B4 — Enlace "¿Olvidaste tu contraseña?" 🔴

**Precondición:** AuthGatePanel en modo "login"  
**Pasos:**
1. Hacer clic en "¿Olvidaste tu contraseña?"

**Verificar:**
- Se cambia al modo "recovery"
- El campo de correo está pre-rellenado con el email que se estaba escribiendo en login
- Aparece botón "Enviar instrucciones"

---

### B5 — Envío de email de recuperación 🔴

**Precondición:** B4 completado  
**Pasos:**
1. Confirmar el correo en el campo
2. Presionar "Enviar instrucciones"

**Verificar:**
- El mensaje de confirmación aparece ("Revisa tu correo")
- El email llega (verificar inbox del correo de prueba)
- El `draftId` en localStorage NO ha cambiado — el pedido sigue intacto

---

### B6 — returnTo preservado en recuperación 🔴

**Precondición:** B5 completado; email recibido  
**Pasos:**
1. Hacer clic en el enlace del email
2. El navegador navega (probablemente a `/pedir` con token o a `/usuarios/reset-password`)
3. Verificar la URL actual

**Verificar:**
- `SupabaseAuthListener` detecta `PASSWORD_RECOVERY`
- El usuario es redirigido a `/usuarios/reset-password?returnTo=%2Fpedir`
- La URL contiene `returnTo=/pedir` codificado

---

### B7 — Retorno a /pedir después de recuperación 🔴

**Precondición:** B6 completado  
**Pasos:**
1. En `/usuarios/reset-password`: introducir nueva contraseña
2. Presionar "Guardar contraseña"

**Verificar:**
- Éxito: "Contraseña actualizada"
- Después de 1.5 s: redirección a `/pedir`
- **El draft original sigue en localStorage** — el pedido no se perdió
- La pantalla de choice "Tienes un pedido pendiente" aparece correctamente

---

### B8 — AuthGatePanel en flujo sin agente 🔴

**Precondición:** Sin agentes disponibles; pedido completo  
**Pasos:**
1. Llegar al estado donde no hay agentes compatibles
2. Ver el `WaitingRequestCard`
3. Presionar "Seguir esperando" sin estar autenticado

**Verificar:**
- El `AuthGatePanel` aparece **inline** debajo del WaitingRequestCard
- Los modos de registro, login y recovery funcionan igual que en el flujo con agente

---

### B9 — Email duplicado en registro

**Pasos:**
1. Intentar registrarse con un correo que ya existe en Supabase Auth

**Verificar:**
- Mensaje de error claro: "Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña."
- NO se crea un customer duplicado
- El draft permanece intacto

---

## Sección C: Creación de Misión e Idempotencia

### C1 — Creación exitosa con agente 🔴

**Precondición:** Pedido completo, agente seleccionado, usuario autenticado  
**Pasos:**
1. Presionar "Poner en órbita"

**Verificar:**
- Misión creada en Supabase con los datos correctos
- `missions.id === draftId` (el idempotency key llegó al backend)
- `missions.payment_status === "pendiente"` (servidor lo forzó)
- El cliente navega a `/orbita/[missionId]`
- El draft fue limpiado: `localStorage.getItem("orbi_order_draft") === null`

---

### C2 — Idempotencia: doble envío 🔴

**Escenario:** El primer intento crea la misión pero la respuesta HTTP no llega al cliente  
**Simular:**
1. Completar flujo hasta "Poner en órbita"
2. Anotar el `draftId` del localStorage
3. Presionar "Poner en órbita"
4. **Antes de que llegue la respuesta**: simular pérdida de red (DevTools > Network > Offline)
5. El cliente muestra error
6. Restaurar red
7. Presionar "Poner en órbita" nuevamente (mismo draft, mismo draftId)

**Verificar en Supabase:**
- Solo existe UNA misión con ese `id`
- El segundo request devuelve la misión existente (HTTP 200, no 201)
- El cliente limpia el draft y navega a la órbita correcta

---

### C3 — Creación exitosa sin agente ("Seguir esperando") 🔴

**Precondición:** Sin agentes disponibles; usuario autenticado  
**Pasos:**
1. Presionar "Seguir esperando"

**Verificar:**
- Misión creada con `status: "por_tomar"` (sin agente asignado)
- El `draftId` fue enviado como `id`
- El draft fue limpiado
- Se muestra el estado de espera en la UI

---

### C4 — Guard de doble presión (isSending)

**Pasos:**
1. Presionar "Poner en órbita" o "Seguir esperando" dos veces rápidamente

**Verificar:**
- Solo se hace UN request a `/api/missions/create`
- No aparecen errores de duplicado

---

## Sección D: Flujo del Agente

### D1 — Agente ve misión en tiempo real 🔴

**Precondición:** Agente logueado en `/agente`  
**Pasos:**
1. Crear una misión desde `/pedir` (cliente)

**Verificar:**
- La misión aparece en el panel del agente en tiempo real (sin recargar)
- Los datos son correctos: servicio, origen, destino, cliente

---

### D2 — Agente acepta misión 🔴

**Pasos:**
1. El agente presiona "Aceptar misión"

**Verificar:**
- `missions.status` cambia a `"aceptada"`
- El cliente en `/orbita/[missionId]` ve el cambio de estado en tiempo real
- La UI del cliente muestra el nombre del agente y su posición

---

### D3 — GPS del agente en tiempo real 🔴

**Precondición:** Agente con GPS activo, misión en estado "aceptada" o "en_mision"  
**Verificar:**
- La posición del agente se actualiza en el mapa del cliente
- La polyline de ruta se recorta progresivamente desde la posición del agente
- La cámara del mapa sigue al agente suavemente

---

### D4 — GPS watcher sobrevive navegación

**Pasos:**
1. El agente activa su GPS
2. El agente navega a otra página
3. El agente vuelve a `/agente`

**Verificar:**
- El GPS watcher sigue activo (no se detuvo en la navegación)
- La posición continúa actualizándose sin reactivar manualmente

---

## Sección E: Precios

### E1 — Precio calculado por el servidor

**Pasos:**
1. Crear una misión directa
2. Verificar el precio mostrado en el resumen del cliente vs. el precio en Supabase

**Verificar:**
- Los campos financieros en `missions` (`service_fee`, `total_amount`) son calculados por el servidor
- El precio que el cliente "estimó" localmente puede diferir del precio final del servidor

---

### E2 — Fallback de motor_params

**Simular:** Vaciar o eliminar temporalmente la tabla `motor_params`  
**Pasos:**
1. Crear una misión directa

**Verificar:**
- La misión se crea correctamente usando los parámetros de fallback de `DIRECT` en `config.ts`
- En `event_log` aparece un `warn` indicando que se usó el fallback

---

### E3 — Misión de catálogo fuera de rango

**Pasos:**
1. Crear una misión de catálogo con destino a más de 30 km del negocio

**Verificar:**
- El servidor devuelve HTTP 422
- Mensaje de error: "Distancia fuera de cobertura o no calculable."
- El cliente muestra el error apropiadamente

---

## Sección F: Regresiones Críticas

Estos tests deben ejecutarse en CADA release, sin excepción.

### F1 — AuthGate no llama createMission 🔴

**Pasos:**
1. Completar flujo hasta "Poner en órbita" sin estar autenticado
2. AuthGate aparece → registrar nueva cuenta

**Verificar con Network Tab de DevTools:**
- Durante el proceso de registro, NO aparece ningún request a `/api/missions/create`
- La misión solo se crea cuando el usuario presiona "Poner en órbita" después del registro

---

### F2 — draftId no cambia durante el flujo 🔴

**Pasos:**
1. Iniciar pedido → anotar `draftId` del localStorage
2. Completar formulario paso a paso
3. Autenticarse con AuthGate
4. Llegar a la pantalla de confirmación

**Verificar:**
- El `draftId` en localStorage es EXACTAMENTE el mismo en todos los pasos
- El `draftId` que viaja en el body de la request a `/api/missions/create` es ese mismo UUID

---

### F3 — Cuatro sesiones no interfieren 🔴

**Pasos:**
1. En el mismo browser: loguearse como cliente en `/pedir`
2. En otra pestaña: loguearse como agente en `/agente`

**Verificar:**
- Las sesiones son independientes (DevTools > Application > localStorage)
- `sb-orbi-user` y `sb-orbi-agent` tienen tokens distintos
- El logout del agente no cierra la sesión del cliente

---

### F4 — TypeScript limpio 🔴

```bash
npx tsc --noEmit
```

**Verificar:** Cero errores de TypeScript. Ningún `as any` sin justificación explícita.

---

### F5 — Flujo completo sin cuenta 🔴

**Pasos:**
1. Abrir el browser en modo incógnito (sin datos previos)
2. Ir a `/pedir`
3. Seleccionar servicio → llenar detalles → definir destino → datos del solicitante
4. Llegar a la selección de agente

**Verificar:**
- El flujo funciona completamente sin estar autenticado hasta el punto de seleccionar agente
- No hay errores en la consola

---

### F6 — Recuperación de contraseña desde flujo de pedido 🔴

Ejecutar los tests B4 → B5 → B6 → B7 en este orden. Si cualquiera falla, el release está bloqueado.

---

## Sección G: Migración de Draft (cuando se implemente v2)

### G1 — Draft v1 se migra automáticamente 🔴

**Precondición:** Insertar manualmente un draft v1 en localStorage:
```javascript
localStorage.setItem("orbi_order_draft", JSON.stringify({
  draftId: "test-uuid-v1",
  idempotencyKey: "test-uuid-v1",
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 72*60*60*1000).toISOString(),
  selectedService: { label: "Mandado", compatibleType: "directa" },
  selectedStep: "pedido",
  details: {
    origin: "Calle Principal", originLat: 18.83, originLng: -99.58,
    destination: "Parque Central", destinationLat: null, destinationLng: null,
    detail: "Test v1", scheduleMode: "asap", scheduledAt: "",
    requesterName: "Juan", requesterPhone: "5512345678"
  },
  cartItems: [], selectedAgent: null,
  paymentStatus: "Pago al finalizar la misión",
  paymentMethod: "Efectivo",
  confirmedDraftSections: { pedido: false, destino: false, solicitante: false }
}));
```

**Pasos:**
1. Recargar `/pedir`

**Verificar:**
- Aparece la pantalla de choice "Tienes un pedido pendiente"
- Presionar "Continuar pedido"
- El `draftId` es el mismo "test-uuid-v1"
- En localStorage: `schemaVersion === 2`
- `originConfirmed === true` (originLat y originLng no son null)
- `destinationConfirmed === false` (destinationLat y destinationLng son null)

---

### G2 — Draft v1 sin idempotencyKey se migra 🔴

**Precondición:** Insertar draft v1 sin `idempotencyKey`:
```javascript
// Mismo que G1 pero sin la propiedad idempotencyKey
```

**Verificar:**
- El draft NO se descarta
- Tras la migración: `idempotencyKey === draftId` (el draftId fue copiado)

---

### G3 — Draft v1 con lat:0, lng:0

**Precondición:** Draft con `originLat: 0, originLng: 0` (coordenada válida — Atlántico)  
**Verificar:**
- `originConfirmed === true` (0 es una coordenada válida según `Number.isFinite(0)`)
- No se trata como "sin coordenadas"

---

### G4 — Draft expirado no aparece

**Precondición:** Draft v1 expirado (expiresAt en el pasado)  
**Verificar:**
- El draft es descartado al cargar
- NO aparece la pantalla de choice
- Se muestra el formulario limpio

---

## Sección H: Geocodificación (cuando se implemente v3)

### H1 — Autocomplete de destino

**Pasos:**
1. En el campo de destino, escribir "Farmacias"

**Verificar:**
- Aparecen sugerencias después de 400 ms
- Las sugerencias muestran nombre, dirección, localidad y municipio
- Las sugerencias más cercanas al `searchCenter` aparecen primero
- El primer resultado NO se selecciona automáticamente

---

### H2 — Selección de sugerencia

**Pasos:**
1. H1 completado → hacer clic en una sugerencia

**Verificar:**
- El campo de destino se llena con el nombre del lugar
- `destinationLat` y `destinationLng` tienen valores válidos
- `destinationConfirmed === true`
- Aparecen botones "Confirmar ubicación" y "Ajustar en mapa"

---

### H3 — Modificar texto post-selección bloquea avance 🔴

**Pasos:**
1. H2 completado (lugar seleccionado y confirmado)
2. Modificar manualmente el texto del campo de destino

**Verificar:**
- `destinationConfirmed` cambia a `false`
- Las coordenadas anteriores se conservan (no se borran)
- El botón "Continuar" está deshabilitado
- Aparece mensaje: "La ubicación no está confirmada. Selecciona un resultado, usa el mapa o tu ubicación para continuar."

---

### H4 — Proveedor no disponible — fallback graceful

**Simular:** Deshabilitar la conexión a Photon (ej. en el servidor agregar timeout forzado)  
**Pasos:**
1. Escribir en el campo de destino

**Verificar:**
- Mensaje: "Búsqueda no disponible ahora. Usa el mapa, tu ubicación o escribe la dirección."
- Los botones de mapa y GPS siguen funcionando
- NO hay error 500 en la consola del navegador

---

### H5 — Buscar en zona más amplia

**Pasos:**
1. Buscar un lugar muy específico que no tiene resultados cercanos
2. Presionar "Buscar en zona más amplia"

**Verificar:**
- Se ejecuta una búsqueda sin sesgo geográfico
- Los resultados muestran la distancia real desde el `searchCenter`
- No hay referencia a "México" ni a ningún país específico

---

### H6 — Draft con lugar seleccionado sobrevive recarga 🔴

**Pasos:**
1. Seleccionar destino vía autocomplete
2. Recargar la página
3. Presionar "Continuar pedido"

**Verificar:**
- El `destinationPlaceName` y las coordenadas se restauran correctamente
- `destinationConfirmed === true`
- El wizard puede avanzar sin reseleccionar la ubicación

---

## Sección I: Contratos HTTP de Geocodificación (cuando se implemente v3)

### I1 — Query muy corta → 400

```bash
curl "localhost:3000/api/geocoding/search?q=ab"
```
**Esperado:** HTTP 400, `{ "error": "q_too_short" }`

### I2 — Proveedor caído → 200 con status unavailable

**Simular Photon caído**
```bash
curl "localhost:3000/api/geocoding/search?q=farmacia"
```
**Esperado:** HTTP 200, `{ results: [], status: "unavailable", fallbackAvailable: true }`

### I3 — Coordenadas inválidas en search → 400

```bash
curl "localhost:3000/api/geocoding/search?q=farmacia&lat=abc"
```
**Esperado:** HTTP 400, `{ "error": "invalid_params" }`

### I4 — lat:0, lng:0 en reverse → 200 (coordenada válida)

```bash
curl "localhost:3000/api/geocoding/reverse?lat=0&lng=0"
```
**Esperado:** HTTP 200 (no 400 — lat:0, lng:0 son coordenadas válidas)

### I5 — Coordenadas fuera de rango en reverse → 400

```bash
curl "localhost:3000/api/geocoding/reverse?lat=200&lng=0"
```
**Esperado:** HTTP 400, `{ "error": "invalid_coords" }`

---

## Sección J: Persistencia de Datos Enriquecidos (cuando se implemente v3)

### J1 — Datos de lugar persisten en Supabase al crear misión 🔴

**Pasos:**
1. Seleccionar destino vía autocomplete (ej. "Farmacia Similares")
2. Crear la misión

**Verificar en Supabase > Table Editor > missions:**
- `destination_place_name = "Farmacia Similares"` (o el nombre del lugar)
- `destination_provider_id = "photon:N:xxxxxx"` (formato compuesto)
- `destination_provider = "photon"`
- `destination_confirmed = true`

### J2 — Misión creada sin LocationPicker no falla 🔴

**Pasos:**
1. Desactivar feature flag (`NEXT_PUBLIC_LOCATION_PICKER_ENABLED=false`)
2. Crear misión normalmente

**Verificar:**
- Las columnas geo nuevas son NULL
- El INSERT no falla
- Los demás datos de la misión son correctos

---

## Notas de QA

### Entorno de prueba recomendado

- Chrome en modo incógnito para evitar datos de sesión previos
- DevTools > Network: monitorear requests a `/api/missions/create` durante el flujo de auth
- DevTools > Application > localStorage: verificar draft en cada paso
- Supabase Dashboard > Table Editor: verificar datos después de crear misión

### Reportar un fallo

Si un test falla:
1. Anotar el test ID (ej. "F1")
2. Describir los pasos exactos que causaron el fallo
3. Anotar el comportamiento observado vs. el esperado
4. Incluir screenshot si es relevante
5. Verificar si el fallo es nuevo o era conocido

### Tests que requieren múltiples personas

- **D1, D2, D3** (flujo del agente): requiere dos browsers/dispositivos simultáneos
- **F3** (sesiones no interfieren): requiere pestaña de cliente + pestaña de agente en el mismo browser
