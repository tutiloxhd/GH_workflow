# Estado de HU-12 · Ver flujo (A11)

Fecha de revisión: 19 de noviembre de 2026.

Fuente de alcance: [backlog-semana.md](./backlog-semana.md#hu-12--ver-flujo-a11) y [pruebas-backlog-semana.md](./pruebas-backlog-semana.md#6-hu-12--ver-flujo-a11).

## Estado general

**En curso.** La navegación principal, la ficha lateral y el diagrama están implementados, pero la historia no cumple todavía todos los criterios de aceptación originales y no tiene una ejecución manual registrada para HU12-01 a HU12-14.

## Implementado

- Selector semanal basado en la fecha del remate y zona horaria de Santiago.
- Selección de un remate desde el listado y apertura de una ficha lateral.
- Ficha lateral con título, ubicación, fecha, estado, progreso, antecedentes y participantes.
- Acción «Ver detalle y flujo extendido» que abre `/workflows/:workflowId` en otra pestaña.
- Diagrama de las 15 tareas reales en tres filas con recorrido de serpiente.
- Cada nodo muestra nombre, responsable y estado mediante texto y color.
- Estados visuales para completada, en proceso, vencida, pendiente, suspendida y cancelada.
- Cancelación diferenciada en gris oscuro y suspensión en violeta.
- Vista vertical del diagrama en teléfono.
- Menú desplegable del usuario con la acción «Cerrar sesión».
- Los datos del workflow y de sus tareas provienen de la API existente.

## Evaluación por caso de aceptación

| Caso | Estado | Observación |
| --- | --- | --- |
| HU12-01 | Pendiente | La consulta del tablero no filtra estados; puede devolver workflows completados o cancelados. |
| HU12-02 | Parcial | Se muestran título, comuna, fecha, hora y estado. Faltan miniatura y etapa actual en la fila. |
| HU12-03 | Pendiente | No se incorporó la miniatura placeholder común. |
| HU12-04 | Parcial | El panel muestra estado, ubicación, fecha, progreso y participantes. Faltan tarea actual, próxima acción y fecha límite explícitas. |
| HU12-05 | Parcial | La ficha consume el detalle real del workflow, pero falta validar manualmente responsable y vencimiento contra la vista de detalle. |
| HU12-06 | Parcial | El estado suspendido se distingue; falta representar explícitamente la tarea actual como detenida en la ficha lateral. |
| HU12-07 | Cumplido técnicamente | El diagrama presenta las tareas en orden, con estado y responsable. Falta aprobación visual/manual. |
| HU12-08 | Cumplido técnicamente | Los estados usan texto además de color. Falta ejecutar el caso con todas las combinaciones. |
| HU12-09 | No cumple el alcance original | Los nodos abren el modal operativo y permiten actuar. Esto responde a la solicitud posterior del usuario, pero contradice el criterio original de vista aérea de solo lectura. Se debe actualizar el alcance o separar la vista operativa. |
| HU12-10 | Parcial | Hay adaptación móvil y scroll interno en escritorio. El cambio a vertical ocurre a 760 px, no hasta 1000 px como indica el caso. Falta revisión a 375, 768 y 1280 px. |
| HU12-11 | Pendiente | Los nodos son operables con teclado, pero la ficha lateral no implementa cierre con Escape, captura de foco ni devolución de foco. |
| HU12-12 | Parcial | La API limita a usuarios no administradores a workflows relacionados, pero la pantalla principal también está disponible para ellos. |
| HU12-13 | Cumplido técnicamente | Existe un mensaje para una semana sin remates visibles. Falta probar una base sin workflows en curso. |
| HU12-14 | Parcial | Estados y tareas vienen de la API, pero la etapa actual no forma parte del resumen y el conteo de completadas se deriva en el frontend desde las tareas. |

## Verificaciones realizadas

- `npm run build`: aprobado el 19 de noviembre de 2026.
- `npm test -- --watch=false`: 20 pruebas aprobadas.
- No se ejecutó todavía la matriz manual HU12-01 a HU12-14.
- No se registró evidencia visual en teléfono, tablet y escritorio.

## Decisiones o ajustes necesarios

1. Confirmar si el diagrama operativo solicitado reemplaza formalmente el criterio HU12-09 de solo lectura.
2. Definir si la pantalla principal será exclusiva de ADMIN o si se aprueba la visibilidad actual para participantes.
3. Completar listado y ficha con miniatura placeholder, etapa actual, próxima acción y fecha límite.
4. Filtrar el tablero a workflows activos y suspendidos.
5. Completar accesibilidad del panel lateral y validar los tres tamaños definidos.

La HU-12 puede pasar a **Terminada** cuando se resuelvan esas diferencias, se agreguen pruebas automatizadas proporcionales y se registre la ejecución manual de sus casos de aceptación.
