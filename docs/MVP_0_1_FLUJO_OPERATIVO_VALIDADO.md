# MVP 0.1 — Flujo Operativo ORBI Validado

Fecha de validación: 2026-08-03
Rama: mobile-04-push
Commit de cierre: MOBILE-05 (pendiente)

---

## 1. Resumen ejecutivo

El flujo operativo completo de ORBI fue validado exitosamente en dispositivos físicos reales.
La app nativa instalada en iPhone mediante Xcode, el panel de negocio en Safari/Mac,
el panel de agente y el panel administrativo operaron correctamente en paralelo.

Bug crítico corregido: la navegación "Ver en mapa" regresaba al usuario a Inicio (splash)
en lugar de abrir el seguimiento de la misión. Causa raíz: `window.location.href` en
Capacitor/WKWebView provoca una recarga completa del WebView; el URL handler de Capacitor
busca el archivo `orbita/<uuid>.html`, no lo encuentra, y cae al SPA fallback `index.html`.
Solución: `router.push(isCap ? mobileUrl : webUrl)` — navegación dentro del SPA sin recargar.

---

## 2. Alcance del hito

- Flujo de pedido completo: cliente crea pedido → negocio confirma → agente toma → seguimiento GPS en tiempo real → entrega
- Plataformas: app nativa iOS (Capacitor + WKWebView), Safari desktop (web), panel negocio, panel agente, panel admin
- No incluye: push notifications, flujo de pago, gestión de rutas complejas, selección de agente por usuario

---

## 3. Pasos validados (13 pasos)

| # | Paso | Actor | Panel | Resultado |
|---|------|-------|-------|-----------|
| 1 | Abrir app nativa en iPhone | Cliente | App iOS | Splash → Inicio |
| 2 | Crear pedido (wizard completo) | Cliente | App iOS | Pedido creado, estado `esperando_negocio` |
| 3 | Ver pedido en "Mis pedidos" | Cliente | App iOS | Card visible con estado correcto |
| 4 | Negocio recibe notificación de pedido | Negocio | Safari/Mac | Lista de pedidos pendientes actualizada via Realtime |
| 5 | Negocio confirma pedido | Negocio | Safari/Mac | Estado → `preparando`, botón responde |
| 6 | Negocio marca pedido listo | Negocio | Safari/Mac | Estado → `por_tomar` |
| 7 | Agente ve pedido disponible | Agente | Safari/Mac | Lista de misiones disponibles |
| 8 | Agente toma el pedido | Agente | Safari/Mac | Estado → `en_camino`, misión asignada |
| 9 | Cliente toca "Ver en mapa" | Cliente | App iOS | Abre OrbitaClient con UUID correcto (fix aplicado) |
| 10 | Seguimiento GPS en tiempo real | Cliente + Admin | App iOS + Admin | Mapa actualiza posición del agente |
| 11 | Agente marca entrega completada | Agente | Safari/Mac | Estado → `entregado` |
| 12 | Cliente ve estado actualizado | Cliente | App iOS | Card muestra `entregado` |
| 13 | Admin ve historial completo | Admin | Safari/Mac | Misión registrada con todos los estados |

---

## 4. Cambios aplicados en este hito

### 4.1 `components/MyAccount.tsx`
- **Antes**: `window.location.href = mobileUrl` (full WKWebView reload → splash → Inicio)
- **Después**: `router.push(isCap ? mobileUrl : webUrl)` (SPA navigation, sin reload)
- Detecta Capacitor via `window.Capacitor?.isNativePlatform?.() === true`
- En web usa el URL real de la misión (`/orbita/<uuid>`)
- En Capacitor usa la ruta estática con query param (`/orbita/__mobile__?missionId=<uuid>`)

### 4.2 `app/orbita/[missionId]/client.tsx`
- **Antes**: pasaba `missionId` directamente a `MissionOrbitTracker`
- **Después**: cuando `missionId === "__mobile__"` (placeholder estático de Capacitor),
  lee el UUID real desde `searchParams.get("missionId")`
- Requiere `Suspense` en `page.tsx` (ya existente) para `useSearchParams`

---

## 5. Arquitectura de navegación móvil (invariante)

```
MyAccount "Ver en mapa"
  └─ Capacitor detectado
       ├─ router.push("/orbita/__mobile__?missionId=<uuid>")
       │   └─ Capacitor sirve: ios/App/App/public/orbita/__mobile__.html
       │       └─ OrbitaClient: useSearchParams → resolvedId = <uuid>
       │           └─ MissionOrbitTracker(initialMissionId=<uuid>)
       └─ Web: router.push("/orbita/<uuid>")
           └─ RSC page con missionId=<uuid>
               └─ OrbitaClient: missionId !== "__mobile__" → usa directamente
```

`generateStaticParams` retorna solo `[{ missionId: "__mobile__" }]` — un único HTML
exportado que sirve como contenedor universal para cualquier misión en la app nativa.

---

## 6. Consistencia de configuración iOS (MOBILE-05, ya en repo)

| Item | Valor | Verificado |
|------|-------|-----------|
| Bundle ID (Debug) | `com.redorbi.app` | ✓ |
| Bundle ID (Release) | `com.redorbi.app` | ✓ |
| Development Team | `2A47WYRFJZ` | ✓ |
| Code Sign Entitlements | `App/App.entitlements` | ✓ |
| aps-environment | `development` | ✓ |
| Location | `NSLocationWhenInUseUsageDescription` only | ✓ |
| Background modes | `remote-notification` | ✓ |
| Scheme compartido | `App.xcscheme` en `xcshareddata` | ✓ |

---

## 7. Aislamiento de sesiones (invariante)

| Sesión | storageKey | Alcance |
|--------|-----------|---------|
| Cliente | `sb-orbi-user` | supabase client (anon) |
| Negocio | `sb-orbi-business` | supabaseBusiness client (anon) |
| Admin | service_role via API routes | solo server-side |
| Agente | `sb-orbi-user` | mismas RLS que cliente, rol diferente |

Todas las mutaciones de estado de misión van via API routes con service_role.
Ningún cliente tiene acceso directo a UPDATE en tabla `missions`.

---

## 8. Endpoints de API presentes en esta rama (no en main)

| Endpoint | Estado anterior | Estado posterior | Usado por |
|----------|----------------|-----------------|-----------|
| `POST /api/business/missions/confirm` | No existía | `esperando_negocio` → `preparando` | Panel negocio |
| `POST /api/business/missions/ready` | No existía | `preparando` → `por_tomar` | Panel negocio |

Estos endpoints se integran en producción cuando esta rama se mergea a main.

---

## 9. Exclusiones de este commit

Los siguientes archivos NO se incluyen en el commit porque pertenecen a entregas futuras:

- `package.json` / `package-lock.json` — dependencias push (`@upstash/qstash`, `firebase-admin`)
- Todos los archivos untracked: configs duplicados Android/iOS, archivos push, docs de auditoría, backups

---

## 10. Criterios de regresión

Antes de cualquier merge a main, verificar:

- [ ] `Ver en mapa` en app nativa abre el seguimiento sin splash intermedio
- [ ] La ruta web `/orbita/<uuid>` funciona directamente (sin query params)
- [ ] El panel de negocio puede confirmar y marcar listo un pedido
- [ ] El estado de la misión avanza unidireccionalmente (nunca retrocede)
- [ ] El mapa muestra la posición del agente en tiempo real (Realtime activo)
- [ ] La sesión de negocio (`sb-orbi-business`) no interfiere con la sesión de cliente
- [ ] Admin puede ver el historial completo de la misión
- [ ] Build mobile (`bash scripts/build-mobile.sh`) completa sin errores ESLint/TypeScript

---

## Promesa de producto (MVP 0.1)

> Un cliente en iPhone puede crear un pedido, ver en tiempo real cómo el agente
> se dirige hacia el negocio y hacia su dirección, y recibir confirmación de entrega —
> todo desde la app nativa, sin recargas ni pérdida de sesión.
