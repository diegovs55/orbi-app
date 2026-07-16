# POST_PR_05.2 — Bitácora de arquitectura

**PR:** Contexto operativo — SearchCenter para autocomplete de destino  
**Archivos modificados:** `components/ServiceRequestFlow.tsx`, `docs/ORBI_MASTER.md`, `.env.local`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que habría que tocar el endpoint `/api/geocoding/search`.
- Que el mecanismo de GPS-as-fallback estaría disponible sincrónicamente.

## ¿Qué descubrimos realmente?

- **El endpoint ya soportaba `lat`/`lon` opcionales** (líneas 144-163 de `app/api/geocoding/search/route.ts`). Solo faltaba que el componente los enviara. Cero cambios al endpoint.
- **El GPS live (P2) no es accesible sincrónicamente** en el contexto de React sin estado adicional. Se implementaron P1 y P3 con precisión; P2 se registra como deuda para PR-05.4.
- **Para la mayoría de los casos en producción, P1 aplica directamente.** El usuario típicamente llega al paso Destino después de confirmar el origen con GPS/mapa. En ese momento `originCoordinatePair` tiene coordenadas y el SearchCenter queda anclado al punto de partida real de la misión.
- **Cuando el origen es texto-libre sin coordenadas, aplica P3.** `NEXT_PUBLIC_NETWORK_LAT/LNG` ancla las búsquedas al centro operativo de la red. Los resultados pertenecen al entorno local.

## ¿Qué decisiones cambiaron?

- **`resolveSearchCenter` es función de módulo, no hook.** No necesita estado de React: recibe `originCoordinatePair` como argumento y devuelve `{ lat, lng } | null`. Pura, predecible, testeable.
- **Se nombró el concepto como "contexto operativo"**, no "SearchCenter". El SearchCenter es solo la representación técnica del contexto. El concepto más amplio (§9.5 de ORBI_MASTER.md) aplica también a routing, agentes, ETA, precios y recomendaciones.
- **`NEXT_PUBLIC_NETWORK_LAT/LNG` se agregaron a `.env.local`** con las coordenadas del municipio de Zumpahuacán como valores iniciales. Estos valores son configurables por entorno — no hay hardcode en código fuente.

## ¿Qué quedó igual?

- El endpoint `/api/geocoding/search`: sin ningún cambio.
- La lógica de autocomplete: AbortController, debounce, dropdown, noResults, searchUnavailable — todo intacto.
- La UI del campo de destino: sin ningún cambio visual.
- El origen y sus manejadores GPS: sin ningún cambio.
- La persistencia del draft: sin ningún cambio.
- TypeScript compila limpio. Cero errores antes y después.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- **El principio de contexto operativo está documentado como invariante en §9.5 de ORBI_MASTER.md.** Este es el punto de referencia para todas las decisiones futuras que dependan de localización.
- **La prioridad P2 (GPS live sin origen) solo tiene valor cuando el usuario no ha registrado ningún origen.** En la práctica, este caso ocurre cuando el wizard está en el paso Destino pero el origen fue texto libre sin geocodificación. Para PR-05.4, se deberá almacenar la última posición GPS del módulo singleton como referencia disponible sincrónicamente.

## ¿Qué riesgos evitamos?

- Haber hardcodeado las coordenadas de Zumpahuacán directamente en el fetch URL habría violado INV-020 y bloqueado la operación de ORBI en cualquier otro municipio.
- Haber modificado el endpoint para inyectar coordenadas del lado del servidor habría acoplado la lógica de negocio al proxy, violando la separación de capas.
- Haber implementado P2 como estado global sin una política de actualización clara habría introducido state drift entre el GPS del sistema y el GPS del contexto operativo.

---

## Comparativa de resultados (evidencia real)

### Farmacia

| | Resultado 1 | Resultado 2 | Resultado 3 |
|---|---|---|---|
| **Sin contexto (antes)** | Farmacia, Correzzola (Italia) | Farmacia, Itagüí (Colombia) | farmacia, Villa del Rosario (Colombia) |
| **Con contexto (ahora)** | Farmacia, Calle Isabel La Católica, Santa María Nativitas | Farmacia, Calzada Dolores, San Nicolás Tlazala, Capulhuac | Farmacia, Calle 16 De Septiembre, Ojo de Agua |

### Coppel

| | Resultado 1 | Resultado 2 | Resultado 3 |
|---|---|---|---|
| **Sin contexto (antes)** | Coppel, Ciudad Valles | Coppell (EUA) | Coppel, Saint-Julien-de-Coppel (Francia) |
| **Con contexto (ahora)** | Coppel, Villa Guerrero, Estado de México | Coppel, Tenango de Arista | Coppel, Puente de Ixtla |

### Garis

| | Resultado 1 | Resultado 2 | Resultado 3 |
|---|---|---|---|
| **Sin contexto (antes)** | Garis, Chaucha (Ecuador) | Garis (Ecuador) | Garissa (Kenya) |
| **Con contexto (ahora)** | GARIS, Calle Oviedo, Villa Guerrero | GARIS, Avenida Paseo de los Insurgentes, Tenancingo | Garis, San Antonio La Isla |

### Regina

Sin cambio significativo: "Regina" no tiene homónimos cercanos a Zumpahuacán. Resultado esperado y correcto — Photon devuelve los mismos resultados con y sin contexto para términos sin representación local fuerte.

---

## Diff PR-05.2 (cambios exclusivos)

```diff
// resolveSearchCenter — función de módulo nueva (§9.5)
+ function resolveSearchCenter(
+   originCoordinatePair: { lat: number; lng: number } | null
+ ): { lat: number; lng: number } | null {
+   if (originCoordinatePair) return originCoordinatePair;
+   const netLat = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LAT ?? "");
+   const netLng = parseFloat(process.env.NEXT_PUBLIC_NETWORK_LNG ?? "");
+   if (Number.isFinite(netLat) && Number.isFinite(netLng)) return { lat: netLat, lng: netLng };
+   return null;
+ }

// DestinationPickerField — prop nueva searchCenter
+ searchCenter?: { lat: number; lng: number } | null;

// Llamada a DestinationPickerField — prop nueva
+ searchCenter={resolveSearchCenter(originCoordinatePair)}

// Fetch URL — incluye lat/lon cuando hay contexto
- fetch(`/api/geocoding/search?q=${encodeURIComponent(newValue.trim())}&limit=5`, ...)
+ const searchUrl = new URL("/api/geocoding/search", window.location.origin);
+ searchUrl.searchParams.set("q", newValue.trim());
+ searchUrl.searchParams.set("limit", "5");
+ if (searchCenter) {
+   searchUrl.searchParams.set("lat", String(searchCenter.lat));
+   searchUrl.searchParams.set("lon", String(searchCenter.lng));
+ }
+ fetch(searchUrl.toString(), ...)
```

```diff
// .env.local — vars nuevas
+ NEXT_PUBLIC_NETWORK_LAT=18.8349
+ NEXT_PUBLIC_NETWORK_LNG=-99.5818
```

---

## PRs pendientes (requieren autorización separada)

| PR | Alcance | Estado |
|---|---|---|
| PR-05.3 | Limpieza de mensajes de geocodificación | Pendiente autorización |
| PR-05.4 | Origin LocationPicker + GPS live como P2 del contexto operativo | Diferido |
