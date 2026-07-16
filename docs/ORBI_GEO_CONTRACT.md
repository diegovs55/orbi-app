# ORBI_GEO_CONTRACT — Contrato de Georreferenciación Enriquecida

**Versión:** 1.1  
**Estado:** Aprobado por Diego — base para Etapas 2–8 del Diseño v3  
**Fecha:** 2026-07-10  
**Revisión v1.1:** 2026-07-10 — Correcciones de auditoría conceptual: `provider` y `place_name` se conservan cuando el usuario edita texto; solo `provider_id` y `confirmed` cambian. GEO-INV-03 actualizado. Diagramas y tabla resumen actualizados.  
**Alcance:** Define el comportamiento canónico de los 10 campos geo añadidos a `public.missions` en la Etapa 1. No describe implementación, componentes ni APIs.

---

## Preámbulo — Campos canónicos preexistentes

Los campos `origin`, `originLat`, `originLng`, `destination`, `destinationLat`, `destinationLng` (en el draft) y sus equivalentes `origin_text`, `origin_lat`, `origin_lng`, `destination_text`, `destination_lat`, `destination_lng` (en la tabla `missions`) son la fuente de verdad de coordenadas y texto visible para el usuario. **Este contrato no los redefine ni los reemplaza.** Los 10 campos nuevos son metadatos adicionales que enriquecen el registro de cómo se obtuvo esa ubicación.

---

## Parte I — Definición individual de cada campo

Los campos de origen y destino son simétricos en semántica. Se documentan juntos, distinguiendo con `[origen]` / `[destino]` solo donde difiere el contexto.

---

### 1. `origin_place_name` / `destination_place_name`

**1. ¿Qué representa?**  
El nombre canónico del lugar tal como lo devuelve el proveedor geocodificador, no el texto que el usuario escribió. Es la descripción estructurada y normalizada de la ubicación confirmada: puede ser una dirección completa, el nombre de un lugar de interés, o la descripción del punto más cercano según el proveedor.

- Cuando el proveedor es Photon: el `display_name` de la sugerencia seleccionada.
- Cuando el proveedor es Nominatim (reverse desde GPS o mapa): el `display_name` devuelto.
- Cuando el usuario escribe texto libre y geocodifica: el `display_name` que Nominatim asocia a ese texto.
- Cuando no hay respuesta del proveedor: `null`.

Este campo NO reemplaza `origin_text` / `destination_text`, que es el texto que el usuario escribió y que puede diferir del nombre canónico.

**2. ¿Quién puede modificarlo?**  
Solo el proveedor geocodificador, de forma indirecta: el sistema lo escribe en el momento en que el proveedor responde con éxito. El usuario no lo edita directamente.

**3. ¿En qué momento se escribe?**  
- Al seleccionar una sugerencia de Photon: se escribe el `display_name` de la sugerencia.
- Al confirmar un punto en el mapa: se escribe el `display_name` que devuelve Nominatim para esas coordenadas.
- Al usar GPS: se escribe el `display_name` que devuelve Nominatim para las coordenadas del dispositivo.
- Al geocodificar texto libre (método legado): se escribe el `display_name` de Nominatim.
- En la creación de la misión: se persiste el valor que estaba en el draft en ese momento.

**4. ¿Puede volver a cambiar?**  
Sí, mientras la misión no haya sido creada. Cada nueva selección de sugerencia, GPS o mapa sobreescribe el valor anterior. Una vez creada la misión, es inmutable.

**5. ¿Qué sucede si el usuario modifica el texto?**  
`origin_place_name` / `destination_place_name` **no cambian**. `place_name` es el nombre canónico del geocodificador para las coordenadas actuales; describe las coordenadas, no el texto del usuario. Si las coordenadas no cambian, su nombre canónico tampoco. El campo se pone a `null` únicamente cuando las coordenadas se borran explícitamente o cuando un nuevo método de geocodificación devuelve un resultado diferente. Esta distinción es clave para la trazabilidad: la misión puede registrar que el usuario escribió "la farmacia" mientras el geocodificador identificó "Farmacia del Ahorro, Av. Hidalgo 45".

**6. ¿Qué sucede si falla Photon?**  
El campo queda `null`. El usuario puede usar GPS o mapa como alternativa, en cuyo caso se populará desde Nominatim reverse. El flujo no se bloquea.

**7. ¿Qué sucede si falla Nominatim?**  
El campo queda `null`. Las coordenadas se asignan igualmente (el reverse es best-effort; su falla no invalida las coords). Se usa el fallback de texto: "Punto marcado en mapa" o "Ubicación actual".

**8. ¿Qué sucede si el usuario usa únicamente mapa?**  
Se escribe el `display_name` que Nominatim devuelve para el punto marcado. Si Nominatim falla, queda `null`. Las coordenadas se asignan de todas formas.

**9. ¿Qué sucede si usa únicamente GPS?**  
Igual que con el mapa: `display_name` de Nominatim para las coords del dispositivo. Si falla, `null`. Coords asignadas de todas formas.

**10. ¿Qué sucede si escribe una referencia manual?**  
`origin_place_name` no cambia. La referencia manual se escribe en `origin_reference` / `destination_reference`, que es un campo independiente y no interfiere con este.

---

### 2. `origin_provider_id` / `destination_provider_id`

**1. ¿Qué representa?**  
Un identificador compuesto y estable del lugar en el sistema del proveedor. Formato canónico: `"{proveedor}:{osmType}:{osmId}"` — por ejemplo `"photon:N:12345678"`. Permite trazar con exactitud qué entidad de OpenStreetMap fue seleccionada.

Solo tiene valor cuando el lugar se obtuvo de Photon, porque Photon devuelve `osmType` y `osmId`. Para los demás métodos (GPS, mapa, texto libre + Nominatim) el campo es `null`, porque Nominatim reverse devuelve `display_name` pero no un identificador estable de entidad de la misma forma.

**2. ¿Quién puede modificarlo?**  
Solo el sistema, al recibir la respuesta de Photon. El usuario no lo edita.

**3. ¿En qué momento se escribe?**  
Únicamente al seleccionar una sugerencia de Photon. En todos los demás métodos el campo permanece `null`.

**4. ¿Puede volver a cambiar?**  
Sí, mientras no se haya creado la misión. Una nueva selección de Photon sobreescribe. Una selección por GPS o mapa lo pone a `null`. Una vez creada la misión, es inmutable.

**5. ¿Qué sucede si el usuario modifica el texto?**  
Se pone a `null`. El identificador de la sugerencia anterior ya no corresponde al texto editado.

**6. ¿Qué sucede si falla Photon?**  
Queda `null`. No hay identificador sin respuesta de Photon.

**7. ¿Qué sucede si falla Nominatim?**  
No aplica directamente. Este campo no depende de Nominatim. Si el usuario usa mapa o GPS (que usan Nominatim para reverse), el campo queda `null` por diseño.

**8. ¿Qué sucede si el usuario usa únicamente mapa?**  
Queda `null`. El mapa no produce un `provider_id`.

**9. ¿Qué sucede si usa únicamente GPS?**  
Queda `null`. El GPS no produce un `provider_id`.

**10. ¿Qué sucede si escribe una referencia manual?**  
No cambia. `origin_reference` es independiente.

---

### 3. `origin_provider` / `destination_provider`

**1. ¿Qué representa?**  
El método que fue usado para obtener las coordenadas confirmadas de la ubicación. Es el registro de la fuente de la ubicación, no del texto. Valores posibles:

| Valor | Descripción |
|---|---|
| `"photon"` | Coordenadas de una sugerencia de Photon |
| `"gps"` | Coordenadas del GPS del dispositivo |
| `"map"` | Coordenadas de un punto marcado manualmente en el mapa |
| `"geocode"` | Coordenadas de una búsqueda de texto via Nominatim (método legado) |
| `null` | Sin ubicación confirmada aún |

**2. ¿Quién puede modificarlo?**  
El sistema, automáticamente, en el momento en que el usuario activa un método de localización.

**3. ¿En qué momento se escribe?**  
- `"photon"` al seleccionar una sugerencia.
- `"gps"` al completar la localización por GPS.
- `"map"` al confirmar un punto en el mapa.
- `"geocode"` al geocodificar texto via búsqueda de texto (método legado activo con flag OFF).
- Se actualiza cada vez que el usuario cambia de método.

**4. ¿Puede volver a cambiar?**  
Sí, cuantas veces cambie el método durante la edición. Inmutable una vez creada la misión.

**5. ¿Qué sucede si el usuario modifica el texto?**  
**No cambia.** `provider` describe las coordenadas, no el texto del usuario. Su pregunta es "¿cómo llegaron estas coordenadas aquí?", no "¿qué está escribiendo el usuario ahora?". Mientras las coordenadas sean las mismas, su método de obtención sigue siendo el mismo. Nullear `provider` mientras las coordenadas se conservan produciría un registro que dice "hay coordenadas pero no sabemos cómo las obtuvimos", lo que es menos útil que "hay coordenadas de GPS, aunque el usuario esté re-escribiendo el texto". `provider` solo cambia cuando las coordenadas cambian (nuevo método de localización) o cuando las coordenadas se borran explícitamente.

**6. ¿Qué sucede si falla Photon?**  
Permanece en su valor anterior (o `null` si aún no había coords). El usuario puede cambiar a GPS o mapa, en cuyo caso se escribirá `"gps"` o `"map"`.

**7. ¿Qué sucede si falla Nominatim?**  
Si el usuario está usando GPS o mapa, el reverse falla pero las coords sí se asignan. `origin_provider` se escribe igualmente (`"gps"` o `"map"`). El fallo de Nominatim no impide registrar el método.

**8. ¿Qué sucede si el usuario usa únicamente mapa?**  
Se escribe `"map"`.

**9. ¿Qué sucede si usa únicamente GPS?**  
Se escribe `"gps"`.

**10. ¿Qué sucede si escribe una referencia manual?**  
No cambia. La referencia es independiente del método de localización.

---

### 4. `origin_confirmed` / `destination_confirmed`

**1. ¿Qué representa?**  
Una declaración explícita del usuario de que la ubicación mostrada es correcta y está lista para ser usada en la misión. Es `true` solo después de que el usuario ejecuta la acción "Confirmar ubicación". Es `false` en cualquier otro momento, incluyendo después de que el sistema asigna coordenadas automáticamente (GPS, mapa, Photon) pero antes de la confirmación explícita.

Este campo es el guardián del avance del wizard. El paso no puede avanzar mientras sea `false` o mientras no haya coordenadas válidas.

**2. ¿Quién puede modificarlo?**  
- El usuario lo pone en `true` al ejecutar "Confirmar ubicación".
- El sistema lo pone en `false` automáticamente cuando el usuario modifica el texto, cuando se borran las coordenadas, o cuando se selecciona un nuevo método sin haber confirmado.
- El backend no lo modifica después de la creación de la misión.

**3. ¿En qué momento se escribe?**  
- Se inicializa en `false`.
- Pasa a `true` únicamente en la acción explícita de "Confirmar ubicación", que es independiente del botón "Continuar" del wizard.
- Pasa a `false` automáticamente ante cualquier edición de texto o cambio de método.

**4. ¿Puede volver a cambiar?**  
Sí, puede alternar entre `true` y `false` mientras la misión no haya sido creada. Una vez creada la misión, el valor persiste tal como estaba al momento de la creación y es inmutable.

**5. ¿Qué sucede si el usuario modifica el texto?**  
Pasa a `false` inmediatamente. El avance queda bloqueado. Las coordenadas se conservan. El usuario debe volver a confirmar.

**6. ¿Qué sucede si falla Photon?**  
No hay sugerencia para seleccionar, por lo tanto `confirmed` permanece `false`. El usuario puede confirmar via GPS o mapa.

**7. ¿Qué sucede si falla Nominatim?**  
Las coordenadas se asignan de todas formas (GPS o mapa). El usuario puede confirmar la ubicación aunque `place_name` sea `null`. El fallo de Nominatim no bloquea la confirmación.

**8. ¿Qué sucede si el usuario usa únicamente mapa?**  
Al confirmar el punto en el mapa, el sistema asigna coordenadas y el campo pasa a esperar confirmación explícita del usuario (`false`). El usuario presiona "Confirmar ubicación" y pasa a `true`.

**9. ¿Qué sucede si usa únicamente GPS?**  
Igual que con el mapa: coordenadas asignadas automáticamente, `confirmed` permanece `false` hasta que el usuario confirme explícitamente.

**10. ¿Qué sucede si escribe una referencia manual?**  
No cambia. La referencia es un campo adicional que no altera el estado de confirmación.

---

### 5. `origin_reference` / `destination_reference`

**1. ¿Qué representa?**  
Una indicación operativa en lenguaje natural que el usuario escribe para ayudar al agente a encontrar el punto exacto. No es la dirección; es la referencia humana que complementa la dirección. Ejemplos: "Portón negro frente a la iglesia", "Pedir al guardia que avise", "Segunda entrada a la derecha del puente".

Este campo no sustituye ningún otro campo: no reemplaza `origin` / `destination` (el texto de ubicación), ni `origin_place_name` (el nombre del proveedor), ni las coordenadas, ni la confirmación geográfica. Es información adicional independiente.

**2. ¿Quién puede modificarlo?**  
El usuario, en cualquier momento mientras la misión no haya sido creada. Es el único campo de los 10 que el usuario edita directamente y de forma consciente.

**3. ¿En qué momento se escribe?**  
En cualquier momento durante la edición del paso de origen o destino, después de que el usuario escribe en el campo de referencia. No tiene un momento específico de activación — es un campo de texto libre siempre editable.

**4. ¿Puede volver a cambiar?**  
Sí, libremente mientras la misión no haya sido creada. El usuario puede editarlo, borrarlo o completarlo en cualquier momento. Inmutable una vez creada la misión.

**5. ¿Qué sucede si el usuario modifica el texto de ubicación?**  
`origin_reference` / `destination_reference` NO cambia. La referencia es independiente del texto de ubicación. Si el usuario cambia la dirección, su nota de referencia sigue siendo válida a menos que él mismo la borre.

**6. ¿Qué sucede si falla Photon?**  
El campo no se ve afectado. Es independiente del proveedor.

**7. ¿Qué sucede si falla Nominatim?**  
No se ve afectado. Es independiente del proveedor.

**8. ¿Qué sucede si el usuario usa únicamente mapa?**  
El campo permanece vacío (`null`) a menos que el usuario lo rellene voluntariamente.

**9. ¿Qué sucede si usa únicamente GPS?**  
Igual que con el mapa: permanece vacío a menos que el usuario lo rellene.

**10. ¿Qué sucede si escribe una referencia manual?**  
Exactamente esto: el usuario escribe texto libre en el campo de referencia. El campo se actualiza. No tiene efecto sobre ningún otro campo.

---

## Parte II — Tabla resumen

| Campo | Fuente de verdad | Momento de escritura | Mutable antes de misión | Inmutable tras misión | Observaciones |
|---|---|---|---|---|---|
| `origin_place_name` | Proveedor geocodificador (Photon o Nominatim) | Al recibir respuesta del proveedor (sugerencia, GPS, mapa, geocode) | Sí — sobrescrito con cada nuevo método | Sí | `null` si el proveedor falla o si las coordenadas se borran. **No se nullea por edición de texto** — describe las coordenadas, no el texto. |
| `origin_provider_id` | Photon exclusivamente | Al seleccionar sugerencia de Photon | Sí — `null` si cambia a otro método | Sí | Solo poblado con Photon. GPS, mapa y geocode dejan este campo `null`. |
| `origin_provider` | Sistema | Al activar cualquier método de localización | Sí — sobrescrito cuando cambian las coords | Sí | Valores: `"photon"`, `"gps"`, `"map"`, `"geocode"`, o `null`. **No se nullea por edición de texto** — describe las coordenadas, no el texto. |
| `origin_confirmed` | Usuario (acción explícita) | Al ejecutar "Confirmar ubicación" | Sí — `false` automático ante cualquier edición de texto | Sí | Guardián del avance del wizard. El wizard no avanza sin `true` y coordenadas válidas. |
| `origin_reference` | Usuario (texto libre) | En cualquier momento durante la edición | Sí — libremente | Sí | No sustituye coordenadas ni `place_name`. No afecta `confirmed`. No es obligatorio. |
| `destination_place_name` | Proveedor geocodificador (Photon o Nominatim) | Al recibir respuesta del proveedor | Sí — sobrescrito con cada nuevo método | Sí | Simétrico a `origin_place_name`. |
| `destination_provider_id` | Photon exclusivamente | Al seleccionar sugerencia de Photon | Sí — `null` si cambia a otro método | Sí | Simétrico a `origin_provider_id`. |
| `destination_provider` | Sistema | Al activar cualquier método de localización | Sí — sobrescrito | Sí | Simétrico a `origin_provider`. |
| `destination_confirmed` | Usuario (acción explícita) | Al ejecutar "Confirmar ubicación" | Sí — `false` automático ante edición de texto | Sí | Requerido para avanzar del paso "Destino" en Diseño v3. Simétrico a `origin_confirmed`. |
| `destination_reference` | Usuario (texto libre) | En cualquier momento durante la edición | Sí — libremente | Sí | Simétrico a `origin_reference`. No obligatorio. |

---

## Parte III — Máquina de estados de una ubicación

Se documenta para un campo de ubicación genérico (aplica idénticamente a origen y destino). Los valores de los 10 campos geo en cada estado se muestran al final del diagrama.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MÁQUINA DE ESTADOS DE UNA UBICACIÓN                      │
│                 (origin_* o destination_* — comportamiento idéntico)        │
└─────────────────────────────────────────────────────────────────────────────┘

╔══════════════╗
║    VACÍO     ║  place_name=null, provider_id=null, provider=null,
║              ║  confirmed=false, reference=null
╚══════╤═══════╝
       │
       │ usuario escribe texto
       ▼
╔══════════════╗
║  TEXTO_LIBRE ║  place_name=null, provider_id=null, provider=null,
║              ║  confirmed=false, reference=null|valor previo
╚══════╤═══════╝
       │
       │─────────────────────┬────────────────────┬──────────────────────────┐
       │                     │                    │                          │
       │ Photon devuelve     │ usuario activa     │ usuario activa           │
       │ sugerencias y       │ GPS                │ mapa                     │
       │ usuario selecciona  │                    │                          │
       ▼                     ▼                    ▼                          │
╔════════════╗        ╔════════════╗       ╔════════════╗                   │
║ GEOCODIFI- ║        ║ GEOCODIFI- ║       ║ GEOCODIFI- ║                   │
║ CADO       ║        ║ CADO       ║       ║ CADO       ║                   │
║ (PHOTON)   ║        ║ (GPS)      ║       ║ (MAPA)     ║                   │
║            ║        ║            ║       ║            ║                   │
║ lat/lng ✓  ║        ║ lat/lng ✓  ║       ║ lat/lng ✓  ║                   │
║ place_name ║        ║ place_name ║       ║ place_name ║                   │
║ =Photon    ║        ║ =Nominatim ║       ║ =Nominatim ║                   │
║ display    ║        ║ display o  ║       ║ display o  ║                   │
║            ║        ║ null si    ║       ║ null si    ║                   │
║ provider_id║        ║ falla      ║       ║ falla      ║                   │
║ ="photon:  ║        ║            ║       ║            ║                   │
║  N:123..."  ║        ║ provider_id║       ║ provider_id║                   │
║            ║        ║ =null      ║       ║ =null      ║                   │
║ provider=  ║        ║            ║       ║            ║                   │
║ "photon"   ║        ║ provider=  ║       ║ provider=  ║                   │
║            ║        ║ "gps"      ║       ║ "map"      ║                   │
║ confirmed= ║        ║            ║       ║            ║                   │
║ false      ║        ║ confirmed= ║       ║ confirmed= ║                   │
╚═════╤══════╝        ║ false      ║       ║ false      ║                   │
      │               ╚═════╤══════╝       ╚═════╤══════╝                   │
      │                     │                    │                          │
      └──────────────────┬──┘────────────────────┘                          │
                         │                                                   │
                         │ (cualquier método → estado GEOCODIFICADO)         │
                         ▼                                                   │
╔══════════════════════════════════════════════╗                             │
║         GEOCODIFICADO (estado unificado)     ║◄────────────────────────────┘
║                                              ║  ← también alcanzable desde
║  lat/lng: presentes y válidos                ║    TEXTO_LIBRE si el usuario
║  place_name: string o null (si falla rev.)   ║    geocodifica texto (legado)
║  provider_id: "photon:..." o null            ║    provider="geocode"
║  provider: "photon"|"gps"|"map"|"geocode"    ║
║  confirmed: false                            ║
║  reference: null o valor que el usuario haya ║
║             escrito independientemente       ║
╚══════════════╤═══════════════════════════════╝
               │
               │────────────────────────────────────────────────────────────┐
               │                                                            │
               │ usuario edita el texto de ubicación                       │
               │ (cualquier carácter en el campo)                          │
               │                                                            │
               │  provider_id → null  (entidad OSM ya no está seleccionada)│
               │  confirmed → false   (ya estaba false)                     │
               │  lat/lng → CONSERVADOS                                     │
               │  place_name → SIN CAMBIO (describe las coords, no el text)│
               │  provider → SIN CAMBIO   (origen de las coords conservado) │
               │  reference → SIN CAMBIO                                    │
               │                                                            │
               │  ► estado regresa a TEXTO_LIBRE (con coords conservadas)   │
               │    el avance del wizard queda bloqueado                    │
               │    el usuario debe volver a confirmar                      │
               │                                                            │
               │ usuario presiona "Confirmar ubicación"                     │
               ▼                                                            │
╔══════════════════════════════════════════════╗                            │
║           CONFIRMADO                         ║                            │
║                                              ║                            │
║  lat/lng: presentes y válidos                ║                            │
║  place_name: string o null                   ║                            │
║  provider_id: "photon:..." o null            ║                            │
║  provider: "photon"|"gps"|"map"|"geocode"    ║                            │
║  confirmed: TRUE  ← único estado con true    ║                            │
║  reference: null o valor del usuario         ║                            │
║                                              ║                            │
║  ► el wizard PUEDE avanzar desde aquí        ║                            │
╚══════════════╤═══════════════════════════════╝                            │
               │                                                            │
               │────────────────────────────────────────────────────────┐  │
               │                                                         │  │
               │ usuario edita el texto de ubicación                    │  │
               │                                                         │  │
               │  confirmed → false                                      │  │
               │  provider_id → null                                     │  │
               │  lat/lng → CONSERVADOS                                  │  │
               │  place_name → SIN CAMBIO                               │  │
               │  provider → SIN CAMBIO                                  │  │
               │  reference → SIN CAMBIO                                 │  │
               │                                                         │  │
               │  ► regresa a TEXTO_LIBRE (con coords conservadas)       │  │
               │    avance bloqueado — debe volver a confirmar           │  │
               │                                                         │  │
               │ usuario edita la referencia únicamente                  │  │
               │                                                         │  │
               │  confirmed → SIN CAMBIO (sigue true)                   │  │
               │  reference → nuevo valor                                │  │
               │  todos los demás campos → SIN CAMBIO                   │  │
               │                                                         │  │
               │  ► permanece en CONFIRMADO                             │  │
               │    el wizard puede seguir avanzando                    │  │
               │                                                         │  │
               │ creación de misión                                      │  │
               ▼                                                         │  │
╔══════════════════════════════════════════════╗                         │  │
║           CONGELADO (misión creada)          ║                         │  │
║                                              ║                         │  │
║  Todos los campos son inmutables.            ║                         │  │
║  El registro en public.missions refleja      ║                         │  │
║  el estado exacto en el momento del INSERT.  ║                         │  │
║                                              ║                         │  │
║  No hay transiciones posibles desde aquí.    ║                         │  │
╚══════════════════════════════════════════════╝                         │  │
                                                                         │  │
               ┌─────────────────────────────────────────────────────────┘  │
               │                                                             │
               └──────────────────── (desde CONFIRMADO, edición de texto) ──┘
                                      regresa a TEXTO_LIBRE
```

---

## Parte IV — Invariantes del contrato

Las siguientes reglas derivan de los estados y nunca pueden violarse, independientemente del método de entrada o del estado del proveedor:

**GEO-INV-01:** `confirmed = true` implica que `lat` y `lng` son no nulos y finitos. No puede haber una ubicación confirmada sin coordenadas.

**GEO-INV-02:** `provider_id` nunca es no nulo cuando `provider ≠ "photon"`. El `provider_id` es exclusivo de Photon.

**GEO-INV-03:** Modificar el texto de ubicación siempre pone `confirmed = false` y `provider_id = null`. Las coordenadas se conservan. `place_name` se conserva (sigue describiendo las coordenadas). `provider` se conserva (sigue registrando cómo se obtuvieron las coordenadas). La referencia no cambia. En síntesis: solo dos campos cambian al editar texto — `confirmed` y `provider_id`.

**GEO-INV-04:** `reference` es totalmente independiente de los otros 4 campos del grupo. Puede cambiar en cualquier estado sin afectar `confirmed`, `place_name`, `provider_id` ni `provider`.

**GEO-INV-05:** El wizard no puede avanzar del paso de ubicación si `confirmed = false` o si las coordenadas son nulas o no finitas (aplicable solo con `NEXT_PUBLIC_LOCATION_PICKER_ENABLED=true`).

**GEO-INV-06:** El fallo de cualquier proveedor (Photon o Nominatim) nunca bloquea la asignación de coordenadas. Las coordenadas son independientes del éxito del reverse geocoding.

**GEO-INV-07:** En `public.missions`, todos los campos geo son `null` cuando la misión fue creada sin LocationPicker activo. Ningún campo tiene valor por defecto; el valor `null` es el estado válido para misiones creadas con el flujo actual.

**GEO-INV-08:** Ningún campo geo contiene nombres de municipios, estados o países hardcodeados. El `place_name` viene siempre del proveedor, nunca de una cadena de texto fija en el código.

**GEO-INV-09:** `lat = 0` y `lng = 0` son coordenadas válidas. Ningún campo geo los usa como señal de "sin coordenadas". La ausencia de coordenadas se representa siempre como `null`.

**GEO-INV-10:** Una vez creada la misión, los 10 campos son inmutables. No existe ningún flujo que los actualice en misiones ya existentes.

---

## Parte V — Relación entre campos del draft y columnas de la misión

| Campo en `DraftRequestDetails` (draft) | Columna en `public.missions` | Notas |
|---|---|---|
| `origin` | `origin_text` | Campo preexistente — texto visible para el usuario |
| `originLat` | `origin_lat` | Campo preexistente |
| `originLng` | `origin_lng` | Campo preexistente |
| `originPlaceName` | `origin_place_name` | Nuevo — nombre del proveedor |
| `originProviderId` | `origin_provider_id` | Nuevo — ID compuesto Photon |
| `originProvider` | `origin_provider` | Nuevo — método usado |
| `originConfirmed` | `origin_confirmed` | Nuevo — confirmación explícita |
| `originReference` | `origin_reference` | Nuevo — nota operativa del usuario |
| `destination` | `destination_text` | Campo preexistente |
| `destinationLat` | `destination_lat` | Campo preexistente |
| `destinationLng` | `destination_lng` | Campo preexistente |
| `destinationPlaceName` | `destination_place_name` | Nuevo |
| `destinationProviderId` | `destination_provider_id` | Nuevo |
| `destinationProvider` | `destination_provider` | Nuevo |
| `destinationConfirmed` | `destination_confirmed` | Nuevo |
| `destinationReference` | `destination_reference` | Nuevo |

---

*Este documento es la fuente de verdad del comportamiento geo para las Etapas 2–8 del Diseño v3. Cualquier implementación que contradiga este contrato debe corregirse contra el contrato, no al revés. Solo Diego puede modificar este documento.*
