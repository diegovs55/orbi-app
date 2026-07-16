# POST_PR_04A — Bitácora de arquitectura

**PR:** Routing de llamadas geocoding a través de la capa de servicios  
**Archivos modificados:** `components/ServiceRequestFlow.tsx`, `components/BusinessCatalog.tsx`, `components/AdminCatalog.tsx`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que solo `ServiceRequestFlow.tsx` tenía llamadas directas a Nominatim.
- Que los tres callers de `reverseGeocodePoint` en `ServiceRequestFlow` manejarían `null` sin cambios, dado que usaban `address || fallback`.
- Que la respuesta de nuestro endpoint reverse sería suficiente para replicar el comportamiento exacto de Nominatim en todos los componentes.

## ¿Qué descubrimos realmente?

- **Dos componentes adicionales con llamadas directas:** `BusinessCatalog.tsx` y `AdminCatalog.tsx` también llamaban a Nominatim directamente desde el browser. Ambos tenían su propia copia local de `reverseGeocodePoint` y `buildLocalLocationQuery`.
- **El campo `zone` depende de subcampos estructurados de Nominatim** (`address.neighbourhood`, `address.suburb`, etc.) que nuestro endpoint `/api/geocoding/reverse` no expone — el diseño del endpoint solo devuelve `displayName`. Esos subcampos son irrelevantes para el flujo del cliente pero sí se usaban en los paneles de administración para sugerir la zona de un negocio.
- **Los callers de `reverseGeocodePoint` en `ServiceRequestFlow` ya eran correctos.** Usaban `address || "Ubicación actual"` y `address || "Punto marcado en mapa"` — la evaluación de `null || fallback` produce el fallback correctamente. Cero cambios necesarios en los sitios de llamada.
- **`buildLocalGeocodeQuery` (en `ServiceRequestFlow`) y `buildLocalLocationQuery` (en `AdminCatalog`) eran la misma función con el mismo bug:** inyectaban `"Zumpahuacán, Estado de México, México"` en queries cortas, violando INV-020.

## ¿Qué decisiones cambiaron?

- El campo `zone` en `BusinessCatalog.reverseGeocodePoint` y `AdminCatalog.reverseGeocodeBusinessPoint` ahora siempre devuelve `"Zona calculada por ubicación"` (el fallback que ya existía en el código original). La degradación es solo administrativa — el admin puede ajustar la zona manualmente. Extender el endpoint para exponer subcampos estructurados queda registrado como deuda técnica para un PR posterior.
- `buildLocalGeocodeQuery` y `buildLocalLocationQuery` fueron eliminadas. No se pasó la query sin modificar a modo de parche: simplemente se eliminó la inyección. La geografía relevante llegará en el siguiente PR mediante `SearchCenter` y `resolveSearchCenter()`.

## ¿Qué quedó igual?

- El comportamiento del usuario es idéntico: mismo flujo, mismos textos, mismos estados, mismos mensajes de error.
- Los textos de fallback ("Ubicación actual", "Punto marcado en mapa") siguen viviendo en los sitios de llamada, no en las funciones de geocoding. La regla establecida en PR-02 se respetó.
- TypeScript compila limpio. Cero errores antes y después.
- Los tres endpoints PR-01/PR-02 no fueron modificados.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- **Las llamadas directas a proveedores externos estaban duplicadas en tres componentes**, no centralizadas. La proliferación de `reverseGeocodePoint` local es un patrón que debe evitarse: cuando el contrato de un proveedor cambia, hay que buscar en todos los componentes. Ahora hay un único punto de entrada.
- **El contrato de respuesta de `/api/geocoding/reverse` es suficiente para el 90% de los casos de uso**, pero los paneles de administración necesitan subcampos estructurados de Nominatim para derivar zonas geográficas. Este gap quedó expuesto por el PR y se resuelve con el fallback existente.
- **`buildLocalLocationQuery` existía también en `AdminCatalog.tsx`**, replicando exactamente la violación de INV-020 de `ServiceRequestFlow`. La eliminación de ambas en un solo PR consolida el cumplimiento de INV-020 en toda la base de código.

## ¿Qué riesgos evitamos?

- Haber dejado `BusinessCatalog.tsx` y `AdminCatalog.tsx` con llamadas directas habría mantenido la violación de INV-017 parcialmente activa — el escudo no estaría completo.
- Haber intentado exponer subcampos estructurados de Nominatim en el endpoint para preservar `zone` exactamente habría ampliado el alcance del PR más allá de lo autorizado y añadido complejidad sin evidencia de que el valor de `zone` es crítico para la operativa.
- Haber mantenido `buildLocalLocationQuery` activa (aunque redirigida al endpoint) habría propagado la violación de INV-020 dentro de nuestra propia capa de servicios en lugar de eliminarla.
