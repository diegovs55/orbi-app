# ORBI MVP — Arquitectura Base v0.1

> Constitución técnica del MVP. Aprobada al cierre del Punto 1 de Estabilización.  
> Fecha: 2026-07-15. Toda decisión arquitectónica futura debe validarse contra este documento.

---

## 1. Principios arquitectónicos

1. **Supabase es la única fuente de verdad para misiones.** React solo representa lo que Supabase reporta. localStorage no es fuente de verdad para ningún estado de misión.
2. **localStorage es solo para borradores.** Un draft existe únicamente mientras el usuario está construyendo un pedido. Al enviarse la misión o descartarse el draft, localStorage se limpia y no puede recrearse.
3. **El estado React es un espejo, no una fuente.** `activeMission` en React refleja Supabase; nunca se adelanta ni contradice lo que Supabase tiene.
4. **Ningún componente renderiza antes de que la reconciliación termine.** `isReconcilingMission = true` bloquea todo render relacionado con misiones hasta que `fetchActiveMission()` responde.
5. **El copy de estado nunca es hardcoded en handlers.** Toda cadena de texto que describa el estado de una misión proviene de `missionWaitingMessage(mission)`, derivada de `mission.status`.
6. **Los cambios son pequeños y reversibles.** Ninguna mejora arquitectónica se implementa sin evidencia operativa. La deuda técnica se registra, no se resuelve de forma preventiva.

---

## 2. Fuente única de verdad por módulo

| Módulo | Fuente de verdad | Prohibido usar como fuente |
|--------|-----------------|---------------------------|
| Estado de misión activa | Supabase (`missions` table) | localStorage, React state inicializado desde localStorage |
| Actualizaciones en tiempo real | Supabase Realtime (canal `postgres_changes`) | `storage` events, `MISSION_CHANGE_EVENT`, polling |
| Borrador de pedido | `localStorage["orbi_order_draft"]` | React state sin respaldo en localStorage |
| Identidad del usuario | `supabase.auth.getUser()` | localStorage, cookies propias, estado global |
| Copy de estado de misión | `missionWaitingMessage(mission.status)` | Strings literales en handlers o JSX |
| Cancelabilidad de misión | `CANCELLABLE_STATUSES` en `cancel-customer/route.ts` | Lógica de UI sin validación backend |

---

## 3. Ciclo de vida de una misión

```
[DRAFT en localStorage]
        │
        │ Usuario presiona "Poner en órbita"
        ▼
[esperando_negocio]   ← punto de entrada para misiones de catálogo
        │                 (misiones directas entran en por_tomar)
        │ Negocio confirma
        ▼
[preparando]
        │ Pedido listo
        ▼
[por_tomar]
        │ Agente acepta
        ▼
[aceptada]
        │ Agente sale
        ▼
[en_mision]
        │ Entregado
        ▼
[cumplida] ──► [archivada]

En cualquier momento antes de [preparando]:
        │
        │ Cliente cancela
        ▼
[cancelada] ──► [archivada]
```

**Puntos de no retorno por tipo de misión (actualizado 2026-07-15):**

- **Catálogo (`business_id` presente):** `negocio confirma → preparando`. Cancelable en `esperando_negocio`.
- **Directa (sin negocio):** `agente acepta → aceptada`. Cancelable en `por_tomar`.

**`CANCELLABLE_STATUSES = ["esperando_negocio", "por_tomar"]`** — "por_tomar" aplica exclusivamente a misiones directas. Ver `isCancellableByCustomer()` en `lib/missions.ts` para la lógica completa.

**Invariante:** una misión solo avanza, nunca retrocede. Ningún código del cliente puede regresar un estado.

---

## 4. Ciclo de vida de un draft

```
[null]
  │ Usuario elige servicio
  ▼
[draft en localStorage]  ← autosave cada 800ms
  │
  ├─── Usuario cierra navegador ──► draft sobrevive 72h → expira automáticamente
  │
  ├─── Usuario envía misión ──► clearDraft() + draftSuppressedRef=true
  │                              → draft NO puede recrearse en esta instancia
  │
  └─── Usuario elige "Empezar uno nuevo" ──► clearDraft()
                                              selectedService=null al momento de la llamada
                                              → guardia existente impide recreación
```

**`draftSuppressedRef`**: ref booleano de instancia del componente. Se activa a `true` al enviar una misión. Bloquea el Eager draftId effect y el autosave. Se reinicia a `false` solo al remontar el componente (nueva visita a /pedir).

**No existe marca de "draft consumido" en Supabase.** La supresión es puramente en memoria de la instancia React. Es suficiente porque el componente remonta en cada navegación.

---

## 5. Reglas del estado React

| Estado | Inicialización | Fuente de actualización | Prohibido |
|--------|---------------|------------------------|-----------|
| `activeMission` | `null` | `fetchActiveMission()` en mount + Supabase Realtime | Inicializar desde localStorage |
| `isReconcilingMission` | `true` | Cambia a `false` cuando `fetchActiveMission()` responde | Renderizar contenido de misión mientras sea `true` |
| `draftId` | `null` | Eager effect al elegir servicio; `null` al enviar misión | Usarlo como fuente de verdad de si existe misión |
| `isSending` | `false` | `true` al iniciar envío; `false` tras 1200ms en success path | Quedarse en `true` indefinidamente (produce UI bloqueada) |
| `waitingRequestMessage` | `""` | Solo para mensajes transitorios (ej. cancelación) | Hardcodear copy de estado de misión aquí |

**Regla de render:** todo bloque que muestre misiones activas debe estar condicionado a `!isReconcilingMission && !networkReconcileError`.

---

## 6. Reglas de Supabase

- **`fetchActiveMission(userId)`** es la única función autorizada para leer misiones en el cliente.  
  Query: `WHERE user_id = $uid AND status NOT IN (cumplida, cancelada, archivada) ORDER BY created_at DESC LIMIT 1`
- **El canal Realtime** solo escucha `UPDATE` en `missions`. Nunca `INSERT` (la misión ya se cargó en mount). Nunca `DELETE` (las misiones no se borran).
- **El canal ignora eventos durante `isReconcilingMissionRef.current = true`** para evitar race conditions con el mount.
- **`cancel-customer/route.ts`** es el único punto donde se valida si una misión es cancelable. El cliente no toma esa decisión.
- **No existe `user_id` anónimo.** Todo usuario que crea una misión está autenticado. No hay flujos de misión para guests.

---

## 7. Reglas de localStorage

| Key | Propósito | Quién escribe | Quién lee | Quién borra |
|-----|-----------|--------------|-----------|-------------|
| `orbi_order_draft` | Borrador de pedido en construcción | `saveDraft()` vía autosave y eager effect | `loadDraft()` en mount | `clearDraft()` al enviar o descartar |
| `orbi_active_mission_id` | ID de misión para /orbita | `handleSendMissionToAgent` éxito | `/orbita/[id]` page | No se borra actualmente |
| `orbi_active_missions` | **OBSOLETO** — array de misiones | Funciones legacy en `lib/missions.ts` | Nadie en producción | Pendiente cleanup PR |
| `orbi_active_mission` | **OBSOLETO** — misión activa | Funciones legacy en `lib/missions.ts` | Nadie en producción | Pendiente cleanup PR |

**Regla absoluta:** ningún código nuevo debe leer `orbi_active_missions` ni `orbi_active_mission`. Están pendientes de eliminación.

---

## 8. Convenciones que ningún desarrollador debe romper

1. **No leer misiones desde localStorage.** `fetchActiveMission()` o Realtime. Nunca `getActiveMission()`, `loadActiveMissionsFromSupabase()` ni derivados.

2. **No despachar `MISSION_CHANGE_EVENT`.** Esta constante está obsoleta. Si se necesita comunicación entre efectos, usar Supabase Realtime o estado React.

3. **No agregar `storage` event listeners para misiones.** El canal Supabase es el único mecanismo de actualización en tiempo real.

4. **No hardcodear strings de estado de misión.** Toda copia derivada del estado usa `missionWaitingMessage(mission)`. Si se necesita un nuevo estado, se añade un caso a esa función.

5. **No modificar `CANCELLABLE_STATUSES` sin una decisión de producto documentada.** Esta constante define el punto de no retorno del cliente. Es una invariante del negocio, no una constante técnica.

6. **No renderizar contenido de misión fuera de los guards `!isReconcilingMission`.** Hacerlo produce flashes de estado incorrecto en el mount.

7. **No llamar `clearDraft()` sin también activar `draftSuppressedRef.current = true` si `selectedService` sigue vivo.** Limpiar localStorage sin suprimir el autosave recrea el draft en 800ms.

8. **No resetear `draftSuppressedRef` a `false` mientras `selectedService` sea no-null.** Solo es seguro resetearlo cuando el formulario está completamente vacío o al remontar el componente.

9. **No agregar funciones de reconciliación nuevas en `lib/missions.ts`.** Las existentes son legacy y están pendientes de eliminación. El path correcto es `fetchActiveMission()`.

10. **No pasar al siguiente punto de la lista de estabilización sin validación manual del punto actual.**

---

## 9. Decisiones de producto tomadas durante el Punto 1

| Decisión | Descripción | Fecha |
|----------|-------------|-------|
| Autenticación obligatoria | No existen usuarios guest. Todo usuario que crea una misión está autenticado con Supabase Auth. | Pre-Punto 1 |
| ORBI asigna agente por defecto | El paso "agente" es opcional en el wizard. ORBI asigna automáticamente. El usuario puede elegir manualmente desde la pantalla de confirmación. | ORBI-P-13 |
| Punto de no retorno = negocio confirma | Una vez que el negocio confirma, el cliente no puede cancelar desde ORBI. | 2026-07-14 |
| `CANCELLABLE_STATUSES = ["esperando_negocio"]` | Solo se puede cancelar mientras el negocio no ha confirmado. | 2026-07-14 |
| Draft: fuente de verdad de pedidos en construcción | localStorage es la fuente del draft. Supabase es la fuente de misiones activas. No se mezclan. | 2026-07-15 |
| Copy de estado nunca hardcodeado | `missionWaitingMessage()` es el único origen. Mencionar al agente solo a partir de `aceptada`. | 2026-07-15 |
| Cleanup de localStorage legacy como PR separado | Las keys y funciones obsoletas de `orbi_active_missions` se eliminan en un PR independiente, no durante la estabilización. | 2026-07-15 |

---

## 10. Checklist obligatorio antes de cualquier PR futuro en /pedir

### Draft
- [ ] Un draft abandonado (navegador cerrado) sigue recuperándose al volver a /pedir
- [ ] Un draft convertido en misión NO reaparece al volver a /pedir
- [ ] "Empezar uno nuevo" elimina el draft definitivamente
- [ ] Después de "Empezar uno nuevo", el siguiente pedido crea un draft nuevo al elegir servicio

### Reconciliación
- [ ] Usuario sin misión activa → formulario vacío, sin parpadeo
- [ ] Usuario con misión activa → WaitingRequestCard directamente, sin formulario
- [ ] Misión cumplida/archivada → formulario vacío (no misión fantasma)
- [ ] Sin conexión al montar → pantalla neutral de error con botón Reintentar
- [ ] Reintentar → recupera estado real desde Supabase

### Envío de misión
- [ ] "Poner en órbita" → botón desaparece, animación visible
- [ ] Animación dura mínimo 1200ms antes de mostrar WaitingRequestCard
- [ ] WaitingRequestCard entra con fade suave
- [ ] WaitingRequestCard no muestra textos hardcodeados

### Copy por estado
- [ ] `esperando_negocio` → "Tu misión ya está en órbita. Ahora [Negocio] revisará tu pedido."
- [ ] `preparando` → "[Negocio] confirmó tu pedido. Lo están preparando."
- [ ] `por_tomar` → "Buscando un agente disponible."
- [ ] `aceptada` → "[Agente] aceptó tu misión. Ya va en camino."
- [ ] `en_mision` → "[Agente] está en camino con tu pedido."
- [ ] Ningún estado antes de `aceptada` menciona al agente por nombre

### Cancelación
- [ ] `esperando_negocio` → botón Cancelar visible y funcional
- [ ] `preparando` o posterior → "Ya no puedes cancelar desde ORBI."
- [ ] Cancelación confirmada por backend antes de actualizar UI

### Regresión general
- [ ] TypeScript sin errores (`npx tsc --noEmit`)
- [ ] Consola sin errores en mount, en envío, en actualización de estado
- [ ] No aparecen warnings de React sobre updates en componentes desmontados

---

*Documento generado al cierre del Punto 1 de Estabilización ORBI MVP.*  
*Próxima revisión: al cierre del Punto 2.*
