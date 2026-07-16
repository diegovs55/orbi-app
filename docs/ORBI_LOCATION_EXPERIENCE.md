# ORBI — Experiencia de ubicación
### Un documento de sensaciones, no de estados

---

## 1. ¿Qué piensa el usuario?

El usuario no piensa en geocodificación.
El usuario piensa en una sola cosa:

> *¿Ya sabe dónde estoy?*

Ese es el hilo conductor de toda la experiencia. Cada momento que el campo no responde esa pregunta, existe incertidumbre. Cada momento que sí la responde, hay calma.

El monólogo interno completo:

---

**Toca el campo por primera vez**

> *"A ver si funciona."*

No hay expectativa alta ni baja. Solo apertura. El usuario viene de aplicaciones que a veces sí y a veces no. Está en modo prueba.

---

**Empieza a escribir**

> *"Espero que lo encuentre."*

Hay una duda silenciosa: ¿sabe esta aplicación cómo le llamamos aquí? No "Av. Insurgentes". "El Oxxo de la esquina de la presidencia." El miedo es que ORBI piense en ciudades, no en lugares.

---

**Ve aparecer sugerencias**

> *"Ah, sí sabe."*

Hay alivio. No euforia. Alivio. La aplicación entendió el idioma del lugar.

---

**Ve SU lugar en la lista**

> *"Ese es."*

No es un pensamiento. Es un impulso. El dedo ya va hacia ahí antes de que el cerebro termine de leer.

---

**Toca la sugerencia**

> *"Listo."*

Confianza. El campo ya no es una pregunta. Es una respuesta.

---

**Avanza al siguiente paso**

> *"Esto sí funciona."*

No lo va a decir en voz alta. Pero va a volver.

---

## 2. ¿Qué emoción queremos provocar?

No queremos impresionar. Queremos tranquilizar.

| Momento | Emoción que buscamos |
|---|---|
| Campo vacío | Invitación. Como cuando alguien te abre la puerta y espera. |
| Escribiendo | Esperanza. La sensación de que ya casi. |
| Sugerencias aparecen | Reconocimiento. "Aquí me conocen." |
| El lugar correcto aparece | Alivio. La tensión se va. |
| Ubicación confirmada | Confianza. Puedo soltar el control. |
| GPS ubica al usuario | Sorpresa agradable. Como cuando alguien ya sabe lo que necesitas. |
| No encuentra el lugar | Incomodidad leve, no frustración. Hay salida. |
| GPS no funciona | Decepción breve. Pero la puerta sigue abierta. |

La emoción que nunca debe aparecer: **confusión**.

Si el usuario no sabe qué hacer en los próximos dos segundos, fallamos.

---

## 3. ¿Cuándo desaparece la incertidumbre?

Este es el momento más importante de todo el flujo.

La incertidumbre desaparece exactamente cuando el usuario ve su lugar nombrado de una manera que él reconoce.

No cuando el campo tiene coordenadas.
No cuando el sistema dice "ubicación confirmada".
No cuando aparece un mapa con un pin.

**Cuando lee su lugar y piensa: "ese es".**

Ese instante no puede depender de que el usuario haga algo más. Debe ser inmediato, visual, inequívoco. El nombre debe estar en el lugar más visible del campo. No debajo. No al lado. Ahí donde el ojo cae primero.

Todo lo que ocurre antes de ese momento es fricción necesaria.
Todo lo que ocurre después de ese momento es fricción innecesaria.

---

## 4. ¿Cuándo debe hablar ORBI?

**ORBI habla cuando el silencio generaría ansiedad.**

Solo en esos momentos.

### ORBI habla cuando:

- El sistema está haciendo algo invisible que el usuario no puede ver terminar.
  → "Buscando..."
  → "Obteniendo tu ubicación..."

- El sistema no pudo hacer lo que el usuario esperaba.
  → "No encontramos ese lugar."

- El usuario necesita hacer algo para avanzar, pero no es obvio qué.
  → "Prueba otra forma de escribirlo, o usa el mapa."

### ORBI calla cuando:

- Las sugerencias ya son visibles. El usuario puede leer. No necesita texto adicional.
- La ubicación ya está en el campo. El usuario puede verla. No necesita un badge que diga "confirmado".
- El GPS acaba de encontrar la ubicación. El nombre en el campo es la confirmación.

**La aplicación que explica todo desconfía del usuario.**
**La aplicación que tranquiliza confía en que el usuario entiende lo que ve.**

---

## 5. ¿Qué información sobra?

Todo lo que no responda la pregunta **"¿ya sabe dónde estoy?"** sobra.

### Sobra con certeza:

- El nombre del proveedor. El usuario no sabe ni le importa si es Photon o Nominatim.
- La distancia en metros a cada sugerencia. No es lo que busca.
- Las coordenadas numéricas. Son para máquinas.
- El tipo de lugar (restaurant, calle, colonia). Si el nombre es correcto, el tipo no agrega nada.
- Cualquier badge de "verificado", "confirmado", "geocodificado". Si el nombre está en el campo, ya está confirmado. No necesita un sello.
- El hint de "300ms debounce". Nunca fue información del usuario.
- Los errores técnicos. "Error de red" no le dice al usuario qué hacer.

### Lo que debe quedar:

El nombre del lugar.
Y la posibilidad de cambiarlo si está mal.

Eso es todo.

---

## 6. Microcopy de ORBI

La regla es una: hablar como habla alguien que conoce el lugar.

---

**Placeholder del campo vacío:**

> *¿Desde dónde te recogemos?*

No: "Ingrese su dirección de origen."

---

**Mientras busca (cargando sugerencias):**

> *Buscando...*

No: "Geocodificando query."

Solo "Buscando." Una palabra. No hay nada más que decir.

---

**No encontró el lugar:**

> *No encontramos ese lugar.*
> *Prueba otra forma de escribirlo, o usa el mapa.*

No: "No se encontraron resultados para su búsqueda."

La diferencia: el primero abre una puerta. El segundo cierra una.

---

**GPS buscando ubicación:**

> *Buscando tu ubicación...*

No: "Obteniendo coordenadas GPS del dispositivo."

---

**GPS no funcionó (permiso negado o timeout):**

> *No pudimos ubicarte.*
> *Escribe la dirección o abre el mapa.*

No: "Error al acceder al GPS. Verifique los permisos de ubicación en la configuración del dispositivo."

El primero es una conversación. El segundo es un manual de errores.

---

**Servicio de búsqueda no disponible:**

> *La búsqueda no está disponible ahora.*
> *Usa el GPS o el mapa para continuar.*

No queremos que el usuario sienta que algo se rompió. Queremos que sienta que hay otro camino.

---

**Ubicación encontrada por GPS (el nombre ya está en el campo):**

*ORBI no dice nada.*

El nombre en el campo es la comunicación. Cualquier texto adicional sería ruido.

---

## 7. Storyboard: desde el toque hasta el "listo"

---

**Escena 1 — El campo en blanco**

El usuario ve un campo con un ícono de pin y el texto: *¿Desde dónde te recogemos?*

Hay dos botones pequeños al lado. El usuario sabe que uno es GPS y otro es el mapa. No necesita leer las etiquetas. Lo sabe.

El campo no pide. Invita.

---

**Escena 2 — El usuario empieza a escribir**

Escribe: "farma"

El campo acepta la escritura sin interferir. No hay validación inmediata. No hay advertencias. Solo el texto que el usuario escribe.

Debajo, muy discreto: *Buscando...*

El usuario siente que la aplicación está trabajando. No le molesta esperar porque sabe que algo está pasando.

---

**Escena 3 — Aparecen las sugerencias**

Sin transición brusca. Las sugerencias aparecen debajo del campo.

Cada sugerencia tiene un nombre principal y una dirección secundaria más pequeña, en gris.

El usuario escanea la lista. No la lee completa. Busca la que reconoce.

La lista no tiene íconos decorativos. No tiene distancias. No tiene categorías. Solo nombres.

---

**Escena 4 — El usuario ve su lugar**

"Farmacia San Pedro — Av. Juárez 12, Zumpahuacán"

El dedo ya se mueve.

---

**Escena 5 — El usuario toca la sugerencia**

La lista desaparece.

El nombre "Farmacia San Pedro" queda en el campo.

No aparece un badge verde. No dice "confirmado". No hace nada más.

El nombre en el campo es la confirmación. No necesita decoración.

---

**Escena 6 — El usuario mira el campo**

Lee: *Farmacia San Pedro*

Piensa: *"Sí, ese era."*

Toca "Siguiente" o "Confirmar pedido" o lo que siga.

La experiencia de ubicación terminó.

---

**Escena alternativa A — GPS**

El usuario toca el botón de GPS.

El botón muestra un spinner discreto. Nada más cambia en la pantalla.

El usuario espera. Sabe que el teléfono está pensando.

El spinner desaparece. El nombre de la calle aparece en el campo.

El usuario lo lee. Si es donde está, avanza. Si no es exacto, toca el mapa para ajustar.

No hay confirmación extra. El nombre es la confirmación.

---

**Escena alternativa B — No encontró el lugar**

El usuario escribió "calle del pozo 14" y no apareció nada.

El campo muestra: *No encontramos ese lugar. Prueba otra forma de escribirlo, o usa el mapa.*

El usuario no siente que falló. Siente que necesita otro camino.

Prueba "pozo" o abre el mapa.

---

## 8. Si Apple diseñara esta experiencia, ¿qué quitaría?

Apple quitaría **el botón de confirmar**.

Porque en el mundo de Apple, seleccionar ya es confirmar.

El momento en que el usuario toca una sugerencia, la experiencia terminó. No hay segundo paso. No hay banner ámbar. No hay botón adicional.

El campo muestra el nombre. El flujo avanza.

Apple entendió algo que la mayoría ignora: **pedir confirmación de una decisión que el usuario acaba de tomar conscientemente es dudar de él**.

El usuario eligió "Farmacia San Pedro" de una lista. Eso fue un acto deliberado. Pedirle que vuelva a confirmar no agrega seguridad. Agrega fricción. Y la fricción, acumulada, se convierte en abandono.

---

La única excepción donde el paso de confirmación tiene sentido es cuando el sistema eligió por el usuario, no el usuario por sí mismo. El GPS elige. El mapa elige. El usuario aún no ha expresado su acuerdo. Ahí sí tiene sentido preguntar una vez, brevemente.

Pero incluso ahí, Apple lo haría diferente: no un botón de "Confirmar". Un gesto. Un toque en el nombre para decir "sí, ese".

---

**El principio detrás de todo esto:**

La interfaz que más tranquiliza no es la que más explica.
Es la que menos necesita explicar porque hizo bien su trabajo desde el principio.

---

---

## Principios permanentes de diseño de ORBI

Estos principios no son sugerencias. Son invariantes del producto. Ningún PR puede romperlos sin revisión explícita de este documento.

---

### ORBI-UX-01 — Confirmación solo cuando la decisión fue del sistema

**Enunciado:**
ORBI nunca solicita una confirmación adicional cuando la decisión ya fue tomada explícitamente por el usuario.

La confirmación solo aparece cuando la propuesta fue generada por ORBI: GPS, ubicación detectada automáticamente, punto colocado inicialmente en el mapa, u otros casos en que el sistema eligió antes que el usuario.

**Por qué existe esta regla:**
Pedir confirmación de una elección consciente del usuario es dudar de él. Cuando el usuario toca una sugerencia de una lista, ese gesto ya fue deliberado. El paso adicional no agrega seguridad: agrega fricción. La fricción acumulada se convierte en abandono.

**Cuándo aplica la confirmación (el sistema eligió):**
- GPS encontró una posición y la colocó en el campo
- El mapa colocó un pin inicial antes de que el usuario lo moviera
- Cualquier mecanismo automático que proponga una ubicación sin acción directa del usuario

**Cuándo no aplica (el usuario eligió):**
- El usuario seleccionó una sugerencia de la lista de búsqueda
- El usuario movió el pin en el mapa y tocó "Confirmar pin" dentro del mapa
- El usuario escribió y editó el texto del campo manualmente hasta quedar satisfecho

**Consecuencia en el flujo:**
Sugerencia seleccionada → `CONFIRMADO` directo. Sin escala en estado intermedio.
GPS o mapa automático → `GEOCODIFICADO` (requiere un toque de confirmación) → `CONFIRMADO`.

---

*ORBI_LOCATION_EXPERIENCE.md — v1.1 — 2026-07-10*
