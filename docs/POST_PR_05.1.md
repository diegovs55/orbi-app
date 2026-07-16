# POST_PR_05.1 — Bitácora de arquitectura

**PR:** Lenguaje situacional — títulos y placeholders según tipo de misión  
**Archivos modificados:** `components/ServiceRequestFlow.tsx`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que sería necesario tocar la lógica del wizard o los manejadores de estado.
- Que la variación de textos requeriría pasar props adicionales a componentes existentes de forma invasiva.

## ¿Qué descubrimos realmente?

- **Solo texto. Cero lógica.** Los 5 cambios son puramente presentacionales: dos funciones puras (`getDestinationSectionTitle`, `getDestinationPlaceholder`), una prop nueva (`serviceLabel?: string`), un título dinámico y un placeholder dinámico. Ningún handler, ningún estado, ningún endpoint tocado.
- **El prop `selectedService?.label` ya existía en el scope.** No hubo que agregar estado ni prop drilling: el valor ya estaba disponible exactamente donde se necesitaba.
- **Las funciones `switch` son la forma correcta.** Una alternativa hubiera sido un objeto de lookup `Record<string, string>`. Se eligió `switch` porque el default branch documenta explícitamente la intención de "si no es ninguno de estos casos, usar el texto genérico".

## ¿Qué decisiones cambiaron?

- **`getDestinationSectionTitle` solo cubre 3 casos.** Traslado y default son iguales ("Destino"), pero se mantienen separados para que el switch sea exhaustivo y futuras misiones puedan diferenciarse sin tocar el default.
- **`getDestinationPlaceholder` cubre los 6 casos actuales + default.** Cada servicio recibe el texto que corresponde a la pregunta real que ORBI hace al usuario en esa situación concreta.

## ¿Qué quedó igual?

- Toda la lógica del wizard: pasos, validaciones, avance, GPS, mapa, autocomplete.
- Los handlers `handleDestGps`, `handleDestSelectSuggestion`, `handleDestConfirmPending`, `handleDestRejectPending`.
- Los endpoints `/api/geocoding/search` y `/api/geocoding/reverse`.
- El contrato de SearchCenter (sin cambios — ese es PR-05.2).
- TypeScript compila limpio. Cero errores antes y después.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- **"ORBI no pregunta origen y destino. ORBI pregunta lo que necesita saber para resolver la situación concreta."** Este principio quedó registrado formalmente en la sesión de diseño previa al merge y ahora está implementado en código. El lenguaje de la UI depende del tipo de misión, no del componente.
- **El orden oficial de SearchCenter está definido como contrato permanente:**  
  1. Origen confirmado (cuando ya exista)  
  2. GPS actual del usuario (si todavía no existe origen)  
  3. Centro configurado de la Red ORBI (`NEXT_PUBLIC_NETWORK_LAT/LNG`)  
  4. Sin contexto geográfico (`null`)  
  Nunca coordenadas hardcodeadas. Este contrato se implementará en PR-05.2.

## ¿Qué riesgos evitamos?

- Haber mezclado cambios de texto con cambios de lógica habría violado el alcance de PR-05.1 y dificultado el rollback si algo saliera mal.
- Haber usado strings hardcoded en el JSX en lugar de funciones puras habría esparcido el lenguaje situacional sin un punto central de revisión.

---

## Resultados de verificación manual

| Servicio | Título del FormSection | Placeholder del campo | Resultado |
|---|---|---|---|
| Traslado | `DESTINO` | `¿A dónde vas?` | ✅ |
| Mandado | `DESTINO` | `¿A dónde va el mandado?` | ✅ |
| Entrega | `DESTINO` | `¿A dónde enviamos?` | ✅ |
| Recolección | `DESTINO` | `¿A dónde entregamos?` | ✅ |
| Pago o trámite | `LUGAR DEL TRÁMITE` | `¿Dónde es el trámite?` | ✅ |
| Compra local | `DESTINO DE ENTREGA` | `¿Dónde entregamos tu pedido?` | ✅ |

Verificación realizada en browser (`localhost:3000/pedir`) con la sesión activa del usuario N. Todos los escenarios muestran el texto correcto según el tipo de misión seleccionada.

---

## Diff PR-05.1 (solo los cambios de esta PR)

```diff
// FormSection title — antes hardcoded, ahora dinámico
- <FormSection title="Destino">
+ <FormSection title={getDestinationSectionTitle(selectedService?.label)}>

// DestinationPickerField — prop nueva serviceLabel
+ serviceLabel={selectedService?.label}

// Input placeholder — antes hardcoded, ahora dinámico
- placeholder="¿A dónde vas?"
+ placeholder={getDestinationPlaceholder(serviceLabel)}

// Dos funciones puras nuevas antes de DestinationPickerField:
+ function getDestinationSectionTitle(serviceLabel?: string): string { ... }
+ function getDestinationPlaceholder(serviceLabel?: string): string { ... }

// Tipo de DestinationPickerField — prop nueva
+ serviceLabel?: string;
```

---

## PRs pendientes (requieren autorización separada)

| PR | Alcance | Estado |
|---|---|---|
| PR-05.2 | SearchCenter para DestinationPickerField (orden oficial definido) | Pendiente autorización |
| PR-05.3 | Limpieza de mensajes de geocodificación | Pendiente |
| PR-05.4 | Origin LocationPicker (paso de origen) | Diferido |
