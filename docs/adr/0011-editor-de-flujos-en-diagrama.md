# ADR 0011: Editor de flujos en diagrama

- **Estado:** aceptado (2026-11-24)
- **Ámbito:** `apps/web/src/app/pages/workflow-templates`, `task_definitions`

## Contexto

El editor de flujos (ADR 0009) era una lista con casillas para las dependencias. Se pidió poder
«dibujar» el flujo: arrastrar las tareas y unirlas como en un diagrama.

## Decisión

Aprobada por el usuario que dirige el proyecto:

- **Dependencia `@foblex/flow` 19.4.0** (MIT, Angular nativo, sin dependencias de runtime aparte
  de `tslib`). Se eligió frente a `ngx-vflow` (requiere d3-drag, d3-selection y d3-zoom) y frente
  a un SVG propio (más código que mantener). Solo la usa la ruta `/flujos/:id`, cargada de forma
  diferida (~84 kB comprimidos); su tema (`styles/default.scss`) se registra en `angular.json`.
- **Vista Diagrama | Lista** en el editor. Cada tarea es una caja que se arrastra; se une el punto
  de salida (derecha) de una tarea con la entrada (izquierda) de otra para que la segunda dependa
  de la primera. Una flecha seleccionada se quita con Supr. El editor rechaza en el acto las
  uniones que forman un ciclo; la API sigue validando todo al guardar.
- El panel lateral del diagrama reutiliza los campos de la tarea de la vista Lista. La lista se
  conserva como alternativa accesible por teclado y es la vista inicial en pantallas angostas.
- **Posición persistida** en `task_definitions.diagram_x/diagram_y` (migración `0016`, nulos =
  ubicación automática por niveles). Es parte de la versión: se copia al crear una nueva y no
  cambia en una versión publicada.

## Consecuencias

- La posición es solo visual: no afecta el orden de activación, que depende de las dependencias.
- Tras aplicar la migración `0016`, `sql/workflow_mvp.sql` debe regenerarse con `mysqldump`.
