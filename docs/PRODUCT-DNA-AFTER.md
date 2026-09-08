# Product DNA — Lestra After

Estado: **obligatorio para todo trabajo de producto, UI y UX**
Fecha: 2026-09-08

## Norte de producto

After no es un LMS, un ERP, una agenda escolar tradicional ni un dashboard. Es el organizador temporal de la vida diaria del estudiante y su familia.

La pregunta principal es:

> ¿Qué viene ahora?

After debe reducir carga mental y unir colegio, tareas, pruebas, estudio, deporte, salud, cumpleaños, rutinas y coordinación familiar sin convertirse en software empresarial.

## Modelo mental

Ahora → Después → Hoy → Mañana → Semana → Familia.

El centro del producto es el tiempo, no una lista de módulos técnicos.

## Situaciones prioritarias

Todo diseño debe partir de una situación real, por ejemplo:

- estudiante abre After y necesita saber qué sigue;
- apoderado agrega una actividad repetitiva en pocos segundos;
- una tarea todavía no tiene un bloque de estudio asignado;
- hay dos actividades que se superponen;
- no existe tiempo de traslado suficiente;
- la semana acumula demasiadas pruebas y compromisos;
- familia necesita coordinar responsabilidades sin abrir un sistema administrativo.

## Firmas de producto

### Day Rail

Línea temporal del día que permita comprender el ritmo completo en menos de tres segundos.

### Routine Block

Bloques temporales reconocibles por contexto: colegio, estudio, deporte, salud, personal y familia.

### Conflict Intelligence

Advertencias contextuales sobre:

- superposición de horarios;
- traslados imposibles o demasiado ajustados;
- tareas sin tiempo reservado;
- sobrecarga del día/semana.

Debe ser asistencia discreta, no un chatbot invasivo.

### Week Flow

Vista del ritmo semanal. No replicar un calendario corporativo si una representación temporal más clara sirve mejor al usuario.

### Family Coordination

Coordinación de responsables, actividades y recordatorios sin convertir la experiencia en administración de usuarios.

## Pantalla principal

La home es `Today Flow`, no un dashboard.

Debe priorizar:

- ahora;
- siguiente actividad;
- tiempo disponible;
- pendientes que impactan el día;
- conflictos o preparación necesaria.

No mostrar KPI ni gráficos si no responden una decisión inmediata.

## Agregar actividad

Debe ser extremadamente rápido.

Orden recomendado:

1. ¿Qué es?
2. ¿Cuándo?
3. ¿Se repite?
4. ¿Para quién?
5. Guardar.

El sistema debe completar valores conocidos y reducir escritura manual.

## Navegación

Mobile-first.

Conceptos primarios recomendados:

- Hoy
- Semana
- Agregar
- Pendientes
- Familia

No utilizar una sidebar empresarial como navegación principal de la app móvil.

## Lenguaje

Usar lenguaje cotidiano:

- Hoy
- Después
- Mañana
- Tarea
- Estudio
- Entrenamiento
- Médico
- Cumpleaños
- Pendiente
- Preparar
- Salir

Evitar “gestionar actividad”, “entidad”, “módulo”, “procesar evento” o copy corporativo abstracto.

## Reglas visuales

- sensación ligera, silenciosa y personal;
- el contenido domina sobre el chrome de interfaz;
- jerarquía temporal clara;
- evitar exceso de cards;
- no llenar espacios con estadísticas;
- color como apoyo semántico, no como decoración;
- asimetría natural según duración/prioridad de actividades;
- animación sutil solo si ayuda a orientación temporal;
- targets táctiles adecuados;
- contraste y legibilidad en exteriores/interiores.

## Componentes preferidos

- `DayRail`
- `RoutineBlock`
- `UpcomingActivity`
- `StudyBlock`
- `SchoolTask`
- `FamilyEvent`
- `ConflictWarning`
- `WeekFlow`
- `ActivityComposer`
- `TravelBuffer`
- `ReminderCluster`
- `FamilyCoordination`

## Anti-patrones

No introducir como solución por defecto:

- dashboard convencional;
- 4 KPI;
- gráficos decorativos;
- hero promocional dentro de la app;
- cards para cada pequeña pieza de información;
- gradientes de marketing;
- sidebar empresarial como navegación móvil;
- iconografía abundante;
- copy corporativo;
- datos inventados;
- IA/chat visible en cada flujo solo porque existe inteligencia.

## Inteligencia contextual

After puede sugerir información como:

- “Tienes solo 20 minutos entre colegio y entrenamiento”.
- “Hay dos pruebas el jueves”.
- “Esta tarea todavía no tiene tiempo reservado para estudio”.

La inteligencia debe aparecer en el momento y contexto correctos, con acción concreta y posibilidad de ignorar/ajustar.

## Definition of Done

Una experiencia no está terminada hasta validar:

- flujo real;
- mobile;
- tablet/web si aplica;
- accesibilidad;
- contraste;
- loading;
- empty;
- error;
- disabled;
- conflictos;
- copy;
- claridad temporal;
- identidad After sin logo.

## Pruebas finales

> ¿Esta pantalla parece una herramienta para vivir el día o parece software empresarial? Si parece software, rediseñar.

> ¿Puedo entender mi día en menos de tres segundos? Si no, rediseñar.

> ¿La interfaz reduce carga mental o agrega pasos y elementos? Si la aumenta sin razón operacional, simplificar.