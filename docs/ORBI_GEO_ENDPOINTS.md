# ORBI_GEO_ENDPOINTS — Diseño técnico de los endpoints de geocodificación

**Versión:** 1.0  
**Estado:** Diseño pendiente de validación por Diego. No hay código implementado.  
**Fecha:** 2026-07-10  
**Alcance:** Diseño de arquitectura de `/api/geocoding/search` y `/api/geocoding/reverse` para la Etapa 2 del Diseño v3. Define responsabilidades, contratos, flujos de error, estrategia de caché y decisiones de diseño.  
**Referencia obligatoria:** ORBI_GEO_CONTRACT.md — toda decisión de este documento debe ser coherente con ese contrato.

---

## Principios de diseño aplicados

Los siguientes principios del proyecto son vinculantes para ambos endpoints:

| Principio | Aplicación concreta |
|---|---|
| INV-017 — Photon y Nominatim nunca desde browser | Ambos endpoints son la única vía. El browser nunca llama a los proveedores directamente. |
| INV-018 — Nominatim solo para reverse | `/api/geocoding/search` usa Photon exclusivamente. Nominatim no entra en búsqueda por texto. |
| INV-016 — lat=0 / lng=0 son coords válidas | El endpoint reverse no rechaza `lat=0` ni `lon=0`. |
| INV-019 — SearchCenter es null, nunca {0,0} | El parámetro `lat`/`lon` en search es opcional. Ausencia = sin contexto. {0,0} es una coordenada válida, no "sin contexto". |
| INV-020 — Sin hardcodes geográficos | Ningún endpoint inyecta nombres de municipios, países o regiones en las queries al proveedor. |
| DA-014 — HTTP 200 para proveedor no disponible | Ambos endpoints retornan 200 cuando el proveedor externo falla o no responde. |
| DA-015 — Sin badge de cobertura | Los endpoints no exponen información que permita inferir "sin cobertura". |
| DA-011 — Caché best-effort por instancia | Caché en memoria, no compartida entre instancias de Vercel. |

---

## Endpoint 1 — `/api/geocoding/search`

### Responsabilidad única

Recibir texto del usuario y devolver sugerencias de lugares con coordenadas y metadatos, actuando como proxy entre el browser y Photon (Komoot). Nunca llama a Nominatim.

### Acoplamiento con el contrato

Este endpoint es la única fuente de datos para los campos:
- `place_name` (desde `display_name` de Photon)
- `provider_id` (compuesto `"photon:{osmType}:{osmId}"`)
- `provider` (siempre `"photon"` cuando este endpoint responde con resultados)

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `q` | string | Sí | Texto de búsqueda. Vacío → HTTP 400. |
| `lang` | string | No | Idioma de resultados. Default: `"es"`. Photon acepta ISO 639-1. |
| `limit` | integer | No | Máximo de resultados. Default: 5. Máximo aceptado: 10. Valores fuera de rango → corregir silenciosamente (clamp). |
| `lat` | number | No | Latitud del centro de búsqueda. Ver nota sobre SearchCenter. |
| `lon` | number | No | Longitud del centro de búsqueda. Ver nota sobre SearchCenter. |

**Nota sobre SearchCenter:** `lat` y `lon` son siempre opcionales. Si se omiten, Photon realiza la búsqueda sin sesgo geográfico. Si se envían, Photon los usa para priorizar resultados cercanos. `lat=0` y `lon=0` son valores válidos que Photon interpreta correctamente (INV-016). El browser nunca debe enviar `lat=0,lon=0` para significar "sin contexto" (INV-019) — debe simplemente omitir los parámetros en ese caso.

**El endpoint no valida ni corrige las coordenadas del caller.** Si el caller envía {0,0} como contexto legítimo, el endpoint los pasa a Photon sin modificación. La responsabilidad de no enviar {0,0} como "sin contexto" recae en el código del componente que llama al endpoint.

### Flujo de procesamiento

```
REQUEST → validar q → construir query a Photon → llamar Photon → transformar → RESPONSE

Validación:
  - Si q está ausente o vacío → 400 { error: "q is required" }
  - limit: clamp al rango [1, 10], default 5
  - lang: pasar tal cual a Photon, default "es"

Query a Photon:
  URL base: https://photon.komoot.io/api/
  Params:
    q = q (sin modificación, sin inyectar nombres geográficos — INV-020)
    lang = lang
    limit = limit
    lat, lon = si están presentes en la request

Timeout: 4000 ms
User-Agent: "orbi-geocoding/1.0" (requerido por políticas de uso de Photon/OSM)

Transformación de resultado:
  Photon devuelve GeoJSON FeatureCollection.
  Por cada Feature:
    - providerId  = "photon:" + feature.properties.osm_type + ":" + feature.properties.osm_id
    - displayName = construir desde propiedades (ver sección de construcción de displayName)
    - lat         = feature.geometry.coordinates[1]  (GeoJSON es [lon, lat])
    - lon         = feature.geometry.coordinates[0]
    - osmType     = feature.properties.osm_type  ("N" | "W" | "R")
    - osmId       = feature.properties.osm_id    (número)
    - type        = feature.properties.type      (opcional, "city", "street", "house", etc.)
```

### Construcción del `displayName`

Photon no devuelve un campo `display_name` único como Nominatim. Devuelve propiedades individuales que deben combinarse. El orden de construcción:

```
Prioridad de campos disponibles en feature.properties:
  name         → nombre del lugar (farmacia, calle, colonia, etc.)
  housenumber  → número exterior
  street       → nombre de calle
  district     → colonia o delegación
  city         → ciudad o municipio
  county       → estado o departamento
  country      → país

Regla de construcción:
  displayName = [name, street+housenumber, district, city].filter(truthy).join(", ")

Si name está vacío y street está vacío → descartar ese resultado (no tiene nombre útil).
País NO se incluye en displayName (INV-020: no exponer hardcodes geográficos en el UI;
el país es redundante cuando la app opera en una zona conocida y solo añade ruido visual).
```

Esta regla es una decisión de diseño deliberada: producir el texto más conciso y útil posible sin exponer el nombre del país (que es redundante e introduce ruido).

### Respuestas

**200 — Éxito con resultados:**
```json
{
  "results": [
    {
      "providerId": "photon:N:12345678",
      "displayName": "Farmacia del Ahorro, Av. Hidalgo 45, Tenancingo",
      "lat": 18.9612,
      "lon": -99.5893,
      "osmType": "N",
      "osmId": 12345678,
      "type": "house"
    }
  ]
}
```

**200 — Sin resultados (búsqueda válida, cero coincidencias):**
```json
{
  "results": []
}
```

**200 — Proveedor no disponible (timeout, error de red, error HTTP de Photon):**
```json
{
  "results": [],
  "status": "unavailable",
  "fallbackAvailable": true
}
```

> `fallbackAvailable: true` indica al cliente que puede seguir usando GPS y mapa. El cliente **no debe mostrar ningún badge de cobertura** (DA-015). La distinción entre "sin resultados" y "proveedor caído" es interna para el cliente; la UX debe ser idéntica en ambos casos.

**400 — Parámetros inválidos:**
```json
{ "error": "q is required" }
```

**500 — Error interno del servidor Next.js (no del proveedor externo):**
```json
{ "error": "Internal server error" }
```

> HTTP 500 es solo para fallos del servidor propio (uncaught exception en el handler). El fallo del proveedor externo siempre produce HTTP 200 con `status: "unavailable"`.

### Estrategia de caché

- Caché en memoria (`Map`) por instancia de Vercel. No compartida entre instancias (DA-011).
- Clave de caché: `"${q}|${lang}|${limit}|${lat}|${lon}"` — incluyendo el contexto geográfico, porque la misma query con distinto centro produce resultados diferentes.
- TTL: 5 minutos.
- Tamaño máximo: 200 entradas (LRU implícito: al superar el límite, borrar la entrada más antigua).
- La caché se omite en caso de error del proveedor (no cachear indisponibilidad).

### Decisiones de diseño — search

**D-S0: Adaptación al contrato real de Photon — `lang` no soportado → `"default"`**  
Photon (Komoot) solo acepta los valores `"default"`, `"de"`, `"en"`, `"fr"` para el parámetro `lang`. El diseño original asumía soporte para `"es"`, pero en producción Photon devuelve un error explícito para ese valor. La conversión `es → default` implementada en el endpoint **no es una traducción**: no cambia el idioma de los resultados. Es una adaptación al contrato real de Photon — el valor `"default"` hace que Photon devuelva los nombres OSM en el idioma local del lugar, que en México es español. Si Photon incorpora soporte nativo para `"es"` en el futuro, el `Set` de idiomas soportados puede actualizarse sin cambiar la lógica del endpoint.

**D-S1: ¿Por qué Photon y no Nominatim para search?**  
Photon está diseñado específicamente para autocomplete: responde en < 300 ms, devuelve `osm_id` y `osm_type` para cada resultado (habilitando `provider_id`), y sus términos de uso son más permisivos para alto volumen. Nominatim tiene rate limits más estrictos y no devuelve identificadores de entidad de forma estable para autocomplete (INV-018, DA-010).

**D-S2: ¿Por qué no incluir el país en `displayName`?**  
El nombre del país añade ruido visual en el dropdown sin aportar información discriminante cuando todos los resultados son del mismo país. Si ORBI expande a múltiples países, este comportamiento puede revisarse en ese momento (INV-025: no diseñar para problemas sin evidencia operativa).

**D-S3: ¿Por qué `limit` máximo de 10?**  
El autocomplete muestra 5 sugerencias por defecto. El máximo de 10 permite flexibilidad futura sin abrir la puerta a requests abusivos. Photon acepta límites más altos, pero en el contexto de un dropdown de autocomplete, más de 10 resultados no mejoran la experiencia.

**D-S4: ¿Por qué el endpoint no inyecta contexto geográfico hardcodeado?**  
INV-020. El caller (el componente) es responsable de pasar el `SearchCenter` adecuado según `resolveSearchCenter()`. El endpoint es un proxy puro. Si el caller no tiene contexto, omite `lat`/`lon` y Photon busca globalmente. Inyectar un municipio o región hardcodeada en el proxy viola INV-020 y rompería el diseño en cualquier zona distinta a Zumpahuacán.

---

## Endpoint 2 — `/api/geocoding/reverse`

### Responsabilidad única

Recibir coordenadas y devolver el nombre canónico del lugar en esas coordenadas, actuando como proxy entre el browser y Nominatim. Nunca usarlo para búsqueda por texto (INV-018).

### Acoplamiento con el contrato

Este endpoint es la única fuente de datos para `place_name` cuando el método es `"gps"` o `"map"`. También actualiza `place_name` cuando el método es `"geocode"` (búsqueda legada de texto).

El `displayName` que devuelve este endpoint se escribe en `origin_place_name` / `destination_place_name` conforme a GEO-INV-03 (v1.1): el campo se actualiza cuando cambian las coordenadas.

### Parámetros de entrada

| Parámetro | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `lat` | number | Sí | Latitud. `lat=0` es válido (INV-016). Ausente → 400. |
| `lon` | number | Sí | Longitud. `lon=0` es válido (INV-016). Ausente → 400. |
| `lang` | string | No | Idioma del resultado. Default: `"es"`. Nominatim acepta ISO 639-1 via `accept-language`. |

**Nota crítica sobre validación de `lat` y `lon`:**  
El endpoint no debe rechazar `lat=0` ni `lon=0`. Esas son coordenadas válidas que corresponden al punto en el Océano Índico donde el Ecuador cruza el meridiano de Greenwich. Un punto allí sería inusual para ORBI, pero no es un error de programación ni una señal de "sin coordenadas" (INV-016). La única validación válida es: el parámetro está presente y es un número finito. `null`, `undefined`, `NaN`, `Infinity` → 400.

### Flujo de procesamiento

```
REQUEST → validar lat/lon → llamar Nominatim → transformar → RESPONSE

Validación:
  - Si lat o lon ausentes → 400 { error: "lat and lon are required" }
  - Si lat o lon no son número finito → 400 { error: "lat and lon must be finite numbers" }
  - lat=0 y lon=0 → VÁLIDOS, continuar

Query a Nominatim:
  URL base: https://nominatim.openstreetmap.org/reverse
  Params:
    format = jsonv2
    lat    = lat
    lon    = lon
    accept-language = lang (header, no query param)
    zoom   = 18  (nivel de detalle máximo — dirección completa)

Headers obligatorios:
  User-Agent: "orbi-geocoding/1.0 (contacto@orbi.app)"
  (Requerido por política de uso de Nominatim. Sin User-Agent, Nominatim puede bloquear la IP.)

Timeout: 5000 ms  (Nominatim es más lento que Photon)

Transformación de resultado:
  Nominatim devuelve { display_name, address, ... } o { error: "Unable to geocode" }
  
  Si Nominatim devuelve display_name → usar como displayName
  Si Nominatim devuelve error o display_name vacío → displayName = null
  En ningún caso lanzar error HTTP — siempre 200
```

### Respuestas

**200 — Éxito con nombre encontrado:**
```json
{
  "displayName": "Calle Nicolás Bravo 42, La Ascensión, Zumpahuacán, Estado de México"
}
```

**200 — Coordenadas válidas pero sin resultado de Nominatim:**
```json
{
  "displayName": null
}
```

> Ocurre en el océano, áreas sin datos OSM, o puntos en los que Nominatim no puede asociar una dirección. El cliente debe usar su texto de fallback ("Punto marcado en mapa", "Ubicación actual") y **las coordenadas siguen siendo válidas** (GEO-INV-06).

**200 — Proveedor no disponible (timeout, error de red, error HTTP de Nominatim):**
```json
{
  "results": [],
  "status": "unavailable",
  "fallbackAvailable": true
}
```

> La forma del cuerpo es idéntica a search para consistencia de manejo de errores en el cliente. `fallbackAvailable: true` indica que el usuario puede usar las coordenadas aunque no haya nombre.

**400 — Parámetros inválidos:**
```json
{ "error": "lat and lon are required" }
```
```json
{ "error": "lat and lon must be finite numbers" }
```

**500 — Error interno del servidor Next.js:**
```json
{ "error": "Internal server error" }
```

### Estrategia de caché

- Caché en memoria (`Map`) por instancia, igual que search.
- Clave de caché: `"${lat}|${lon}|${lang}"` — las coordenadas son la clave de lookup.
- TTL: 10 minutos (los resultados de reverse son más estables que los de autocomplete).
- Tamaño máximo: 500 entradas (reverse se llama con menos frecuencia pero sobre más coordenadas distintas).
- No cachear respuestas `status: "unavailable"`.

### Decisiones de diseño — reverse

**D-R1: ¿Por qué `zoom=18` en Nominatim?**  
Zoom 18 es el nivel más detallado de Nominatim: devuelve número de edificio, calle, colonia, municipio. Niveles menores devuelven nombres menos precisos (solo calle a zoom 17, solo barrio a zoom 16). Para la operativa de ORBI — donde el agente necesita llegar a una dirección específica — la precisión máxima es la correcta.

**D-R2: ¿Por qué `format=jsonv2` y no `format=json`?**  
`jsonv2` devuelve campos estructurados adicionales (`addresstype`, `category`) que permiten procesamiento futuro sin cambiar el endpoint. `json` es el formato legacy; `jsonv2` es el recomendado por Nominatim para nuevas implementaciones.

**D-R3: ¿Por qué no reconstruir `displayName` desde los campos estructurados de `address`?**  
Nominatim construye `display_name` con lógica interna que considera el tipo de objeto OSM, el nivel administrativo y el idioma solicitado. Reproducir esa lógica en ORBI sería complejidad innecesaria (INV-024) y podría producir resultados inconsistentes. Se usa `display_name` directamente.

**D-R4: ¿Por qué timeout de 5 segundos, mayor que el de search (4s)?**  
Nominatim tiene latencia más variable que Photon. En reverse geocoding, el usuario acaba de mover un pin o de activar el GPS — está en el flujo activo y puede esperar hasta 5 segundos sin que la UX se rompa. Si Nominatim no responde en 5 segundos, se devuelve `status: "unavailable"` y el flujo continúa con las coordenadas ya asignadas.

---

## Comparación de los dos endpoints

| Característica | `/api/geocoding/search` | `/api/geocoding/reverse` |
|---|---|---|
| Dirección del flujo | Texto → coords + metadatos | Coords → texto |
| Proveedor externo | Photon (Komoot) | Nominatim (OSM) |
| Cuándo se llama | Al escribir en el input (debounced ≥ 300ms) | Al confirmar GPS, mapa, o texto geocodificado |
| Parámetro clave | `q` (texto) | `lat` + `lon` |
| Contexto opcional | `lat`, `lon` (SearchCenter) | No aplica |
| Campos del contrato que produce | `place_name`, `provider_id`, `provider="photon"` | `place_name` (sin `provider_id`) |
| Caché TTL | 5 minutos | 10 minutos |
| Caché tamaño | 200 entradas | 500 entradas |
| Timeout | 4000 ms | 5000 ms |
| HTTP en fallo del proveedor | 200 + `status: "unavailable"` | 200 + `status: "unavailable"` |
| Formato de respuesta exitosa | `{ results: [...] }` | `{ displayName: string \| null }` |

---

## Riesgos identificados

**R-1 — Rate limiting de Nominatim**  
Nominatim impone un límite de 1 request/segundo por IP. La caché mitiga esto, pero en picos de uso simultáneo (múltiples usuarios confirmando GPS en el mismo segundo) puede producirse throttling. Mitigación en diseño: caché con TTL extendido (10 min), y el comportamiento `status: "unavailable"` no bloquea el flujo del usuario.

**R-2 — Variabilidad de latencia de Photon**  
Photon.komoot.io es un servicio público no garantizado. Puede tener picos de latencia o caídas. El timeout de 4 segundos y la respuesta `status: "unavailable"` protegen al usuario. Mitigación adicional posible en el futuro: instancia propia de Photon (fuera del alcance de Diseño v3).

**R-3 — Caché no compartida entre instancias Vercel**  
En un despliegue con múltiples instancias de Vercel (común en producción), cada instancia tiene su propia caché en memoria. La misma query puede llegar a diferentes instancias y generar requests redundantes al proveedor. Es una limitación conocida y aceptada (DA-011). En volumen bajo (MVP) no es un problema operativo.

**R-4 — Calidad de `displayName` construido desde Photon**  
Photon devuelve campos individuales (`name`, `street`, `city`) que se deben combinar. La lógica de combinación puede producir nombres incompletos o extraños para ciertos tipos de lugar (un lago, una ruta, un límite administrativo). Mitigación: si el resultado no tiene ni `name` ni `street`, se descarta. El usuario verá menos sugerencias pero más precisas.

**R-5 — `provider_id` y estabilidad de `osm_id`**  
Los `osm_id` de OpenStreetMap no son eternamente estables: una entidad puede ser re-tageada o fusionada, cambiando su ID. En el contexto de ORBI, esto es aceptable: `provider_id` es un identificador de sesión (se usa para saber qué seleccionó el usuario en este flujo, no para referencias a largo plazo). Las misiones almacenan las coordenadas como fuente de verdad, no el `osm_id`.

---

## Preguntas que requieren confirmación antes de la implementación

**P-1 — `displayName` desde Photon: ¿incluir `district` (colonia)?**  
La regla propuesta incluye `district` en el `displayName`. En México, las colonias son importantes para la orientación del agente. Sin embargo, pueden alargar el texto del dropdown de forma significativa. ¿Se incluye `district` o se omite?

**P-2 — `User-Agent` de contacto**  
La política de uso de Nominatim requiere un `User-Agent` con información de contacto real. Se propone `"orbi-geocoding/1.0 (contacto@orbi.app)"`. ¿Es correcto el email de contacto?

**P-3 — ¿Photon con sesgo de idioma aplicado en el servidor o solo en la query?**  
Photon acepta `lang` como parámetro de query. ¿Se fija en `"es"` hardcodeado en el servidor (para no depender de que el caller lo envíe), o se pasa desde el cliente para soportar futuros idiomas?

**P-4 — Tamaño de caché: ¿límite de entradas o de bytes?**  
El diseño propone límite por número de entradas (200 para search, 500 para reverse). Alternativamente se puede limitar por bytes totales si se prevé que los `displayName` largos consuman memoria desproporcionada. ¿Se acepta el límite por entradas como primera implementación?

---

*Este documento es el contrato de diseño para la Etapa 2 del Diseño v3. No hay código implementado. La implementación no puede comenzar hasta que Diego apruebe este diseño explícitamente.*
