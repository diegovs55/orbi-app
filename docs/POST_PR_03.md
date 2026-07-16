# POST_PR_03 — Bitácora de arquitectura

**PR:** Persistencia de los campos geográficos en draft y misiones  
**Archivos modificados:** `lib/order-draft.ts`, `lib/missions.ts`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que los 10 campos geográficos nuevos en `DraftRequestDetails` podían ser requeridos (no opcionales), ya que `migrateDraftV1ToV2()` los inicializa explícitamente a `null`.
- Que `ServiceRequestFlow.tsx` tenía un tipo `RequestDetails` completamente alineado con `DraftRequestDetails`.
- Que `lib/order-draft.ts` era un archivo completamente nuevo (no existía en el repositorio).

## ¿Qué descubrimos realmente?

- `lib/order-draft.ts` ya existía en el repositorio como archivo untracked (fuera del control de Git). El PR lo modificó, no lo creó desde cero.
- `ServiceRequestFlow.tsx` define su propio tipo interno `RequestDetails` para el estado del componente, que luego asigna a `DraftRequestDetails`. Ese tipo no tiene los nuevos campos. Al declarar los 10 campos como requeridos en `DraftRequestDetails`, TypeScript rechazó la asignación con TS2322.
- `lib/missions.ts` ya tenía modificaciones previas al PR-03 no committeadas. El `git diff` del archivo mezcla cambios de sesiones anteriores con los del PR-03. Los cambios atribuibles a este PR son exclusivamente los 10 campos geográficos en `ActiveMission` y `missionToRow()`.

## ¿Qué decisiones cambiaron?

- Los 10 campos geográficos en `DraftRequestDetails` se declararon como **opcionales** (`?:`) en lugar de requeridos. Esto es semánticamente correcto: los campos se rellenan progresivamente a medida que el usuario geocodifica cada punto. Un draft recién creado no tiene ninguno. La diferencia entre `null` (campo presente sin valor) y `undefined` (campo aún no inicializado) es real y está documentada en el tipo.
- La migración `migrateDraftV1ToV2()` sigue inicializando todos los campos a `null` explícitamente — eso no cambió. El ajuste fue solo en la declaración del tipo, no en el comportamiento de la migración.

## ¿Qué quedó igual?

- La estrategia de migración dual-read: `loadDraft()` detecta v1, migra, persiste v2, y devuelve el draft migrado — sin descartar datos del usuario.
- La idempotencia de la migración: un draft v1 migrado a v2 se guarda inmediatamente en localStorage, por lo que la siguiente lectura lo encontrará ya en v2 y no volverá a migrar.
- Compatibilidad total con misiones creadas antes del PR-03: `missionToRow()` usa `?? null` para todos los campos nuevos, por lo que misiones v1 persistirán `null` en las 10 columnas de la DB — exactamente como se diseñó en la Etapa 1.
- Los campos en `ActiveMission` son opcionales (`?:`), lo que evita romper ninguna función existente que construya o consuma misiones sin los campos geo.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- La separación entre "campo no inicializado" (`undefined`) y "campo inicializado sin valor" (`null`) tiene consecuencias reales en TypeScript cuando se cruza la frontera entre el estado interno de un componente y los tipos persistidos en el draft. Los tipos del draft deben diseñarse para tolerar que los componentes existentes no conozcan los campos nuevos.
- La opcionalidad (`?:`) de los campos geo en el draft no es una concesión de diseño — es la representación correcta de su naturaleza progresiva. Un campo requerido en un draft significaría que todos los componentes que crean drafts deben conocerlo, lo que acoplaría el sistema antes de que la UI esté lista.
- Cuando un archivo tiene cambios previos no committeados, el `git diff` del PR mezcla esos cambios con los nuevos. Esto dificulta la revisión. La práctica correcta es commitear o stashear los cambios previos antes de iniciar cada PR.

## ¿Qué riesgos evitamos?

- Haber declarado los campos como requeridos habría roto la compilación en `ServiceRequestFlow.tsx` sin posibilidad de corrección dentro del alcance del PR (ese archivo está fuera del scope). La opcionalidad resuelve el problema estructuralmente, no como parche.
- Haber descartado drafts v1 (comportamiento anterior de `loadDraft()`) habría borrado el progreso del usuario en el momento del despliegue. La migración preserva todos los datos existentes y es transparent al usuario.
- Haber omitido los campos de `missionToRow()` habría hecho que misiones creadas con el draft v2 en el futuro perdieran sus datos geográficos silenciosamente al persistir en Supabase — sin error, sin warning, solo datos faltantes en la DB.
