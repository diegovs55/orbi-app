# POST_PR_02 — Bitácora de arquitectura

**PR:** Implementación de `GET /api/geocoding/reverse`  
**Fecha de merge:** 2026-07-10

---

## ¿Qué supusimos antes de implementar?

- Que Nominatim devolvería siempre una cadena de texto cuando las coordenadas son geográficamente válidas.
- Que `lat=0 / lon=0` sería un caso de borde teórico sin consecuencias prácticas.
- Que el campo `display_name` de Nominatim sería suficiente como nombre canónico sin procesamiento adicional.
- Que el comportamiento del parámetro `lang` en Nominatim sería análogo al de Photon.

## ¿Qué descubrimos realmente?

- Nominatim devuelve `displayName: null` para coordenadas en el océano (`lat=0, lon=0`) — no hay datos OSM allí. Este comportamiento es correcto y el endpoint lo propaga limpiamente como `null`, sin inventar texto.
- Nominatim acepta `lang` vía header `Accept-Language` (no como query param), y sí soporta `"es"` correctamente — a diferencia de Photon. Con `lang=en` devuelve "State of Mexico, Mexico"; con `lang=es` devuelve "Estado de México, México". El contrato de idioma de Nominatim es más estándar que el de Photon.
- `display_name` de Nominatim es una cadena larga pero coherente que incluye número, calle, colonia, municipio, estado, CP y país. Usarla directamente (sin reconstruir desde campos estructurados) es la decisión correcta — como se estableció en D-R3 del diseño.

## ¿Qué decisiones cambiaron?

- Ninguna decisión del diseño técnico aprobado fue alterada. El endpoint se implementó conforme al contrato exacto de ORBI_GEO_ENDPOINTS.md.
- La nueva regla añadida por Diego ("el endpoint nunca inventa texto de fallback") se incorporó como comentario explícito en el código y como invariante de comportamiento. Quedó validada empíricamente: `lat=0/lon=0` devuelve `displayName: null`, no una cadena fabricada.

## ¿Qué quedó igual?

- El patrón estructural del handler es idéntico al de PR-01: validación → caché → llamada al proveedor con timeout → transformación → respuesta.
- `CACHE_TTL_MS` marcado como provisional, igual que en search.
- HTTP 200 para proveedor no disponible (DA-014).
- No se cachea indisponibilidad — sí se cachea `displayName: null` (es un resultado válido, no un error).
- INV-016, INV-017, INV-018, INV-020 respetados sin excepción.

## ¿Qué conocimiento nuevo obtuvo ORBI?

- Nominatim y Photon tienen contratos de idioma completamente distintos: Photon usa un parámetro de query con valores cerrados (`"default"`, `"de"`, `"en"`, `"fr"`); Nominatim usa un header HTTP estándar (`Accept-Language`) con soporte real para ISO 639-1. No se puede asumir uniformidad entre proveedores de geocodificación.
- Cachear `displayName: null` es correcto. Un punto en el océano siempre devolverá `null`; guardarlo evita una llamada redundante a Nominatim para esas coordenadas durante el TTL.
- La separación entre "no hay nombre" (`displayName: null`) y "proveedor no disponible" (`status: "unavailable"`) es una distinción semántica real con consecuencias en la capa de presentación. El endpoint la mantiene limpia.

## ¿Qué riesgos evitamos?

- Haber inventado texto de fallback en el endpoint habría mezclado responsabilidades de presentación con responsabilidades de datos, haciendo imposible que la UI muestre textos distintos según el contexto de uso (GPS vs mapa vs geocodificación).
- Haber rechazado `lat=0/lon=0` habría introducido un bug silencioso: coordenadas técnicamente válidas que el sistema trataría como error, violando INV-016.
- Haber cacheado respuestas de indisponibilidad habría hecho que una caída momentánea de Nominatim bloqueara el uso del endpoint durante 10 minutos, incluso después de que el proveedor se recuperara.
