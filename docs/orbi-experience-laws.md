# ORBI — Las 10 Leyes de la Experiencia

**Documento permanente. Versión 1.0**
**Fecha de origen: 2026-07-05**

Este documento no describe cómo se ve ORBI.
Describe qué se siente.

Cualquier decisión de producto — pantalla, texto, flujo, feature, restricción — puede evaluarse preguntando únicamente: **¿respeta las 10 Leyes de ORBI?**

Este documento es el equivalente al Human Interface Guidelines de Apple, pero para ORBI. Nació de la auditoría de 20 recorridos de usuarios reales.

---

## Los 20 Recorridos que lo originaron

Antes de las leyes, los patrones. Estos son los 10 patrones que se repitieron en los 20 recorridos auditados:

1. **La pregunta que ORBI nunca debería hacer** — En 14 de 20 recorridos, el mayor riesgo fue que ORBI preguntara algo que ya puede inferir o que el agente puede resolver en campo.
2. **El tiempo importa más de lo que parece** — En 11 de 20 recorridos, la incertidumbre principal fue temporal: ¿llega a tiempo?
3. **El usuario describe problemas, no servicios** — En 18 de 20 recorridos, el usuario nunca usó nomenclatura técnica del sistema.
4. **La confianza se construye en el primer pedido** — Ninguna palabra convence. Solo la primera experiencia completa.
5. **El silencio después de confirmar es el momento más frágil** — El tracker no es UX. Es contención emocional.
6. **Hay usuarios que no saben que ORBI puede ayudarles** — El sistema nunca debe validar ese miedo.
7. **Los adultos mayores son el test de dignidad** — Si funciona para ellos, funciona para todos.
8. **El error más caro es la pregunta sobre preferencias cuando hay urgencia** — La urgencia es una instrucción, no un dato.
9. **La experiencia más valiosa es la del recurrente** — El usuario que escribe "lo de siempre" es la meta.
10. **ORBI nunca debe hacerse visible** — La experiencia perfecta es aquella donde ORBI desaparece.

---

## Las 10 Leyes

---

### Ley I — La Ley del Nombre del Problema

**El usuario no describe servicios. Describe problemas.**

ORBI nunca pide al usuario que categorice lo que necesita. ORBI escucha la situación y deduce el servicio. Si el usuario dice "mi esposo está mal y necesita una medicina", ORBI no pregunta "¿qué tipo de servicio necesitas?" — ya lo sabe.

**Violación:** Cualquier pantalla, menú o pregunta que obligue al usuario a aprender la nomenclatura interna de ORBI antes de poder pedir ayuda.

---

### Ley II — La Ley de la Pregunta Única

**Cada momento de interacción tiene derecho a una sola pregunta.**

Cuando ORBI necesita información, pregunta una sola cosa. No dos. No una lista. No un formulario disfrazado de conversación. Una pregunta. La más importante de todas las que podría hacer. Las demás las resuelve el agente en campo, las infiere del historial, o las decide ORBI.

**Violación:** Cualquier pantalla que tenga más de un campo obligatorio no justificado, o cualquier mensaje que contenga dos signos de interrogación.

---

### Ley III — La Ley del Tiempo Visible

**El ETA no es logística. Es la emoción principal del usuario después de confirmar.**

Desde el momento en que el usuario confirma, lo más importante que ORBI puede darle es tiempo. No una descripción del proceso. No un número de folio. Tiempo. Cuándo llega. Ese dato es lo que permite al usuario soltar la preocupación y regresar a su vida.

**Violación:** Cualquier estado post-confirmación que no muestre un tiempo estimado visible, actualizado y concreto.

---

### Ley IV — La Ley de la Confianza por Demostración

**La confianza no se construye con palabras. Se construye con la primera experiencia completa.**

ORBI no convence a los usuarios escépticos explicando cómo funciona ni prometiendo seguridad. Los convence haciendo exactamente lo que dijo que haría, en el tiempo que dijo, sin sorpresas. Una experiencia completa vale más que cualquier texto de onboarding.

**Violación:** Invertir en mensajes de "somos seguros" o "somos confiables" cuando el presupuesto debería estar en hacer que la primera entrega salga perfecta.

---

### Ley V — La Ley del Agente Invisible

**El agente es el producto. ORBI es el puente.**

El usuario no quiere interactuar con una app. Quiere que su problema quede resuelto. El agente es quien lo resuelve. ORBI existe para que esa conexión ocurra sin fricción. Cuando el usuario no está pensando en ORBI — cuando está pensando en su reunión, en su hijo, en su colado — ORBI está haciendo bien su trabajo.

**Violación:** Cualquier pantalla que ponga la interfaz de ORBI al centro en lugar de la resolución del problema del usuario.

---

### Ley VI — La Ley de la Dignidad Universal

**El sistema se diseña para el usuario con menos habilidad digital, no para el usuario promedio.**

Si ORBI funciona para Don Ramón (74 años, escribe con errores), funciona para todos. Si ORBI solo funciona para Rodrigo (22 años, nativo digital), excluye a la mitad de quienes más lo necesitan. La ortografía, el tono, la velocidad de escritura y el nivel de especificación del pedido no deben afectar la calidad del servicio.

**Violación:** Cualquier flujo que requiera precisión lingüística, categorización correcta o habilidades digitales para funcionar.

---

### Ley VII — La Ley de la Urgencia Tácita

**Cuando el usuario dice "urgente", eso es una instrucción, no un dato.**

"Urgente", "ahorita", "se me acaba", "es hoy", "tengo cita" son instrucciones de prioridad. ORBI no pregunta "¿para cuándo lo necesitas?" después de que el usuario ya respondió esa pregunta con su propio lenguaje. La urgencia se actúa, no se procesa.

**Violación:** Cualquier campo de "¿para cuándo?" mostrado a alguien que ya expresó urgencia, o cualquier flujo que trate la urgencia como un atributo opcional.

---

### Ley VIII — La Ley del Precio sin Sorpresa

**El usuario debe saber cuánto cuesta antes de comprometerse. Siempre.**

No después de confirmar. No al final. Antes. El miedo a ser estafado es real y justificado. ORBI lo elimina siendo radical en la transparencia de precio en el momento de confirmación — no en los términos y condiciones, no en el recibo final. En el momento de decisión.

**Violación:** Cualquier flujo donde el usuario confirma sin saber el costo, o donde el costo aparece por primera vez después de que el agente ya fue enviado.

---

### Ley IX — La Ley del No sin Abandono

**Cuando ORBI no puede hacer algo, ofrece lo que sí puede hacer.**

Si el pedido está fuera del alcance del sistema, ORBI no dice "no podemos". Dice qué parte del problema sí puede resolver. Un abogado: no. Llevarte a donde hay abogados: sí. Un producto que no existe en la zona: no hoy. Buscar alternativas: sí. ORBI nunca deja al usuario solo frente a su problema sin al menos señalar una dirección.

**Violación:** Mensajes de error que terminan en un punto sin ofrecer ninguna alternativa accionable.

---

### Ley X — La Ley del Recurrente como Destino

**El usuario que escribe "lo de siempre" es la definición de éxito.**

Todo el diseño de ORBI — cada pregunta, cada texto, cada decisión automática — tiene como destino final un usuario que ya no necesita explicar nada. Un usuario que abre ORBI como abre un cajón de su cocina: sin pensar, porque confía en que lo que busca va a estar ahí. Cada recorrido que no lleva al usuario en esa dirección es un recorrido mal diseñado.

**Violación:** Cualquier pedido recurrente que requiera al usuario repetir información que ya dio antes, o cualquier flujo que trate al usuario número 50 igual que al usuario número 1.

---

## El Test de las Leyes

Antes de construir cualquier pantalla, flujo, mensaje o decisión de producto, ORBI responde estas tres preguntas:

> **¿Obliga al usuario a pensar como ORBI?**
> Si sí → viola la Ley I o la Ley VI.

> **¿Hay más de una pregunta, o el costo es invisible en el momento de confirmar?**
> Si sí → viola la Ley II o la Ley VIII.

> **¿El usuario termina esta pantalla con menos incertidumbre que cuando llegó?**
> Si no → viola la Ley III, la Ley V o la Ley IX.

Si las tres respuestas son correctas, la pantalla puede existir.

---

## Cómo usar este documento

Este documento no es una lista de buenas prácticas. Es un criterio de rechazo.

Cualquier equipo — diseño, producto, ingeniería — puede usar las 10 Leyes para evaluar una propuesta sin necesitar una revisión de diseño formal. Si la propuesta viola una ley, no necesita más justificación para ser rechazada.

Si una propuesta respeta las 10 leyes pero sigue sintiéndose mal, el problema está en las leyes — y ese es un buen momento para actualizarlas, no para ignorarlas.

Las leyes evolucionan con el producto. Pero siempre a partir de recorridos de usuarios reales, nunca a partir de opiniones internas.
