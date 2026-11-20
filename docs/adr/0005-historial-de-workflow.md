# ADR 0005: Historial único por instancia de workflow

- **Estado:** aceptado (2026-11-12)
- **Ámbito:** modelo de datos del MVP

## Contexto

El modelo MVP original tenía `task_events`, con `task_instance_id` obligatorio. La fase 1 incluye suspender, reanudar, cancelar y reprogramar un workflow, que son hechos de la instancia y no de una tarea, y toda acción relevante debe dejar historial.

## Decisión

- `task_events` se reemplaza por `workflow_events`: `workflow_instance_id` obligatorio y `task_instance_id` opcional.
- Los eventos de tarea llevan ambos identificadores; los de instancia solo el de la instancia.
- `event_source` indica el origen: `USER`, `SYSTEM` o `SYNC`.
- El motivo de una suspensión o cancelación se guarda en `details`.
- La tabla es append-only: no se actualizan ni borran filas.
- `occurrence_key` evita duplicar hechos periódicos aunque el scheduler los procese nuevamente.
- `workflow_instances` agrega `suspended_at`, `cancelled_at` y `completed_at`.

Eventos de instancia iniciales: `WORKFLOW_CREATED`, `WORKFLOW_SUSPENDED`, `WORKFLOW_RESUMED`, `WORKFLOW_CANCELLED`, `WORKFLOW_COMPLETED`, `WORKFLOW_REPROGRAMMED`. Los eventos periódicos `TASK_DUE_SOON` y `TASK_OVERDUE` se registran con origen `SYSTEM`, independientemente de que su notificación esté habilitada.

## Alternativas consideradas

- **Mantener `task_events` y agregar una tabla de eventos de instancia:** dos historiales que habría que unir para mostrar la línea de tiempo.
- **Tabla `workflow_suspensions`** como en el modelo completo: útil si se necesita consultar períodos de suspensión; se pospone hasta que se decida el efecto de la suspensión sobre los plazos.

## Consecuencias

- El historial completo de un remate se obtiene con una sola consulta por instancia.
- `event_type` no tiene restricción CHECK: los tipos válidos se definen en el dominio.
