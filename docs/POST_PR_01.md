# POST_PR_01 — Bitácora de arquitectura

**PR:** Implementación de `GET /api/geocoding/search`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que Photon (Komoot) aceptaría `lang=es` como parámetro de idioma válido.
- Que `"default"` sería un valor de fallback implícito, no el contrato real de Photon.
- Que el TTL de caché de 5 minutos era correcto para producción.

## ¿Qué descubrimos realmente?

- Photon solo acepta `"default"`, `"de"`, `"en"`, `"fr"`. Para cualquier otro valor devuelve un error explícito en el cuerpo de la respuesta (no HTTP 4xx — el status sigue siendo 200, pero el campo `lang` contiene el mensaje de error).
- `"default"` en Photon no es ausencia de idioma: es una instrucción para usar el nombre OSM en el idioma local del lugar. En México ese idioma es español. El resultado es funcionalmente el correcto para ORBI.
- El TTL de 5 minutos no tiene evidencia operativa detrás. Es un valor razonable como punto de partida, no una decisión validada.

## ¿Qué decisiones cambiaron?

- `lang=es` no se pasa a Photon. Se mapea a `"default"` con un `Set` de idiomas soportados declarado en el código. La lógica de mapeo es reversible si Photon agrega soporte nativo para `"es"`.
- `CACHE_TTL_MS` pasó de ser una constante silenciosa a una constante explícitamente marcada como provisional.

## ¿Qué quedó igual?

- El contrato HTTP del endpoint es exactamente el diseñado: respuestas, códigos de estado, formato de `provider_id`, comportamiento ante proveedor no disponible.
- La separación de responsabilidades: el endpoint es un proxy puro. No inyecta contexto geográfico. No toma decisiones sobre qué buscar.
- La caché no cachea indisponibilidad.
- INV-016, INV-017, INV-018, INV-019, INV-020 se respetaron sin excepción.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- El contrato real de Photon para el parámetro `lang` debe tratarse como una interfaz externa con comportamiento propio, no como un reflejo del estándar ISO 639-1.
- Cualquier integración con un proveedor externo debe verificarse en tiempo de implementación, no asumirse desde la documentación del diseño.
- Los valores de configuración de caché (TTL, tamaño máximo) no deben fijarse como decisiones arquitectónicas sin evidencia operativa. Deben etiquetarse como provisionales y revisarse con datos reales.

## ¿Qué riesgos evitamos?

- Haber desplegado el endpoint con `lang=es` habría producido que Photon devolviera un objeto de error en lugar de resultados para todas las búsquedas — fallo silencioso en producción, difícil de diagnosticar.
- Haber documentado el TTL como decisión definitiva habría establecido una restricción falsa que dificultaría ajustes futuros basados en uso real.
