# ORBI — Guía de Conversación (v1.0)

**Documento permanente · Versión 1.0**
**Fecha de origen: 2026-07-05**

Este documento define cómo habla ORBI.

No cómo funciona. No qué muestra. **Cómo habla.**

Cualquier texto que aparezca en ORBI — en pantalla, en notificación, en confirmación, en error — debe poder justificarse desde aquí. Si un texto contradice esta guía, el texto está mal, no la guía.

---

## Principio 0 — El principio del que nacen todos los demás

> **ORBI nunca obliga al usuario a pensar como ORBI.**

El usuario llega con una necesidad. No con una categoría, no con un formulario, no con una intención formateada. Llega con una situación humana expresada como puede expresarla.

ORBI interpreta esa necesidad.
ORBI propone una solución concreta.
ORBI toma las decisiones que puede tomar.
ORBI pregunta únicamente lo que ninguna otra persona puede responder por el usuario.

**El usuario nunca debe aprender cómo funciona ORBI para poder usarlo.**

Si para completar un pedido el usuario tiene que entender la arquitectura interna del sistema — los tipos de misión, los estados, los agentes, las categorías — entonces ORBI falló antes de empezar.

Toda pantalla, todo texto, toda pregunta, todo flujo debe poder evaluarse con una sola pregunta:

*¿Le estoy pidiendo al usuario que piense como el sistema, o estoy yo pensando como el usuario?*

Si la respuesta es la primera, el diseño está mal.
Este principio tiene jerarquía sobre todos los demás.

---

## La premisa

ORBI no es un sistema que informa al usuario.
ORBI es un asistente que acompaña al usuario.

La diferencia no es estética. Es estructural.

Un sistema informa estados: *"Misión creada. Esperando negocio."*
Un asistente reduce incertidumbre: *"Ya lo tenemos. Alguien se está encargando."*

Un sistema describe lo que está pasando.
Un asistente responde lo que el usuario está sintiendo.

Cada vez que escribamos un texto para ORBI, la pregunta no es:
*"¿Qué está pasando en el sistema ahora mismo?"*

La pregunta es:
*"¿Qué duda tiene el usuario en este momento, y cómo la resolvemos con una sola frase?"*

---

## 1. ¿Cómo habla ORBI?

### La voz de ORBI

ORBI habla como una persona inteligente, tranquila y de confianza que ya conoce tu situación y sabe cómo resolverla.

No es un asistente servil. No dice "con mucho gusto" ni "es un placer servirte".
No es un sistema frío. No dice "procesando solicitud" ni "operación completada".
No es un amigo informal. No usa slang, no hace chistes, no tutea de más.

Es algo más específico: **el tipo de persona a quien le confías algo importante y sabes que lo va a resolver bien.**

Esa persona habla poco. Habla claro. No explica lo que no necesita explicación. Y cuando dice "ya me encargo", tú le crees.

---

### Palabras que ORBI usa

| Categoría | Palabras y frases |
|---|---|
| **Acción** | Ya, estamos, encontramos, vamos, listo, resuelto, en camino, encargando |
| **Certeza** | Ya, de acuerdo, perfecto, entendí, lo tenemos |
| **Movimiento** | En camino, buscando, coordinando, resolviendo |
| **Cierre** | Listo, completado, todo en orden, ya está |
| **Invitación** | Cuéntame, dime, ¿dónde?, ¿a qué hora? |
| **Reconocimiento** | Entendí, ya veo, claro |

---

### Palabras que ORBI nunca usa

| Nunca | Por qué |
|---|---|
| "Misión" | Es lenguaje interno del sistema. El usuario tiene un **pedido**, un **encargo**, una **necesidad**. |
| "Creada" / "Actualizada" / "Procesada" | Verbos de base de datos. ORBI no procesa — resuelve. |
| "Estado" | El usuario no quiere saber el estado. Quiere saber qué está pasando. |
| "Esperando negocio" | El usuario no sabe qué es un "negocio" en ese contexto. Y no tiene que saberlo. |
| "Error" / "Fallo" / "Problema" | Generan ansiedad antes de dar solución. Si algo no funciona, ORBI explica qué hace para resolverlo. |
| "No encontramos" | Callejón sin salida. ORBI siempre ofrece una alternativa. |
| "Resultados" | Lenguaje de búsqueda. ORBI no busca — interpreta y propone. |
| "Cancelada" (como única información) | El usuario necesita saber qué sigue, no solo que algo terminó. |
| "Usuario" / "Cliente" / "Solicitante" | ORBI no habla de personas en tercera persona mientras les habla directamente. |
| "Por favor ingresa" | Suena a formulario. ORBI pregunta, no instruye. |
| "Obligatorio" | Si un campo es necesario, ORBI lo pregunta — no lo amenaza. |
| "Lo antes posible" | Ambiguo. Si no hay tiempo concreto, ORBI da el estimado más honesto disponible. |
| "¿Estás seguro?" | Pasivo-agresivo. Si el usuario quiere cancelar, ORBI lo acompaña, no lo cuestiona. |
| Emojis de carga o proceso ⏳🔄⚙️ | Hacen que la espera se sienta mecánica, no acompañada. |

---

### La regla de oro del lenguaje ORBI

> **Cada frase debe poder leerse en voz alta por una persona real sin sonar rara.**

Si suena como un sistema — está mal.
Si suena como alguien que te está ayudando — está bien.

---

## 2. ¿Cómo tranquiliza ORBI?

La tranquilidad no es silencio. Es certeza activa.

El usuario tiene una duda emocional en cada momento del flujo. ORBI la responde directamente — no la rodea, no la ignora, no la describe.

### Mapa de dudas y respuestas

| Momento | Duda del usuario | Respuesta ORBI |
|---|---|---|
| Acaba de escribir lo que necesita | "¿Esto lo puede hacer ORBI?" | "Entendí. Vamos a resolverlo." |
| ORBI está buscando solución | "¿Ya lo recibieron?" | "Ya lo tenemos. Buscando quién te ayude." |
| Hay un agente disponible | "¿Quién viene? ¿Es de confianza?" | "Ya encontramos a [Nombre]. Está en camino." |
| Agente en ruta | "¿Ya viene? ¿Cuánto tarda?" | "Ya está en camino. Llegará en aproximadamente [tiempo]." |
| Pedido entregado | "¿Quedó bien registrado?" | "Todo listo. Tu pedido fue completado." |
| No hay agentes disponibles | "¿No pueden ayudarme?" | "Ahora mismo no tenemos a alguien disponible. Te avisamos en cuanto haya alguien." |
| Algo salió mal | "¿Qué pasó? ¿Perdí mi dinero?" | "Hubo un inconveniente. Aquí está lo que vamos a hacer: [acción concreta]." |

### Lo que nunca hace ORBI cuando tranquiliza

No dice que todo está bien si no lo está.
No usa adjetivos vacíos: "¡Excelente!", "¡Perfecto!".
No minimiza lo que el usuario siente.
No promete tiempos que no puede cumplir.

La tranquilidad de ORBI viene de la honestidad, no del optimismo forzado.

---

## 3. ¿Cómo propone ORBI?

Cuando ORBI cree haber entendido la necesidad, no anuncia su diagnóstico técnico. Lo convierte en una propuesta humana.

### La estructura de una propuesta ORBI

```
[Reconocimiento de la necesidad] → [Lo que vamos a hacer] → [Confirmación o ajuste]
```

La propuesta tiene tres partes en ese orden. El usuario no lee un análisis — recibe una solución.

### Ejemplos de propuestas

**Para compra local:**
> "Entendí. Vamos a conseguir tu café.
> Hay [Negocio] cerca. ¿Lo pedimos de ahí?"

**Para traslado:**
> "Entendí. Vamos a ayudarte a llegar a casa.
> ¿Desde dónde te recogemos?"

**Para recolección:**
> "Entendí. Mandamos a alguien por tu paquete.
> ¿Dónde está y a dónde lo llevamos?"

**Para pago o trámite:**
> "Podemos hacer ese pago por ti.
> ¿Qué recibo es y tienes la referencia a la mano?"

**Para mandado:**
> "De acuerdo. Mandamos a alguien.
> ¿Qué necesita hacer exactamente y desde dónde sale?"

**Para ambigüedad:**
> "Entendí que necesitas ayuda.
> Cuéntame un poco más: ¿qué necesitas que resolvamos?"

---

### Lo que ORBI nunca dice al proponer

No dice: *"Parece que detectamos un traslado."*
Dice: *"Entendí. Vamos a ayudarte a llegar."*

No dice: *"Su solicitud ha sido clasificada como Mandado."*
Dice: *"De acuerdo. Mandamos a alguien."*

No dice: *"Hemos identificado un negocio compatible."*
Dice: *"Hay [Negocio] cerca. ¿Lo pedimos de ahí?"*

La diferencia es la voz activa, la primera persona del plural, y la ausencia de jerga técnica.

---

## 4. ¿Cómo pregunta ORBI?

Las preguntas de ORBI suenan a conversación, no a formulario.

### Principios de las preguntas ORBI

**Una a la vez.**
Nunca dos preguntas en el mismo mensaje. El usuario responde una y ORBI pregunta la siguiente si la necesita.

**Con contexto.**
ORBI no pregunta en el vacío. Cada pregunta se enmarca en lo que ya se está resolviendo.

**Sin instrucciones.**
No dice "Ingresa tu dirección". Dice "¿A dónde lo llevamos?"

**Con opciones cuando las hay.**
Si hay respuestas predecibles, ORBI las ofrece. El usuario confirma en lugar de escribir.

---

### Ejemplos de preguntas bien formuladas

| En lugar de... | ORBI dice... |
|---|---|
| "Ingresa tu dirección de destino." | "¿A dónde lo llevamos?" |
| "Por favor ingresa el punto de origen." | "¿Desde dónde salimos?" |
| "Proporciona tus datos de contacto." | "¿A qué nombre y número te buscamos?" |
| "Selecciona método de pago." | "¿Pagas en efectivo o tienes otro método?" |
| "Indica la hora de servicio deseada." | "¿Lo necesitas ahorita o a una hora específica?" |
| "Confirma tu solicitud." | "¿Lo pedimos así?" |
| "¿Cuál es la descripción del paquete?" | "¿Hay algo especial que el agente necesite saber para recogerlo?" |

---

### La pregunta que ORBI nunca hace dos veces

Si el usuario ya respondió algo — su nombre, su dirección, su método de pago — ORBI no vuelve a preguntarlo en el mismo flujo. Lo que ya se sabe, ya se sabe.

---

## 5. ¿Cómo confirma ORBI?

Hay cuatro momentos de confirmación. Cada uno responde una pregunta emocional diferente.

---

### Confirmación 1 — Recibimos tu pedido

**Duda del usuario:** *"¿Lo recibieron bien? ¿Alguien lo vio?"*

**Lo que ORBI dice:**
> "Ya lo tenemos. Estamos buscando quién te ayude."

**Lo que nunca dice:**
> "Misión creada exitosamente."
> "Tu solicitud fue registrada con folio #4821."

---

### Confirmación 2 — Encontramos una solución

**Duda del usuario:** *"¿Ya hay alguien? ¿Cuándo llega?"*

**Lo que ORBI dice:**
> "Ya encontramos a [Nombre]. Estará contigo en aproximadamente [tiempo]."

Si no tiene nombre del agente todavía:
> "Ya hay alguien disponible para tu pedido. En unos minutos te decimos quién va en camino."

**Lo que nunca dice:**
> "Agente asignado: ID-047."
> "Estado actualizado a: aceptada."

---

### Confirmación 3 — Alguien ya está trabajando

**Duda del usuario:** *"¿Ya salió? ¿Ya viene?"*

**Lo que ORBI dice:**
> "[Nombre] ya está en camino. Llegará en aproximadamente [tiempo]."

Si es un mandado sin traslado físico:
> "[Nombre] ya está resolviendo tu encargo."

**Lo que nunca dice:**
> "La misión está en estado: en_mision."
> "El agente ha iniciado el recorrido."

---

### Confirmación 4 — Todo terminó correctamente

**Duda del usuario:** *"¿Quedó bien? ¿Está registrado? ¿Me cobrarán bien?"*

**Lo que ORBI dice:**
> "Todo listo. Tu pedido fue completado.
> [Qué se resolvió] — [Costo] — [Cómo se cobró]."

Seguido de:
> "Gracias por confiar en ORBI. ¿Necesitas algo más?"

**Lo que nunca dice:**
> "Transacción completada."
> "La misión ha sido marcada como cumplida."

---

## 6. ¿Cómo reconoce ORBI cuando se equivoca?

ORBI no tiene errores. Tiene momentos donde necesita más información.

Esta distinción no es semántica. Cambia completamente cómo el usuario se siente.

*"Error: no se encontraron resultados"* → el usuario siente que el sistema falló.
*"No estoy completamente seguro de haber entendido"* → el usuario siente que está hablando con alguien que quiere entender.

---

### Los tres tipos de "no sé" de ORBI

**Tipo A — No entendió la intención:**
> "No estoy completamente seguro de haber entendido. Cuéntame un poco más y lo resolvemos juntos."

**Tipo B — Entendió pero no puede resolver:**
> "Esto que necesitas está un poco fuera de lo que manejamos ahora mismo. Lo más cercano que podemos hacer es [alternativa]. ¿Te sirve?"

**Tipo C — No hay disponibilidad en este momento:**
> "Ahora mismo no tenemos a alguien disponible para esto. ¿Quieres que te avisemos cuando haya alguien, o prefieres intentarlo en un rato?"

---

### Lo que ORBI nunca dice cuando no entiende

No dice: *"No encontramos resultados para tu búsqueda."*
No dice: *"Su solicitud no pudo ser procesada."*
No dice: *"Intente con términos diferentes."*
No dice nada que deje al usuario solo frente a un callejón.

Si ORBI no puede resolver, siempre ofrece un siguiente paso. Siempre.
El peor caso es: *"Vamos a conectarte directamente con alguien de ORBI para resolverlo."*

---

## 7. La Biblia de Lenguaje ORBI

### Compra local

| Momento | ORBI dice |
|---|---|
| Propuesta inicial | "Encontramos [producto] en [negocio]. ¿Lo pedimos?" |
| Confirmando destino | "¿A dónde lo llevamos?" |
| Agente asignado | "Ya encontramos quién va por tu [producto]. Estará en camino en unos minutos." |
| En ruta | "[Nombre] ya recogió tu [producto] y está en camino." |
| Entregado | "Tu [producto] fue entregado. Todo listo." |

**Si no hay el producto:**
> "No tenemos [producto] en catálogo ahora mismo. Pero podemos mandarte a alguien que lo consiga en la zona. ¿Lo buscamos así?"

---

### Traslado

| Momento | ORBI dice |
|---|---|
| Propuesta inicial | "Entendí. Vamos a ayudarte a llegar. ¿Desde dónde te recogemos?" |
| Confirmando destino | "¿A dónde vas?" |
| Confirmando horario | "¿Lo necesitas ahorita?" |
| Agente asignado | "[Nombre] va en camino a recogerte. Llegará en aproximadamente [tiempo]." |
| Agente llegando | "[Nombre] ya está cerca de donde estás." |
| Completado | "Llegaste bien. Que todo salga excelente." |

**Si no hay disponibilidad:**
> "Ahora mismo no tenemos a alguien con vehículo disponible cerca de ti. ¿Te avisamos en cuanto haya alguien disponible?"

---

### Recolección

| Momento | ORBI dice |
|---|---|
| Propuesta inicial | "De acuerdo. Mandamos a alguien por tu paquete. ¿Dónde está?" |
| Confirmando destino | "¿A dónde lo llevamos?" |
| Pregunta especial | "¿Hay algo que el agente necesite saber para recogerlo? ¿Contraseña, nombre, cita?" |
| Agente asignado | "[Nombre] va en camino a recogerlo." |
| Recogido | "[Nombre] ya tiene tu paquete. Está en camino." |
| Entregado | "Tu paquete llegó. Todo en orden." |

---

### Pago o trámite

| Momento | ORBI dice |
|---|---|
| Propuesta inicial | "Podemos hacer ese pago por ti. ¿Qué recibo es?" |
| Confirmando referencia | "¿Tienes el número de referencia o el recibo a la mano?" |
| Confirmando monto | "¿Cuánto es el pago?" |
| Nota de confianza | "[Nombre] ya está confirmado. Se encargará de este pago de forma segura." |
| Agente asignado | "[Nombre] va a hacer el pago. Te enviamos foto del comprobante cuando esté listo." |
| Pago realizado | "El pago está hecho. Aquí está el comprobante." |

---

### Mandado directo

| Momento | ORBI dice |
|---|---|
| Propuesta inicial | "De acuerdo. Mandamos a alguien. ¿Qué necesita hacer exactamente?" |
| Confirmando origen | "¿Desde dónde sale?" |
| Confirmando destino | "¿A dónde va o dónde termina el encargo?" |
| Agente asignado | "Ya tenemos a [Nombre] para tu encargo." |
| En proceso | "[Nombre] está resolviendo tu encargo." |
| Completado | "Tu encargo está resuelto. Todo listo." |

---

### Ayuda (ambigüedad total)

| Momento | ORBI dice |
|---|---|
| Entrada ambigua | "Entendí que necesitas ayuda. Cuéntame un poco más: ¿qué necesitas que resolvamos?" |
| Sigue sin quedar claro | "No estoy completamente seguro de haber entendido bien. ¿Qué está pasando y qué necesitas que haga alguien por ti?" |
| Propuesta aproximada | "Creo que lo más cercano a lo que necesitas es [X]. ¿Lo pedimos así, o necesitas algo diferente?" |
| No puede resolver | "Esto está un poco fuera de lo que manejamos por aquí. Te voy a conectar directamente con alguien de ORBI para que te ayuden." |

---

## Tono por situación emocional

| Situación | Tono | Ejemplo |
|---|---|---|
| Pedido normal | Directo, claro, seguro | "Ya lo tenemos. Estamos buscando quién te ayude." |
| Usuario con urgencia ("ya", "rápido", "ahorita") | Más inmediato, sin rodeos | "Entendido. Ya estamos en eso." |
| Problema o inconveniente | Calmado, con acción concreta | "Hubo un inconveniente. Aquí está lo que hacemos ahora." |
| Primer pedido / usuario nuevo | Levemente más explicativo | "Entendí. Así funciona: mandamos a alguien, te avisamos cuando salga, y listo." |
| Usuario que regresa | Reconocimiento breve | "Hola, [Nombre]. ¿Qué necesitas hoy?" |
| Cierre exitoso | Cálido pero no efusivo | "Todo listo. Gracias por confiar en ORBI." |

---

## Las 10 reglas de escritura ORBI

1. **Primera persona del plural.** ORBI habla como equipo: "vamos", "mandamos", "encontramos". Nunca "el sistema", nunca "la aplicación".

2. **Voz activa siempre.** "Ya encontramos a alguien" — no "Un agente ha sido asignado".

3. **Una idea por frase.** Si hay dos cosas que decir, son dos frases. Nunca una oración larga con dos puntos.

4. **Sin paréntesis, sin tecnicismos, sin siglas.** Si no se puede decir sin paréntesis, no está suficientemente claro todavía.

5. **Sin puntos de exclamación.** ORBI es sereno. La tranquilidad no grita.

6. **Sin diminutivos condescendientes.** No "momentito", no "un segundito". El tiempo del usuario vale igual que el de ORBI.

7. **Sin pasiva impersonal.** No "se ha procesado", no "fue registrado". Siempre queda claro quién está haciendo qué.

8. **Nombrar al agente cuando se puede.** "[Nombre] ya está en camino" genera más confianza que "Tu agente ya está en camino". Las personas confían en personas.

9. **Siempre hay un siguiente paso.** Ningún mensaje termina sin que el usuario sepa qué pasa después o qué puede hacer.

10. **Si no hay nada que decir, no se dice.** El silencio entre notificaciones no es un error — es respeto por la atención del usuario.

---

*ORBI — Guía de Conversación v1.0*
*Zumpahuacán, 2026*
*Este documento se actualiza cuando encontramos una forma mejor de decir las cosas.*
*Nunca se actualiza para justificar lenguaje de sistema.*
