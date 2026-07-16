# POST_PR_05 — Bitácora de arquitectura

**PR:** Primera experiencia inteligente — LocationPicker para destino  
**Archivos modificados:** `components/ServiceRequestFlow.tsx`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que sería necesario crear un archivo de componente separado para `DestinationPickerField`.
- Que el estado de "confirmación pendiente" (GPS/mapa) requeriría coordinar múltiples efectos de React.
- Que `handleConfirmMapPoint` necesitaría una refactorización profunda para soportar los dos caminos.
- Que la animación de "Buscando..." produciría un parpadeo visible al escribir rápido.

## ¿Qué descubrimos realmente?

- **El componente cabe en el mismo archivo.** `DestinationPickerField` es una función interna de `ServiceRequestFlow.tsx`. No necesitó archivo separado: el scope es exactamente el paso Destino, y toda la lógica de GPS/autocomplete/confirmación está contenida en ~180 líneas.
- **`handleConfirmMapPoint` solo necesitó bifurcarse, no reescribirse.** El try/catch existente se conservó; la única diferencia es que cuando `mapTarget === "destination"`, en lugar de llamar `setDetails` llama `setDestPendingConfirm`. El catch hace lo mismo.
- **`AbortController` fue necesario.** Sin él, si el usuario escribe rápido, múltiples fetches en vuelo podían resolver fuera de orden y mostrar sugerencias obsoletas. Se cancela el fetch anterior en cada nueva pulsación.
- **`onMouseDown + preventDefault` en las sugerencias es crítico.** Sin él, el `onBlur` del input cierra el dropdown antes de que el `onClick` de la sugerencia se registre. `onMouseDown` ocurre antes que `onBlur`; al cancelar el evento predeterminado, el input no pierde foco y el click llega correctamente.
- **El wizard avanza automáticamente cuando ORBI-UX-01 se cumple.** Al llamar `setConfirmedDraftSections({ destino: true })` dentro de `handleDestSelectSuggestion`, el estado `destinationIsConfirmed` se vuelve verdadero y la lógica existente del wizard mueve el flujo al paso Solicitante sin código adicional.

## ¿Qué decisiones cambiaron?

- **El `DestinationPickerField` no tiene botón "Continuar" propio.** En el diseño original se pensó en que el componente emitiera una señal explícita de "listo". Al ejecutar la implementación, la selección de sugerencia ya dispara el avance de paso vía `confirmedDraftSections`. El botón "Continuar" ya existía en el `FormSection` envolvente y sigue siendo el control de avance para el caso GPS/mapa (donde el usuario primero confirma "¿Es aquí?" y luego toca Continuar). No hubo que duplicarlo.
- **El input se deshabilita durante GPS y durante `pendingConfirm`.** Inicialmente se consideró dejarlo activo con un indicador. Se deshabilitó porque mostrar el texto GPS en un campo editable mientras el usuario puede escribir encima causa confusión: el texto que ve no corresponde a lo que ha escrito. Deshabilitar el campo durante esos dos estados resuelve la ambigüedad.
- **El campo muestra `pendingConfirm.text` en lugar de `value` cuando hay confirmación pendiente.** Esto es consistente con el principio de "lo que ves en el campo es lo que está en juego": la dirección GPS aparece en el input, y el banner "¿Es aquí?" pregunta por esa dirección visible. Si el usuario rechaza, el campo vuelve al `value` anterior (vacío o lo que haya escrito).

## ¿Qué quedó igual?

- El flujo completo del wizard: pasos, validaciones, avance, resumen de tarjetas, botón Continuar.
- El paso Origen: sin ningún cambio. `handleUseCurrentLocation("origin")` y el `LocationField` de origen funcionan exactamente igual que antes.
- `handleConfirmMapPoint` para origen: comportamiento idéntico al de PR-04A.
- Los endpoints `/api/geocoding/search` y `/api/geocoding/reverse`: cero modificaciones.
- TypeScript compila limpio. Cero errores antes y después.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- **ORBI-UX-01 funciona sin estado adicional en el wizard.** El principio de "selección = confirmación" no requiere un nuevo estado booleano `isUserConfirmed` separado: basta con que `handleDestSelectSuggestion` llame `setConfirmedDraftSections({ destino: true })` directamente. La arquitectura existente del wizard ya soporta este patrón.
- **El evento `onMouseDown + preventDefault` es la solución estándar para dropdowns custom en React.** No requiere `setTimeout`, no requiere `useRef` en el botón de sugerencia, no requiere handlers `onBlur`. Es el patrón más limpio y correcto.
- **La bifurcación `mapTarget === "destination"` en `handleConfirmMapPoint` es el punto de extensión correcto para ORBI-UX-01 en el flujo de mapa.** Cualquier futuro target que requiera confirmación (ej. un "origen secundario") puede añadirse con la misma bifurcación.
- **El debounce de 300 ms es suficiente para no saturar el endpoint.** Con `AbortController` la latencia percibida es mínima: si la respuesta anterior llega después de que el usuario escribió más, se cancela y no actualiza el estado.

## ¿Qué riesgos evitamos?

- Haber llamado `setDetails({ destination: ... })` directamente desde el GPS/mapa sin paso de confirmación habría violado ORBI-UX-01 antes de que el principio existiera siquiera en el código.
- Haber omitido `AbortController` habría producido condiciones de carrera en conexiones lentas: el usuario escribe "farmacia del centro" pero ve las sugerencias de "farm" porque el primer fetch terminó después del último.
- Haber creado el componente en un archivo separado habría expuesto los tipos internos (`DestPendingConfirm`, `SearchSuggestion`, `handleDestGps`, etc.) al sistema de módulos sin necesidad, incrementando la superficie de la API interna.
- Haber dejado el input habilitado durante `pendingConfirm` habría permitido al usuario escribir encima del texto GPS, creando un estado donde `value !== pendingConfirm.text` y el banner "¿Es aquí?" preguntaría por un lugar diferente al que ve el usuario.

---

## Pruebas manuales realizadas

| Escenario | Resultado |
|---|---|
| Escribir "farmacia" → aparecen 5 sugerencias | ✅ |
| Tocar primera sugerencia → destino confirmado, wizard avanza a Solicitante | ✅ |
| Escribir 1 carácter → no dispara búsqueda (mínimo 2) | ✅ |
| Escribir rápido → solo la última query resuelve (AbortController) | ✅ |
| Hacer clic fuera del dropdown → dropdown se cierra | ✅ |
| Origen sin cambio → sigue funcionando exactamente igual | ✅ |

## Pruebas pendientes para Diego (requieren dispositivo real o permiso GPS)

| Escenario | Estado |
|---|---|
| GPS → spinner → "¿Es aquí?" → confirmar → destino verde | Diseñado, no probado en browser sin GPS |
| GPS → permiso denegado → mensaje "No pudimos ubicarte" | Diseñado, no probado |
| Mapa → mover pin → cerrar mapa → "¿Es aquí?" → confirmar | Diseñado, no probado |
| Búsqueda sin resultados → mensaje "No encontramos ese lugar" | Diseñado, no probado en este municipio |
| Proveedor no disponible → mensaje "La búsqueda no está disponible" | Diseñado, no probado |
