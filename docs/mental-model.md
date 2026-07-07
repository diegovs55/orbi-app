# ORBI — Modelo Mental del Producto

**Documento rector · Versión 1.0**
**Fecha de origen: 2026-07-05**

Este documento responde una pregunta distinta a la del Product Book.

El Product Book responde: *¿Por qué existe ORBI?*

Este documento responde: *¿Cómo debe pensar ORBI?*

Si el Product Book es la filosofía, este documento es la psicología.
Juntos definen qué construimos y cómo lo construimos.

Cualquier decisión de experiencia — pantalla, flujo, texto, pregunta, silencio — debe poder justificarse desde aquí.

---

## 1. ¿Qué problema cree tener el usuario?

El usuario nunca llega a ORBI pensando en "hacer un pedido".

Llega con una tensión. Y esa tensión tiene una forma concreta en su cabeza:

**"Tengo algo pendiente que no puedo resolver solo ahorita."**

La palabra clave es *ahorita*. No es un problema abstracto. Es una fricción presente, específica, con peso emocional. Y dependiendo del momento, esa fricción se siente diferente:

**Cuando es urgencia:**
> "Necesito esto ya y no sé cómo lograrlo."

El usuario no está pensando en opciones. Está pensando en el resultado. Quiere que el problema desaparezca, no que alguien le explique cómo funciona el proceso.

**Cuando es dependencia:**
> "No puedo hacer esto sin ayuda de alguien."

Hay algo de vulnerabilidad aquí. El usuario sabe que necesita a otra persona. Lo que no quiere es sentir que está molestando, que está pidiendo un favor, que depende de la disponibilidad de alguien más.

**Cuando es tiempo:**
> "No tengo tiempo de hacer esto yo mismo."

No es pereza. Es cálculo. Hay cosas más importantes que atender. ORBI existe exactamente para ese cálculo: esto lo puede resolver alguien más mientras yo me dedico a lo que importa.

**Cuando es distancia:**
> "Necesito algo que está donde yo no estoy."

El usuario está en un lugar. Lo que necesita está en otro. Esa distancia es el problema. No el producto, no el servicio — la brecha física entre donde está y lo que necesita.

**Cuando es incertidumbre:**
> "Tengo un problema pero no sé exactamente cómo resolverlo."

Esta es la más poderosa y la más frecuente. El usuario no sabe si lo que necesita es un mandado, una compra, un traslado o algo más. Solo sabe que tiene una necesidad sin resolver. ORBI debe poder recibir esa necesidad en cualquier forma que llegue.

---

**La conclusión central:**

> El usuario nunca llega con una categoría. Llega con una situación.

La primera pregunta que ORBI debe responder — antes de mostrar cualquier pantalla — es:

*¿Esta persona puede dejar de preocuparse por esto?*

Si la respuesta es sí, todo lo demás es logística.

---

## 2. ¿Qué espera que haga ORBI?

Si el usuario pudiera describir al asistente perfecto, diría algo así:

> "Le digo lo que necesito. Él lo entiende. Lo resuelve. Me avisa cuando está listo."

Cuatro verbos. Cuatro promesas.

**Entender** — no solo escuchar.
El asistente perfecto no necesita que le expliques por qué. No te pregunta si es urgente o no. No te pide que clasifiques tu necesidad. Entiende la intención detrás de las palabras.

**Decidir** — no preguntar lo que puede inferir.
El asistente perfecto toma decisiones menores sin consultarte. Te pregunta únicamente lo que genuinamente no puede saber.

**Resolver** — sin que tengas que supervisar.
El asistente perfecto no te manda actualizaciones constantes para decirte que está "procesando". Te avisa en los momentos que importan.

**Avisar** — en el momento justo.
No antes (genera ruido). No después (genera angustia). El aviso perfecto llega exactamente cuando el usuario lo necesita para tomar una decisión o simplemente para saber que puede dejar de pensar en eso.

---

La expectativa del usuario no es tecnológica. Es humana.

Quiere la sensación de tener a alguien de confianza que se encarga de sus cosas.

---

## 3. ¿Qué información nunca debería pedir ORBI?

Cada pregunta que ORBI hace tiene un costo de confianza.

Cada vez que ORBI pregunta algo que debería saber — o que debería poder deducir — el usuario piensa: *"esto no es tan inteligente como creía"*.

**La ilusión de inteligencia se destruye con preguntas innecesarias.**

**ORBI nunca debería preguntar:**

- **La categoría del servicio.** Si el usuario dice lo que necesita, ORBI deduce el tipo. Pedirle que elija entre seis categorías es pedirle que piense como el sistema.

- **El tipo de urgencia**, si ya está implícito. "Necesito un café ahorita" no requiere la pregunta "¿cuándo lo necesitas?".

- **Datos que ya tiene.** Si el usuario tiene sesión o historial, no da nombre ni teléfono.

- **Confirmaciones redundantes.** La confirmación es para acciones irreversibles — no para cada decisión menor.

- **El agente.** El usuario no contrata a un agente. Resuelve un problema. La asignación del agente es una decisión operativa de ORBI.

- **La ruta o el camino.** El usuario declara origen y destino. ORBI calcula el resto.

- **El desglose financiero detallado al pedir.** "Costo del servicio: $85" es suficiente. El desglose es información administrativa, no experiencia.

**La regla:**

> Si ORBI puede deducirlo, inferirlo, o ya lo sabe — no pregunta.
> Solo pregunta lo que el usuario es el único que puede responder.

---

## 4. ¿Qué decisiones debe tomar ORBI automáticamente?

ORBI es el experto en el proceso. El usuario es el experto en su necesidad.

Cada decisión que el usuario toma sobre el proceso es una decisión que ORBI falló en tomar primero.

**Sobre la intención:**
- Detectar el tipo de misión desde texto libre
- Elegir el flujo correcto (catálogo vs. misión directa)
- Proponer el negocio más relevante cuando aplica

**Sobre la operación:**
- Asignar el agente sin consultar al usuario
- Calcular el costo sin que el usuario intervenga
- Definir el punto de origen cuando hay catálogo
- Asumir "ahora" cuando no se especifica horario

**Sobre el usuario:**
- Pre-llenar nombre, teléfono y dirección habitual
- Proponer "mi casa" o "mi trabajo" si están guardados
- Recordar el método de pago preferido
- Identificar si hay una misión activa antes de crear una nueva

**Sobre la comunicación:**
- Decidir cuándo notificar (solo en momentos relevantes)
- No notificar cambios de estado técnicos que el usuario no necesita saber
- Comunicar proactivamente si hay demora o problema

**El principio:**

> El usuario aprueba. ORBI propone.
> El usuario nunca debe diseñar el proceso. Solo debe reconocer que la solución es correcta.

---

## 5. ¿Qué debe recordar ORBI de una persona?

La memoria de ORBI no es una base de datos. Es una relación.

**Desde dónde suele pedir.**
No la coordenada GPS. El lugar que el usuario llama "mi casa", "el trabajo", "la escuela de mis hijos". La primera vez el usuario escribe la dirección. La décima vez ORBI propone: *"¿Lo enviamos a tu casa como siempre?"*

**A quién suele pedir para.**
Si el destinatario siempre es el mismo, ORBI lo asume. Si varía, pregunta.

**Qué negocios frecuenta.**
No como historial de transacciones — como preferencias implícitas. ORBI propone el negocio frecuentado sin que el usuario tenga que configurar nada.

**En qué horarios suele necesitar ayuda.**
Para anticipar disponibilidad y comunicarlo proactivamente, no para automatizar.

**Cómo prefiere pagar.**
Si siempre paga en efectivo, ORBI asume efectivo. La pregunta aparece solo cuando hay ambigüedad real.

**Qué tono necesita.**
Hay usuarios que quieren velocidad. Hay quienes quieren confirmación. ORBI aprende esto del comportamiento, no de una encuesta.

**Lo que quedó pendiente.**
Si hubo un problema, ORBI lo recuerda sin hacerlo incómodo — como contexto que mejora la próxima interacción.

---

## 6. ¿Qué debe sentir el usuario en cada momento?

**Antes — cuando todavía tiene el problema:**

*Reconocimiento.*

La primera pantalla debe decirle sin palabras complicadas: "Entiendo lo que necesitas. Estás en el lugar correcto." No alivio todavía — la certeza de que llegó al lugar que puede resolver su problema.

**Mientras describe su necesidad:**

*Control sin esfuerzo.*

El usuario debe sentir que está siendo escuchado. Que lo que escribe tiene sentido para ORBI. Que no tiene que traducirse al lenguaje del sistema.

La emoción es: *"saben de qué hablo"*. Si el usuario tiene que detenerse a pensar cómo describir algo para que ORBI lo entienda — ese es el momento donde la confianza se erosiona.

**Mientras ORBI trabaja:**

*Tranquilidad activa.*

No es indiferencia. Es la sensación específica de saber que algo está siendo resuelto sin que tengas que supervisarlo. Como cuando dejas el coche en el taller con alguien de confianza. No estás pendiente. No estás ansioso. Sabes que cuando llegues, estará listo.

**Después — cuando el problema fue resuelto:**

*Gratitud sin drama.*

No euforia. Simplemente la satisfacción tranquila de un problema que desapareció. En ese momento hay una ventana corta donde el usuario está disponible emocionalmente para reforzar la relación con ORBI. Una confirmación clara, un resumen limpio, y una invitación suave a volver.

**Cuando vuelve — días o semanas después:**

*Reconocimiento mutuo.*

La emoción que ORBI debe generar cuando alguien regresa es la misma que sientes cuando entras a tu tienda de siempre y el empleado ya sabe lo que vas a pedir.

*"Saben quién soy. No tengo que explicarme."*

Esa emoción — sentirse recordado — es la base de la lealtad.

---

## 7. ¿Qué significa realmente "resolver con ORBI"?

*"Resolver con ORBI"* no significa hacer un pedido.
No significa rastrear una entrega.
No significa elegir un agente o confirmar una dirección.

**"Resolver con ORBI" significa:**

> Tener un problema y saber que ya no tienes que cargarlo tú.

Esa transferencia — del peso del problema del usuario hacia ORBI — es el acto central del producto. Todo lo demás es mecánica.

La frase que debe guiar cada decisión de producto es:

**"¿Este cambio hace que el usuario pueda dejar de preocuparse más rápido?"**

Si la respuesta es sí, el cambio tiene sentido.
Si la respuesta es "mejora la experiencia" sin responder esa pregunta — el cambio puede esperar.

---

## 8. Los 5 Escenarios — Comportamiento esperado de ORBI

### Escenario 1 — "Necesito un café"

- **ORBI interpreta:** Compra de catálogo. Alguien que consiga y traiga.
- **ORBI propone:** "Encontramos café en [Negocio]. ¿Lo pedimos?"
- **Pregunta necesaria:** Solo el destino (si no lo tiene).
- **ORBI decide automáticamente:** negocio, agente, costo, método de pago.
- **El usuario siente:** "Ya saben de qué hablo. No tengo que explicar nada."

### Escenario 2 — "Necesito que me lleven a mi casa"

- **ORBI interpreta:** Traslado de persona. Origen = aquí. Destino = casa.
- **ORBI propone:** "Buscamos quién te lleve. ¿Desde dónde te recogemos?"
- **Preguntas necesarias:** origen (si no lo tiene), destino (si "mi casa" no está guardada).
- **ORBI decide automáticamente:** horario (ahora), agente con vehículo, costo.
- **El usuario siente:** "Entendieron que necesito moverme. Ya están buscando a alguien."

### Escenario 3 — "Necesito que paguen un recibo"

- **ORBI interpreta:** Mandado de pago con componente financiero. Confianza alta requerida.
- **ORBI propone:** "Podemos hacer ese pago por ti. ¿Qué recibo necesitas pagar?"
- **Preguntas necesarias:** tipo de recibo, referencia, monto, destino del comprobante.
- **ORBI decide automáticamente:** punto de pago local, agente con nivel de confianza alto.
- **El usuario siente:** "[Nombre del agente] hará el pago y te enviaremos foto del comprobante."

### Escenario 4 — "Necesito recoger un paquete"

- **ORBI interpreta:** Recolección. Objeto en un lugar. Usuario no puede ir.
- **ORBI propone:** "Mandamos a alguien por tu paquete. ¿Dónde está y a dónde lo llevamos?"
- **Preguntas necesarias:** origen del paquete, destino, instrucciones especiales si las hay.
- **ORBI decide automáticamente:** agente más cercano al origen, costo, destino = usuario si no se especifica otro.
- **El usuario siente:** "No tengo que ir yo."

### Escenario 5 — "Necesito ayuda"

- **ORBI interpreta:** Ambigüedad. Inicio de conversación, no error del sistema.
- **ORBI responde:** "Cuéntame qué necesitas." — campo abierto, sin categorías.
- **ORBI propone después de escuchar:** "Parece que necesitas [X]. ¿Lo pedimos así?"
- **Si sigue sin entender:** "Vamos a conectarte con alguien de ORBI directamente." → WhatsApp.
- **El usuario siente:** "Aquí puedo explicar con mis propias palabras. No voy a confundirlos."

---

## 9. Flujo ideal de experiencia

```
Usuario escribe cualquier cosa
         ↓
ORBI interpreta la intención
(no espera a que el usuario clasifique)
         ↓
ORBI propone una solución concreta
(no un menú de opciones)
         ↓
Usuario confirma o corrige
(solo lo que está mal, no todo de nuevo)
         ↓
ORBI pide únicamente lo que no puede saber
(máximo 2 preguntas antes de crear la misión)
         ↓
Misión creada
         ↓
ORBI muestra: "Ya nos encargamos"
(tranquilidad, no estado técnico)
         ↓
ORBI comunica solo cuando hay algo relevante para el usuario
         ↓
Misión completada
         ↓
ORBI confirma el cierre con resumen limpio
         ↓
Invitación suave a volver
```

---

## 10. Pantallas mínimas necesarias

| # | Pantalla | Emoción que resuelve |
|---|---|---|
| 1 | **Entrada** — "¿Qué necesitas?" | "¿ORBI puede con esto?" |
| 2 | **Propuesta** — ORBI interpreta y ofrece solución | "¿Entendieron?" |
| 3 | **Preguntas necesarias** — máximo 2, una a la vez | "¿Necesitan más de mí?" |
| 4 | **Tranquilidad** — "Ya nos encargamos" | "¿Ya puedo dejar de pensar en esto?" |
| 5 | **Cierre** — "Listo" + resumen + "¿Algo más?" | "¿Quedó bien?" |

---

## 11. Pantallas que sobran

- Selección de categoría de servicio (Mandado / Entrega / Traslado / etc.)
- Selección manual del agente
- Resumen como pantalla separada si la propuesta ya tenía la información
- "¿Cuándo lo necesitas?" como pregunta obligatoria
- Cualquier pantalla que muestre estados técnicos al cliente (`por_tomar`, `aceptada`, `en_mision`)

---

## 12. Preguntas que nunca deberíamos volver a hacer

| Pregunta | Por qué sobra |
|---|---|
| "¿Qué tipo de servicio necesitas?" | ORBI lo deduce del texto |
| "¿Qué agente quieres?" | ORBI lo asigna |
| "¿Cuándo lo necesitas?" | Se asume ahora; se pregunta solo si el usuario especifica otro momento |
| "¿Cuál es tu nombre?" | Si hay sesión o historial, ORBI lo sabe |
| "¿Cuál es tu teléfono?" | Mismo caso |
| "¿Confirmas el resumen?" | Si el usuario ya confirmó la propuesta, el resumen final es redundante |

---

## 13. Los 20 Principios de Experiencia ORBI

*(Principios 1–10 viven en el Product Book. Estos son los principios de experiencia.)*

**Principio 11 — ORBI propone; el usuario confirma.**
El usuario nunca diseña el proceso. ORBI presenta una solución concreta; el usuario la aprueba o la ajusta.

**Principio 12 — Una pregunta a la vez.**
Cuando ORBI necesita información, la pide de una en una, en el orden en que importa.

**Principio 13 — El silencio es una respuesta.**
Si el usuario no especificó algo, ORBI asume el default razonable. Nunca pregunta lo que puede asumir.

**Principio 14 — La intención vale más que la categoría.**
Lo que el usuario dice tiene más valor que cómo el sistema lo clasifica. La categoría se adapta al usuario.

**Principio 15 — La tranquilidad se declara, no se implica.**
Cuando ORBI ya se encargó de algo, lo dice explícitamente. No lo deja implícito en un ícono o un cambio de estado.

**Principio 16 — El cierre es una promesa cumplida.**
Cada misión completada es un compromiso que terminó bien. El lenguaje del cierre debe reflejar eso.

**Principio 17 — Los estados internos no son del usuario.**
El sistema puede tener veinte estados para gestionar una misión. El usuario necesita saber tres: si ya hay alguien encargado, si ya va en camino, si ya terminó.

**Principio 18 — El regreso es una bienvenida.**
Cuando un usuario regresa, ORBI lo trata como a alguien que ya confió una vez. El primer elemento visible debe reconocerlo.

**Principio 19 — La ambigüedad no es un error.**
Cuando el usuario llega sin saber exactamente qué necesita, eso no es un caso borde — es un caso central. La respuesta a la ambigüedad es una pregunta abierta, no un menú.

**Principio 20 — Si ORBI no puede, lo dice sin disculparse.**
Cuando no hay manera de resolver lo que el usuario necesita, ORBI lo dice claro y ofrece la alternativa más cercana — que suele ser contacto humano directo.

---

## 14. Manifiesto ORBI

*Para el equipo que construirá esto durante los próximos años.*

Empezamos con una idea simple: hay personas que necesitan cosas y personas que pueden conseguirlas. Nosotros hacemos que se encuentren.

Pero con el tiempo aprendimos que eso no era suficiente.

Porque el problema nunca fue la distancia entre la persona y el producto. El problema fue siempre la incertidumbre. La pregunta sin respuesta que flota mientras esperas: *¿va a llegar? ¿lo van a entender? ¿alguien se está encargando?*

ORBI existe para responder esa pregunta antes de que se haga.

---

Creemos que la tecnología más poderosa no es la que hace cosas más rápido.
Es la que hace que las personas se preocupen menos.

Un formulario no es un producto. Un tracker no es un producto. Una lista de agentes no es un producto. Un producto es la experiencia de sentir que algo que era tu problema ya no lo es.

Eso es lo que construimos. No pantallas. No APIs. No estados de misión.
**Construimos tranquilidad.**

---

Nunca vamos a pedirle al usuario que piense como el sistema.
El sistema piensa como el usuario. Siempre.

Si alguien tiene que adaptar su lenguaje, su formato, su categoría o su proceso para que ORBI lo entienda, es ORBI el que falló — no el usuario.

Cada campo que eliminamos del formulario es una victoria. Cada decisión que tomamos automáticamente es una pregunta que el usuario no tuvo que responder.

---

Sabemos que hoy ORBI conecta personas con agentes.
El día que trascienda, ORBI conectará problemas con soluciones.

Ese cambio parece sutil. Transforma todo.

Ya no importa si la solución es un café, un traslado, un trámite, un paquete, o algo que todavía no imaginamos. Para el usuario siempre será la misma experiencia: tengo un problema. ORBI ya se está encargando.

---

Construimos para comunidades locales. Para la persona que necesita la medicina. Para el emprendedor que no puede hacer el trámite. Para el padre que necesita que alguien recoja a su hijo.

Cada uno llegará con una frase diferente. Pero todos esperarán lo mismo: que alguien se encargue.

---

Cuando tengamos dudas sobre qué construir, nos haremos una sola pregunta:

**¿Este cambio hace que resolver con ORBI se sienta más fácil y más tranquilo?**

Si la respuesta es sí, avanzamos.
Si la respuesta es "tal vez", esperamos.
Si la respuesta es no, lo descartamos sin importar qué tan buena parezca la idea.

---

No construimos features.
Construimos confianza.

Y la confianza se construye despacio, con cada interacción que cumple lo que prometió.
Un pedido a la vez.

---

*ORBI — Zumpahuacán, 2026*
*Este documento pertenece al producto, no a una versión del producto.*
*Se actualiza cuando la psicología del usuario evoluciona. No cuando cambia el código.*
