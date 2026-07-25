# Pruebas de regresión — Flujo de aprobación de agentes y negocios

Ejecutar manualmente en localhost antes de hacer commit cuando se modifique cualquiera de estos archivos:

- `app/api/businesses/approve/route.ts`
- `app/api/agents/activate/route.ts`
- `components/AdminPendingRequests.tsx`
- `lib/pendingRequests.ts`

---

## Escenarios — Negocio

### B-01 · Primer alta limpia

**Precondición:** no existe ningún registro en `businesses` ni en `auth.users` para el email de la solicitud.

**Pasos:**
1. Crear una solicitud de negocio en `/api/requests/add` (o desde la pantalla pública).
2. Aprobar desde el panel admin.

**Resultados esperados:**
- Se crea exactamente una fila en `businesses` con `status = 'activo'`.
- Se crea un usuario en `auth.users` con el mismo email.
- `businesses.auth_user_id` apunta al nuevo usuario Auth.
- `requests.status` queda `approved`.
- El banner "Aprobaciones de esta sesión" muestra nombre, correo y contraseña temporal.
- El botón "Aprobar" desaparece de la fila después de la aprobación (remoción optimista).

---

### B-02 · Doble clic — segunda aprobación inmediata

**Precondición:** solicitud pendiente visible en el panel. El admin hace clic en "Aprobar" dos veces rápidamente.

**Pasos:**
1. Abrir DevTools → Network → simular latencia alta (o desactivar el debounce del botón en dev).
2. Hacer clic en "Aprobar" dos veces antes de que la primera petición regrese.

**Resultados esperados:**
- Solo se ejecuta una petición al endpoint (el Set `approving` bloquea la segunda).
- Se crea exactamente un registro en `businesses`.
- No se crean duplicados en `auth.users`.

---

### B-03 · Reintento después de éxito (admin no vio las credenciales y vuelve a aprobar)

**Precondición:** la solicitud ya fue aprobada en una sesión anterior (`requests.status = 'approved'`), pero el admin la ve como pendiente en otra pestaña o recarga forzada.

**Pasos:**
1. Aprobar la solicitud normalmente.
2. Sin recargar, volver a llamar manualmente al endpoint con el mismo `requestId`.

**Resultados esperados:**
- El endpoint detecta `req_.status === 'approved'` (paso 5b) y devuelve `{ alreadyActivated: true }` sin crear nada.
- No se crea ningún negocio ni usuario adicional.
- No se modifica el negocio ya existente.

---

### B-04 · Huérfano activo — negocio existente sin Auth

**Precondición:** existe una fila en `businesses` con `status = 'activo'` y `auth_user_id = null` para el email de la solicitud (por ejemplo, fila creada manualmente o por una aprobación que falló en el paso 11).

**Pasos:**
1. Insertar manualmente en DB: `businesses` con email del test, `status = 'activo'`, `auth_user_id = null`.
2. Aprobar la solicitud.

**Resultados esperados:**
- El endpoint reutiliza el huérfano `activo` existente (no crea uno nuevo).
- `auth_user_id` queda vinculado en esa fila.
- No existe ningún negocio duplicado al finalizar.

---

### B-05 · Huérfano eliminado + negocio activo coexistentes — prioridad correcta

**Precondición:** existen dos huérfanos (`auth_user_id = null`): uno con `status = 'eliminado'` (más antiguo) y otro con `status = 'activo'` (más reciente).

**Pasos:**
1. Crear en DB ambas filas con el mismo email.
2. Aprobar la solicitud.

**Resultados esperados:**
- El endpoint elige el huérfano `activo`, no el `eliminado`.
- El negocio resultante tiene `status = 'activo'` y `auth_user_id` vinculado.
- El huérfano `eliminado` permanece con `auth_user_id = null`.

> Este escenario es el que causó el incidente de Regina Café (2026-07-25).
> Corregido en `approve/route.ts` paso 9: `STATUS_PRIORITY = { activo: 0, inactivo: 1, eliminado: 2 }`.

---

### B-06 · Negocio ya activado — idempotencia completa

**Precondición:** existe una fila en `businesses` con `auth_user_id` asignado para el email de la solicitud.

**Pasos:**
1. Aprobar la solicitud.

**Resultados esperados:**
- El endpoint entra a la rama "ya activado" (paso 8) y devuelve `{ alreadyActivated: true }`.
- No se crea ningún usuario ni negocio adicional.
- Si `requests.status` era `pending`, queda marcado como `approved`.

---

### B-07 · Múltiples filas activadas — conflicto irrecuperable

**Precondición:** existen dos o más filas en `businesses` con el mismo email y `auth_user_id IS NOT NULL`.

**Pasos:**
1. Insertar manualmente en DB dos filas con el mismo email y `auth_user_id` distinto.
2. Intentar aprobar la solicitud.

**Resultados esperados:**
- El endpoint devuelve `409` con mensaje "múltiples fichas ya vinculadas".
- El panel admin muestra el error en la fila de la solicitud.
- No se crea ningún registro adicional.

---

### B-08 · Credenciales visibles aunque la solicitud desaparezca de pendientes

**Precondición:** solicitud pendiente visible.

**Pasos:**
1. Aprobar la solicitud.
2. Verificar que la solicitud desaparece de la tabla "Negocios pendientes" de forma inmediata.
3. Verificar que el banner "Aprobaciones de esta sesión" muestra: nombre, correo y (si aplica) contraseña temporal.

**Resultados esperados:**
- La solicitud desaparece de pendientes sin esperar los 8 s del poll.
- Las credenciales son visibles en el banner independientemente de si la solicitud sigue en la tabla.
- El banner persiste hasta que el admin recarga la página.

---

### B-09 · Aprobación con usuario Auth ya existente (sin contraseña temporal)

**Precondición:** existe un usuario en `auth.users` con el email de la solicitud pero sin fila activa en `businesses`.

**Pasos:**
1. Aprobar la solicitud.

**Resultados esperados:**
- El endpoint recupera el usuario Auth existente vía `listUsers` (no crea uno nuevo).
- La respuesta no incluye `tempPassword`.
- El banner muestra nombre y correo, pero no chip de contraseña temporal.
- El negocio queda vinculado con el `auth_user_id` del usuario preexistente.

---

### B-10 · Búsqueda por nombre cuando el email histórico difiere (fallback 6b)

**Precondición:** existe una fila en `businesses` con el mismo nombre que la solicitud pero email distinto o nulo (`auth_user_id = null`).

**Pasos:**
1. Insertar manualmente en DB una fila con nombre = "Test Negocio", email vacío o diferente, `auth_user_id = null`.
2. Crear solicitud con nombre "Test Negocio" y un email normal.
3. Aprobar la solicitud.

**Resultados esperados:**
- El endpoint no encuentra nada por email, activa el fallback 6b (búsqueda por nombre).
- Reutiliza la fila encontrada por nombre en lugar de crear una nueva.
- El log del servidor muestra el aviso del fallback.

---

## Escenarios — Agente

Los escenarios A-01 a A-05 son análogos a B-01, B-02, B-03, B-06, B-08 pero para `app/api/agents/activate/route.ts`. El flujo es estructuralmente idéntico; ejecutar al menos los marcados con (mínimo).

| Código | Descripción | Prioridad |
|--------|-------------|-----------|
| A-01 | Primer alta limpia | mínimo |
| A-02 | Doble clic bloqueado por `approving` | mínimo |
| A-03 | Reintento después de éxito (ya activado) | mínimo |
| A-04 | Credenciales visibles en banner aunque desaparezca de pendientes | mínimo |
| A-05 | Agente con usuario Auth ya existente — sin contraseña temporal | mínimo |

---

## Verificaciones transversales (ejecutar siempre)

Después de cualquier prueba de aprobación, consultar directamente en Supabase:

```sql
-- 1. No debe haber dos filas activas para el mismo email
SELECT email, COUNT(*) FROM businesses
WHERE status = 'activo'
GROUP BY email HAVING COUNT(*) > 1;

-- 2. Cada negocio activo debe tener auth_user_id vinculado
SELECT id, name, email FROM businesses
WHERE status = 'activo' AND auth_user_id IS NULL;

-- 3. No debe haber auth_user_id duplicado entre negocios activos
SELECT auth_user_id, COUNT(*) FROM businesses
WHERE status = 'activo' AND auth_user_id IS NOT NULL
GROUP BY auth_user_id HAVING COUNT(*) > 1;

-- 4. La solicitud aprobada debe tener requests.status = 'approved'
SELECT id, status FROM requests WHERE id = '<requestId>';
```

---

## Archivos involucrados en el flujo

```
app/api/businesses/approve/route.ts   ← lógica principal de aprobación de negocios
app/api/agents/activate/route.ts      ← lógica principal de activación de agentes
components/AdminPendingRequests.tsx   ← UI del panel admin (tabla + banner de credenciales)
lib/pendingRequests.ts                ← tipo PendingRequest y mapRequestRow
app/api/requests/list/route.ts        ← poll de solicitudes
app/api/requests/update/route.ts      ← marcar rechazada / desactivar
```

---

*Última actualización: 2026-07-25 — Diego Villagrán / Claude (DEUDA-BUSINESS-01)*
