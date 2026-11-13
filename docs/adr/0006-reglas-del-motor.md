# ADR 0006: Reglas del motor de workflow (fase 1)

- **Estado:** aceptado (2026-11-12); implementado en el sprint 2
- **Ámbito:** `apps/api/src/modules/workflow`

## Contexto

El motor debía implementarse con varias reglas que AGENTS.md marcaba como pendientes de negocio. El usuario que dirige el proyecto las definió para la fase 1; algunas son provisorias y pueden cambiar cuando negocio cierre su definición.

## Decisión

**Plantilla.** `REMATE_JUDICIAL` v1 (`sql/seeds/0002_workflow_template_v1.sql`) tiene las 15 tareas del flujo principal de la maqueta (pasos 2 a 16), sin ramas. La v2 (`0004`) es igual pero exige evidencia en tres tareas y es la activa. Una versión publicada no se modifica: los cambios se hacen en una versión nueva, y cada workflow conserva la suya.

**Tareas manuales.** Todas las tareas son manuales. Las que el diseño original consideraba automáticas (carta Vale Vista, envío al gerente general, alertas pre-remate) las ejecuta un ADMIN. No hay cola de jobs.

**Activación por dependencias.** Una tarea pasa de `BLOCKED` a `READY` cuando todas sus requisitos están `COMPLETED`; varias pueden activarse a la vez. El workflow pasa a `COMPLETED` cuando todas sus tareas lo están. Las revisiones legales no bloquean a otras tareas, pero sí el cierre (pendiente decidir si deben bloquear).

**Responsable.** Al activarse, una tarea queda a cargo de: titular vigente del rol en el workflow → primer usuario activo con el rol → primer ADMIN activo. Su suplente es el suplente vigente del rol.

**Administrador omnipotente.** Un ADMIN puede trabajar cualquier tarea y ejecutar cualquier comando, sin ser participante.

**Suplente.** Ve las tareas del titular. Si actúa en una (iniciar, avanzar o completar), pasa a ser el titular del rol en todo el workflow: se cierra la asignación anterior, se abre una nueva como `PRIMARY`, las tareas abiertas del rol pasan a su nombre y el puesto de suplente queda vacío (evento `PARTICIPANT_REPLACED_BY_BACKUP`).

**Plazos.**

- Por defecto, 3 días corridos desde la activación (provisorio).
- Cada tarea de cada workflow tiene su propia copia del plazo (referencia, días y minutos), editable por un ADMIN. La plantilla no cambia.
- Los días se suman en el calendario de America/Santiago conservando la hora local; luego se suman los minutos.
- Si la referencia es una fecha de negocio que falta, la tarea queda sin vencimiento.
- «Vencida» no es un estado: se deriva de `due_at` en tareas `READY` o `IN_PROGRESS`.

**Suspensión.** Solo ADMIN o LEGAL_REVIEWER.

- Con nueva fecha de remate: el workflow sigue `ACTIVE`; se actualiza `properties.auction_at`, se registra una reprogramación `APPLIED` y se recalculan los vencimientos abiertos.
- Sin fecha: el workflow pasa a `SUSPENDED` y sus tareas `READY`/`IN_PROGRESS` a `SUSPENDED` (se guarda el estado previo).
- Reanudar exige la nueva fecha: las tareas vuelven a su estado previo y se recalculan los vencimientos.
- Cancelar cierra el workflow y deja `CANCELLED` toda tarea no completada; no se reanuda.

**Recálculo de vencimientos** (al reprogramar o reanudar):

- referencia de negocio → nueva fecha de referencia + plazo;
- referencia de activación → el plazo vuelve a correr desde el momento del cambio;
- tareas bloqueadas, completadas o canceladas no cambian.

**Sin porcentaje de avance** (sprint 3). Una tarea solo se marca en curso o se completa; la columna `progress_percentage` se eliminó (migración `0003`).

**Evidencia** (sprint 3). Los formularios son básicos y provisorios, definidos en código (`domain/evidence-forms.ts`): la misma definición valida en la API y se entrega al frontend para dibujar el formulario. La plantilla v2 exige evidencia en «Retirar Vale Vista», «Registrar evidencia» y «Registrar resultado». Hay un formulario vigente por tarea; enviarlo de nuevo lo reemplaza. Enviar evidencia cuenta como actuar en la tarea (un suplente que la envía pasa a ser titular). El resultado del remate se registra en la evidencia, pero todavía no abre ramas.

**Concurrencia.** Cada comando corre en una transacción que bloquea la fila del workflow (`FOR UPDATE`); el rechazo de un comando revierte todo lo hecho en él. El inicio es idempotente por `UNIQUE(property_id)`.

## Alternativas consideradas

- **Plazo editable en la plantilla con nuevas versiones:** descartado por el usuario; se prefirió una copia editable por workflow.
- **Reanudar desplazando los vencimientos por la duración de la pausa:** descartado; se exige la nueva fecha.
- **Suplente que actúa solo en una tarea:** descartado; el reemplazo es definitivo para todo el rol.

## Consecuencias

- Cambiar el plazo por defecto o los pasos exige publicar una plantilla v2; los workflows existentes conservan la suya.
- Una fecha de remate ingresada a mano actualiza la copia local en `properties`; cuando exista la sincronización con `admin_new` (sprint 4), un cambio en el origen podrá sobrescribirla y generará su propia reprogramación.
- Pendientes: plazos definitivos por tarea, si las revisiones legales bloquean, ramas posteriores al resultado y formularios de evidencia.
