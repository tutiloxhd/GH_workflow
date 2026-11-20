# Backlog de la semana (16–20 nov 2026)

Historias que trabaja el equipo esta semana. Cada una apunta a un ítem del [roadmap](./roadmap.md): si cambia el alcance o el estado, se actualizan ambos archivos en el mismo cambio.

Casos de prueba de cada historia: [pruebas-backlog-semana.md](./pruebas-backlog-semana.md).

**Estados:** Terminado · En curso · Siguiente · Pendiente · Bloqueado (espera una decisión).

Objetivo: personas desde `admin_new`, centro de notificaciones y pantalla «Ver flujo». Equipo de 3 personas; las decisiones N1, N5, N6 y N8 se llevan a negocio en paralelo.

| HU | Roadmap | Responsable | Estado |
| --- | --- | --- | --- |
| HU-06 Usuarios desde admin_new | A2 | Persona 1 | En curso |
| HU-07 Usuario dado de baja | A3 | Persona 1 | Siguiente |
| HU-08 Cambio de gestor o postor | A4 | Persona 1 | Siguiente |
| HU-09 Centro de notificaciones | A5 | Persona 3 | Siguiente |
| HU-12 Ver flujo | A11 | Persona 2 | Siguiente |
| Reunión con negocio | N1, N5, N6, N8 | Líder | Siguiente |

### HU-06 · Usuarios desde admin_new (A2)
**Como** administrador, **quiero** que los agentes de `gh_agente_zona` existan en el workflow con su rol, **para** no crearlos a mano.

- Cada agente activo de `gh_agente_zona` tiene un usuario en el workflow con el rol que corresponde.
- Repetir la migración no crea usuarios duplicados.
- Un agente sin datos suficientes (por ejemplo, sin correo) se informa y no se inventa.
- `admin_new` solo se lee.

### HU-07 · Usuario dado de baja (A3)
**Como** administrador, **quiero** que un agente que sale de `gh_agente_zona` quede inactivo en el workflow, **para** que no pueda entrar ni recibir tareas.

- El usuario queda `INACTIVE` y sus sesiones se revocan.
- Sus tareas abiertas quedan visibles para el administrador para reasignarlas.
- El cambio queda en el historial.

### HU-08 · Cambio de gestor o postor (A4)
**Como** gestor, **quiero** que si `admin_new` cambia al gestor o al postor de una propiedad, sus tareas abiertas pasen al nuevo responsable, **para** que nadie trabaje en algo que ya no le corresponde.

- Las tareas abiertas del rol cambiado pasan al nuevo responsable; las completadas no cambian.
- El historial registra el responsable anterior, el nuevo y el origen (`SYNC`).
- Sincronizar de nuevo sin cambios no genera otra reasignación.
- Si el nuevo responsable no existe como usuario en el workflow, se registra un aviso y no se reasigna.

### HU-09 · Centro de notificaciones (A5)
**Como** usuario del workflow, **quiero** un centro de notificaciones con lo que requiere mi atención, **y como** administrador **quiero** configurar de forma general qué se notifica, **para** que nadie se entere tarde de una tarea o un cambio.

Motor:
- Genera notificaciones a partir de hechos del workflow: tarea asignada, tarea por vencer, tarea vencida, workflow suspendido, reanudado, cancelado o reprogramado.
- Cada notificación tiene destinatario, tipo, mensaje, enlace a la tarea o al workflow, y fecha; se guarda en la base.
- No duplica: el mismo hecho genera una sola notificación por destinatario, aunque el proceso se repita.
- «Por vencer» y «vencida» se evalúan periódicamente en hora de Santiago; una tarea suspendida no vence.
- Las notificaciones de una tarea se envían únicamente a su titular vigente. El suplente comienza a recibirlas solo después de que se confirme su reemplazo como titular.

Centro:
- Ícono con el número de no leídas en la barra; al abrirlo, la lista más reciente primero.
- Marcar una o todas como leídas; al hacer clic se abre la tarea o el workflow.
- Cada usuario ve solo sus notificaciones.

Configuración general (solo ADMIN):
- Activar o desactivar cada tipo de notificación.
- Anticipación de «por vencer» (por ejemplo, horas o días antes del vencimiento).
- Los cambios aplican hacia adelante y quedan registrados.

Fuera de esta historia: correo y otros canales externos (C4).

> Requiere aprobación antes de construir (AGENTS.md §8 y §17): el proceso periódico que evalúa vencimientos (punto de entrada propio, como el sincronizador) y las tablas nuevas. El valor por defecto de la anticipación es la decisión N8.

### HU-12 · Ver flujo (A11)
**Como** administrador, **quiero** una pantalla principal con las propiedades que hoy están en el flujo, un resumen al seleccionarlas y una vista aérea del flujo completo, **para** analizar rápido el estado de cada remate.

Basada en el tablero de la maqueta ([references/demoweb/](../references/demoweb/), `index.html` + `app.js` y el diagrama de `workflow.js`).

Lista:
- Muestra solo las propiedades con workflow en curso (activo o suspendido).
- Cada fila: título, comuna, fecha y hora del remate, estado con su color y etapa actual. No muestra fotografía porque el sistema de origen no dispone de imágenes de la propiedad.

Resumen (al hacer clic en una propiedad):
- Panel de detalle como en la maqueta: título, ubicación, fecha y hora, comuna y estado.
- Progreso del proceso: tareas completadas sobre el total (sin porcentaje) y la tarea actual con las vecinas.
- Responsable actual, próxima acción y fecha límite.
- Botón «Ver flujo completo →».

Vista aérea («Ver flujo completo»):
- Diagrama de todas las tareas de la plantilla en orden, con el estado de cada una (completada, en curso, pendiente, bloqueada, suspendida) y su responsable.
- Horizontal en escritorio y línea de tiempo vertical en tablet y teléfono, como la maqueta.
- Los nodos abren el detalle de la tarea en modo solo lectura; las acciones operativas se realizan desde las vistas habilitadas para ello.

Reglas:
- Los datos vienen de la API; el frontend no calcula estados ni etapas.
- Solo ADMIN ve esta pantalla como principal; los demás roles siguen viendo su inicio actual.
- Se revisa en teléfono, tablet y escritorio, con teclado y foco visible.
