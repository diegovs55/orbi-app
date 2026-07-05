# ORBI — Mapa Emocional (v1.0)

**Documento rector · Versión 1.0**
**Fecha de origen: 2026-07-05**

Este documento define cómo debe sentirse el usuario en cada momento del recorrido con ORBI.

No describe pantallas. No describe componentes. Describe emociones, miedos, expectativas y las frases exactas que eliminan la incertidumbre en cada momento.

Cualquier texto visible al usuario debe poder evaluarse contra este mapa antes de publicarse.

---

## El criterio único

Cada interacción de ORBI se evalúa con una sola pregunta:

**¿Esta frase hace que el usuario sienta "ya no tengo que preocuparme por esto"?**

Si la respuesta es sí — el texto es correcto.
Si la respuesta es "tal vez" — el texto es insuficiente.
Si la respuesta es no — el texto está mal, independientemente de lo claro que sea técnicamente.

---

## La distinción más importante

Hay dos tipos de frases. Solo uno es aceptable en ORBI.

**Frases que prometen:** *"Vamos a ayudarte."* — El problema sigue siendo del usuario. ORBI apenas se compromete.

**Frases que asumen:** *"Ya lo tenemos."* — El problema ya es de ORBI. El usuario ya puede soltarlo.

ORBI nunca promete. ORBI asume.

La diferencia no es gramatical. Es la diferencia entre un sistema que responde y un asistente que ya se hizo cargo.

---

## Los 10 Momentos del Recorrido

---

### Momento 0 — Antes de abrir ORBI
*El usuario todavía no está en la app. Pero ya está en el problema.*

| | |
|---|---|
| **Miedo** | "Nadie puede ayudarme a esta hora." / "No sé a quién pedirle esto." |
| **Expectativa** | Que exista algo que pueda resolver esto sin depender de un favor. |
| **Información que necesita** | Ninguna todavía. Solo la certeza de que hay un lugar al que puede ir. |
| **Frase que elimina la incertidumbre** | No existe en la app. Se construye con la reputación de ORBI. Cuando alguien dice *"pide un ORBI"*, esa frase es la que reemplaza el miedo. |
| **Emoción al terminar** | Esperanza. La sensación de que puede haber una salida. |

**Implicación:** la pantalla de inicio no necesita explicar cómo funciona ORBI. Solo necesita recibir al usuario sin obstáculos. Cada elemento que se agrega es un segundo que el usuario no está resolviendo su problema.

---

### Momento 1 — Abre la app
*El usuario ve ORBI por primera vez o regresa después de un tiempo.*

| | |
|---|---|
| **Miedo** | "¿Entenderá lo que necesito?" / "¿Esto es complicado de usar?" |
| **Expectativa** | Que sea obvio qué hacer. Que no tenga que leer instrucciones. |
| **Información que necesita** | Una sola señal: *"Aquí puedes decir lo que necesitas."* |
| **Frase que elimina la incertidumbre** | No es una frase. Es la ausencia de todo lo que no hace falta. Una pregunta sola: **"¿Qué necesitas?"** |
| **Emoción al terminar** | Claridad. No tiene que pensar cómo funciona. Solo tiene que responder la pregunta. |

**Auditoría:**
- ✗ "Bienvenido a ORBI. La plataforma que conecta tu necesidad con agentes locales." → Explica el sistema antes de escuchar al usuario.
- ✗ "Selecciona el tipo de servicio que necesitas." → Le pide al usuario que clasifique. ORBI clasifica.
- ✓ Una pregunta. Un campo. Nada más.

---

### Momento 2 — Escribe su necesidad
*El usuario describe lo que necesita con sus propias palabras.*

| | |
|---|---|
| **Miedo** | "No voy a saber cómo explicarlo." / "¿Y si no entienden?" |
| **Expectativa** | Poder escribir como hablaría con una persona de confianza. |
| **Información que necesita** | Ninguna antes de escribir. Si algo falta, ORBI pregunta después — no antes. |
| **Frase que elimina la incertidumbre** | No hay frase. El campo en blanco, sin instrucciones, es el mensaje: *"Escribe como quieras."* |
| **Emoción al terminar** | Alivio anticipado. El usuario ya describió su situación. Ya soltó el problema. |

**Auditoría:**
- ✗ "Escribe tu solicitud de servicio aquí." → Convierte una necesidad humana en una solicitud burocrática.
- ✗ "Describe detalladamente tu requerimiento." → El usuario no tiene requerimientos. Tiene una situación.
- ✓ Placeholder suave si existe: *"Dime qué necesitas..."* — en minúscula, sin punto, como el inicio de una conversación.

---

### Momento 3 — ORBI interpreta y propone
*El usuario ve por primera vez la respuesta de ORBI a lo que escribió.*

Este es el momento más importante del flujo. Si ORBI lo resuelve bien aquí, el usuario ya confió. Si lo resuelve mal, el usuario siente que habló con una máquina.

| | |
|---|---|
| **Miedo** | "¿Entendieron bien?" / "¿Tengo que empezar de nuevo?" |
| **Expectativa** | Ver su necesidad reflejada en una propuesta que tiene sentido. No un menú. No categorías. Su situación resuelta. |
| **Información que necesita** | Qué va a pasar. No cómo funciona el sistema. Solo: qué va a ocurrir ahora mismo con su necesidad específica. |
| **Frase que elimina la incertidumbre** | Una que asuma el problema ya, en primera persona del plural, con el detalle exacto de lo que se entendió. |
| **Emoción al terminar** | Reconocimiento. La sensación de que alguien escuchó de verdad y ya está moviéndose. |

**Auditoría:**
- ✗ "Parece que detectamos un traslado." → El sistema analiza desde afuera. El usuario no es un dato.
- ✗ "Hemos clasificado tu solicitud como Traslado." → Lenguaje de ticket de soporte.
- ✗ "¿Deseas proceder con el servicio de traslado?" → El usuario ya dijo qué quiere.
- ✓ *"Entendí. Vamos a llevarte a casa. ¿Desde dónde te recogemos?"*

**La prueba del Momento 3:** Leer la propuesta en voz alta. Si suena como alguien que acaba de entender lo que necesita un amigo — está bien. Si suena como un sistema que confirmó una solicitud — está mal.

---

### Momento 4 — ORBI hace la única pregunta necesaria
*El usuario responde lo que ORBI genuinamente no puede saber.*

| | |
|---|---|
| **Miedo** | "¿Cuántas cosas más me van a preguntar?" / "¿Tengo que llenar un formulario?" |
| **Expectativa** | Que sea rápido. Que la pregunta tenga sentido. Que sea una sola. |
| **Información que necesita** | Saber que esa pregunta es la última antes de que ORBI se encargue. |
| **Frase que elimina la incertidumbre** | La pregunta misma, formulada de forma que se vea que ORBI ya tomó todo lo demás. |
| **Emoción al terminar** | Que las preguntas terminaron. Alivio funcional. |

**Auditoría:**
- ✗ "Por favor ingresa tu dirección de destino en el siguiente campo." → Instrucción de formulario.
- ✗ "Campo requerido: punto de llegada." → El usuario no está llenando un formulario.
- ✗ "Proporciona las coordenadas o nombre de la calle de destino." → El usuario no piensa en coordenadas.
- ✓ *"¿A dónde vas?"*

**La prueba de la pregunta:** ¿Puedes hacerle esa pregunta a alguien en persona sin que suene raro? Si sí — es una pregunta de ORBI. Si no — hay que reescribirla.

---

### Momento 5 — Confirmación antes de crear la misión
*El usuario ve el resumen de lo que va a pasar y decide si procede.*

| | |
|---|---|
| **Miedo** | "¿Hay letra chica?" / "¿Cuánto me va a cobrar realmente?" / "¿Es esto lo que pedí?" |
| **Expectativa** | Ver todo en una sola pantalla, con el costo claro, sin sorpresas. |
| **Información que necesita** | Qué se va a hacer. Cuánto cuesta. Cómo se paga. Nada más. |
| **Frase que elimina la incertidumbre** | El resumen mismo, tan claro que no necesita explicación adicional. |
| **Emoción al terminar** | Certeza. "Sé exactamente lo que estoy pidiendo y cuánto cuesta." |

**Auditoría:**
- ✗ "Resumen de solicitud: Servicio: Traslado | Origen: X | Destino: Y | Tarifa estimada: $55.00 MXN" → Una tabla de base de datos.
- ✗ "Al confirmar aceptas los términos y condiciones del servicio." → Genera desconfianza antes de confirmar.
- ✓ Prosa corta, una oración por dato: *"Te llevamos de [origen] a [destino]. Costo: $55. Pagas en efectivo al llegar."* → Línea separada: **"¿Listo?"**

**Lo que no aparece:** el ID de la misión, la categoría técnica, el nombre del agente (no hay uno todavía), el desglose de comisión, políticas de cancelación.

---

### Momento 6 — La misión fue creada. ORBI busca al agente.
*El usuario confirmó. Ahora espera. Este es el momento de mayor vulnerabilidad emocional.*

| | |
|---|---|
| **Miedo** | "¿Ya lo recibieron?" / "¿Alguien vio esto?" / "¿Y si no hay nadie disponible?" |
| **Expectativa** | Una señal inmediata y clara de que ORBI recibió el pedido y ya está trabajando. |
| **Información que necesita** | Dos cosas: que se recibió, y que ya está pasando algo. |
| **Frase que elimina la incertidumbre** | Una que declare que el problema ya es de ORBI. No que prometa resolverlo — que ya lo asumió. |
| **Emoción al terminar** | Tranquilidad activa. Paz porque alguien se encargó, no por ignorancia. |

**Auditoría:**
- ✗ "Solicitud enviada. Procesando asignación de agente." → El usuario no envió una solicitud a un sistema.
- ✗ "Buscando agente disponible en tu zona..." → Describe el proceso técnico, no el resultado.
- ✗ "Esperando confirmación." → Comunica que ORBI también está esperando.
- ✗ "Tu misión está en estado: por_tomar" → Lenguaje interno expuesto. Rompe la ilusión.
- ✓ *"Ya lo tenemos."* + *"Buscando quién te lleve."*

**La diferencia entre "ya lo tenemos" y "recibimos tu solicitud":** *"Recibimos tu solicitud"* es pasivo — el problema llegó y está ahí. *"Ya lo tenemos"* es activo — el problema ya es de ORBI. El usuario puede soltarlo.

---

### Momento 7 — Se encontró al agente
*El usuario recibe la confirmación de que hay una persona real en camino.*

| | |
|---|---|
| **Miedo** | "¿Quién es? ¿Es de confianza?" / "¿Cuándo llega?" |
| **Expectativa** | Saber que hay alguien real. Un nombre. Un tiempo. Nada más. |
| **Información que necesita** | El nombre del agente primero (humaniza). El tiempo después (concreta). |
| **Frase que elimina la incertidumbre** | Una que nombre a la persona y dé un tiempo concreto. |
| **Emoción al terminar** | Confianza concreta. Hay una persona. Se llama así. Llega en tanto tiempo. |

**Auditoría:**
- ✗ "Agente asignado. ID: AG-034. ETA: 8 min." → El agente no es un ID. El tiempo no es un ETA.
- ✗ "Un agente verificado ha aceptado tu solicitud." → "Verificado" implica que hay razón para desconfiar por default.
- ✗ "Tu agente está en camino." → ¿Cuál agente? ¿Cuándo llega?
- ✓ *"Carlos está en camino a recogerte. Llegará en aproximadamente 8 minutos."*

**Por qué el nombre importa más que cualquier otro dato:** las personas confían en personas, no en sistemas. "Carlos" genera más tranquilidad que "Agente disponible" aunque técnicamente digan lo mismo.

---

### Momento 8 — El agente llega y el traslado ocurre
*La app desaparece. La experiencia ocurre en el mundo real.*

| | |
|---|---|
| **Miedo** | "¿Sabe a dónde va?" / "¿Tengo que explicarle todo?" |
| **Expectativa** | Que el agente ya sepa. Que no haya que repetir lo que ya le dijeron a ORBI. |
| **Información que necesita** | Ninguna de la app. La conversación es entre el usuario y el agente. |
| **Frase que elimina la incertidumbre** | No hay frase. La experiencia real confirma la promesa. |
| **Emoción al terminar** | Naturalidad. Que funcionó exactamente como esperaba. No asombro — solo que funcionó. |

**Nota crítica:** la app no interrumpe el traslado. No hay botones que presionar. No hay confirmaciones de "subió al vehículo". No hay encuestas intermedias. El silencio durante el traslado no es ausencia — es respeto.

---

### Momento 9 — El traslado terminó
*El usuario llegó. Pagó. El agente se fue.*

| | |
|---|---|
| **Miedo** | "¿Quedó bien registrado?" / "¿Me van a cobrar algo más?" / "¿Hay algo que deba hacer?" |
| **Expectativa** | Una confirmación limpia. Que diga que todo está bien y que ya terminó. |
| **Información que necesita** | Qué se resolvió. Cuánto costó. Cómo se pagó. Que no queda nada pendiente. |
| **Frase que elimina la incertidumbre** | Un cierre que declare que la promesa se cumplió. |
| **Emoción al terminar** | Gratitud tranquila. La satisfacción de un problema que desapareció. |

**Auditoría:**
- ✗ "Transacción completada. Gracias por usar ORBI." → Una transacción bancaria. El usuario llegó a su casa.
- ✗ "La misión ha sido marcada como cumplida." → Lenguaje de base de datos.
- ✗ "Califica tu experiencia: ⭐⭐⭐⭐⭐" → Le devuelve trabajo al usuario en el momento en que acaba de resolver su problema.
- ✗ "¡Gracias por confiar en nosotros! Esperamos verte pronto." → Corporativo y vacío.
- ✓ *"Llegaste bien."* + *"Traslado completado. $55 en efectivo."* + *"Gracias por confiar en ORBI."*

**Por qué "Llegaste bien" y no "Servicio completado":** "Servicio completado" describe lo que hizo el sistema. "Llegaste bien" describe lo que le pasó al usuario. ORBI habla de la persona, no de sí mismo.

---

### Momento 10 — El usuario regresa
*Días o semanas después. La segunda oportunidad de generar lealtad real.*

| | |
|---|---|
| **Miedo** | "¿Me van a reconocer?" / "¿Tengo que empezar de cero?" |
| **Expectativa** | Que ORBI recuerde. Que no sea necesario presentarse. |
| **Información que necesita** | Un reconocimiento. Su nombre. Que ORBI sabe quién es. |
| **Frase que elimina la incertidumbre** | La más simple posible: su nombre, y la misma pregunta de siempre. |
| **Emoción al terminar** | Pertenencia. Este lugar la conoce. No es una visitante — es alguien que ya estuvo aquí. |

**Auditoría:**
- ✗ "Bienvenido de regreso. Por favor inicia sesión para continuar." → Burocracia antes del saludo.
- ✗ "Tienes 1 pedido reciente. ¿Deseas verlo?" → Lenguaje de panel administrativo.
- ✗ "Hola. ¿En qué podemos ayudarte hoy?" → Genérico. Podría ser cualquier sistema.
- ✓ *"Hola, Valeria."* + *"¿Qué necesitas?"*

---

## La Auditoría Final — Frases prohibidas en ORBI

| Frase a eliminar | Por qué | Reemplazo |
|---|---|---|
| "Misión creada" | Lenguaje de base de datos | "Ya lo tenemos" |
| "Solicitud enviada" | Burocrático | "Ya lo tenemos" |
| "Procesando..." | El sistema habla de sí mismo | "Buscando quién te ayude" |
| "Estado actualizado" | El usuario no gestiona estados | No se dice |
| "Esperando negocio" | Incomprensible y mecánico | "En unos momentos alguien más lo confirma" |
| "Agente asignado" | El agente no se asigna — viene | "[Nombre] está en camino" |
| "Servicio completado" | Describe el sistema | "Llegaste bien" / "Tu encargo está resuelto" |
| "Transacción completada" | Bancario | "Todo listo. $[monto] en efectivo" |
| "No encontramos resultados" | Callejón sin salida | "No estoy seguro de haber entendido. Cuéntame más." |
| "Error al procesar" | Técnico y aterrador | "Algo salió mal. Aquí está lo que hacemos." |
| "¿Estás seguro de cancelar?" | Pasivo-agresivo | "¿Cancelamos? Ya no habrá cargo." |
| "Tu solicitud fue registrada" | El usuario no registra solicitudes | "Ya lo tenemos" |
| "ID de misión: #4821" | El usuario no necesita IDs | No se muestra |
| "Califica tu experiencia" | Le devuelve trabajo al usuario en el cierre | No se pide en el momento del cierre |
| "Lo antes posible" | Ambiguo, genera ansiedad | Tiempo estimado concreto o "en unos minutos" |
| "por_tomar / aceptada / en_mision" | Estados técnicos internos | Jamás visible al usuario |
| "¿En qué podemos ayudarte?" | Genérico, corporativo | "¿Qué necesitas?" |
| "Con mucho gusto" | Servil | No se usa |

---

## La Prueba Final de Cualquier Texto de ORBI

Antes de publicar cualquier frase, hacerse estas tres preguntas:

**1. ¿Responde una duda emocional del usuario, o describe un estado del sistema?**
Si describe el sistema → reescribir.

**2. ¿Suena a alguien que ya asumió el problema, o a alguien que promete resolverlo?**
Si promete → reescribir. ORBI asume, no promete.

**3. ¿Al leer esta frase, el usuario puede pensar "ya no tengo que preocuparme por esto"?**
Si no → reescribir.

Las tres deben responder bien. Si una falla, el texto no está listo.

---

*ORBI — Mapa Emocional v1.0*
*Zumpahuacán, 2026*
*Este documento se actualiza cuando encontramos un momento emocional que no habíamos mapeado.*
*Nunca se actualiza para justificar frases que ya existen en el sistema.*
