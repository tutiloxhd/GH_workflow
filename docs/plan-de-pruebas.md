# Plan de pruebas de la fase 1

Este documento describe cómo verificar el MVP y sirve como bitácora de ejecución. El foco inicial
es el Sprint 5, reprogramación desde `admin_new`, pero la estructura permite incorporar los demás
sprints sin perder trazabilidad.

## 1. Reglas de ejecución

- Usar solamente datos sintéticos o las bases locales de pruebas.
- No ejecutar pruebas contra QA, producción ni una base remota.
- `admin_new` es de solo lectura para la aplicación.
- Cualquier prueba que modifique incluso una copia local de `admin_new` requiere autorización previa
  y explícita. Debe registrar el valor anterior y restaurarlo al terminar.
- No ejecutar migraciones, seeds ni escrituras manuales en una base compartida.
- No instalar ni actualizar dependencias para ejecutar este plan.
- Cada ejecución debe anotar fecha, ambiente, responsable, resultado y evidencia.

## 2. Ambientes

### 2.1 Automatizado, recomendado

Las pruebas de integración usan `DB_TEST_NAME` y una fuente independiente
`<DB_TEST_NAME>_admin_new`. La fuente se crea con la réplica mínima definida en
`apps/api/test/admin-new-source-fixture.ts`; nunca consulta la base real `admin_new`.

Requisitos:

- Node.js y dependencias del repositorio ya instaladas.
- MySQL o MariaDB local disponible.
- `.env` configurado con `DB_TEST_NAME` distinto de `DB_NAME` y `ADMIN_NEW_DB_NAME`.
- Esquema de pruebas existente y actualizado por el procedimiento aprobado del proyecto.

### 2.2 Demostración local opcional

Usa una copia descartable de `admin_new`, nunca la fuente real. Antes de realizarla se debe obtener
autorización para escribir en esa copia y definir una propiedad sintética o prescindible.

## 3. Verificaciones automáticas

Ejecutar desde `apps/api`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --run test/admin-new-sync.test.ts
npm.cmd test -- --run test/workflow-engine.test.ts
npm.cmd test
npm.cmd run build
```

Resultado esperado:

- TypeScript, lint, formato y build terminan sin errores.
- Las pruebas del sincronizador y del motor terminan en verde.
- La suite completa termina en verde. Si falla una prueba no relacionada, se registra por separado;
  no se declara aprobado el conjunto ocultando el fallo.

## 4. Matriz de pruebas de reprogramación

| ID    | Caso                           | Preparación y acción                                                                                | Resultado esperado                                                                                                                        |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RP-01 | Cambio de fecha de remate      | Crear propiedad aceptada con workflow abierto; cambiar `r1`; ejecutar nuevamente el sincronizador.  | `properties.auction_at` toma la fecha nueva; el cambio queda `PROCESSED`; existe una reprogramación `SYNC/APPLIED`.                |
| RP-02 | Recálculo de tareas abiertas  | Antes de RP-01 guardar `due_at` de tareas `READY` e `IN_PROGRESS`.                              | Se recalculan conforme a su referencia y al reloj de la reprogramación; se crea un evento por cada valor modificado.                     |
| RP-03 | Tareas cerradas intactas       | Completar una tarea antes del cambio de fecha.                                                        | Estado, `due_at`, evidencia e historial previo de la tarea completada no cambian.                                                       |
| RP-04 | Tareas bloqueadas intactas     | Guardar los datos de una tarea `BLOCKED` antes de reprogramar.                                      | La tarea bloqueada no cambia ni genera evento de recálculo.                                                                              |
| RP-05 | Workflow suspendido            | Suspender un workflow sin nueva fecha; cambiar una fecha de origen; sincronizar.                      | La fecha se aplica; las tareas suspendidas abiertas recalculan sus plazos sin reactivarse; el workflow sigue `SUSPENDED`.               |
| RP-06 | Fecha de garantía             | Cambiar `r3` o su hora final.                                                                       | Solo los plazos cuya referencia es `GUARANTEE_PAYMENT_AT` usan la fecha nueva; las demás reglas conservan su referencia.               |
| RP-07 | Fecha de devolución           | Cambiar `r4`.                                                                                       | Los plazos con referencia `GUARANTEE_RETURN_AT` se recalculan.                                                                          |
| RP-08 | Fecha de pago de saldo         | Cambiar `r5`.                                                                                       | Los plazos con referencia `BALANCE_PAYMENT_AT` se recalculan.                                                                           |
| RP-09 | Fecha eliminada                | Cambiar una fecha de negocio válida a vacía o nula.                                                 | La copia local queda en `NULL`; las tareas abiertas que dependen de ella quedan con `due_reference_at` y `due_at` nulos.            |
| RP-10 | Varias fechas en un ciclo      | Cambiar dos o más fechas de referencia antes de sincronizar.                                         | Se aplican juntas en una transacción y cada plazo se calcula con la referencia correspondiente.                                          |
| RP-11 | Idempotencia                   | Ejecutar otra sincronización sin modificar el origen.                                                | No se crean nuevos cambios, reprogramaciones ni eventos; los vencimientos no vuelven a moverse.                                           |
| RP-12 | Recuperación de pendiente     | Dejar una reprogramación válida en `PENDING` y ejecutar el sincronizador sin otro cambio de hash. | El pendiente se retoma y termina `APPLIED`; el cambio de origen termina `PROCESSED`.                                                  |
| RP-13 | Fallo durante aplicación      | Forzar un error controlado dentro de la transacción de prueba.                                       | No quedan fechas o vencimientos aplicados parcialmente; el cambio permanece recuperable y la ejecución informa `REPROGRAMMING_FAILED`. |
| RP-14 | Concurrencia                   | Lanzar dos sincronizaciones simultáneas.                                                             | Solo una adquiere el cursor; no hay duplicados ni doble recálculo.                                                                       |
| RP-15 | Workflow cerrado               | Reprogramar después de completar o cancelar el workflow, según el escenario aprobado.               | No se reabren tareas ni cambia un estado cerrado; cualquier actualización de la copia de origen queda trazada.                           |
| RP-16 | Trazabilidad                   | Consultar cambio, reprogramación y eventos después de RP-01.                                        | Se conserva valor anterior, valor nuevo, `source_change_id`, origen `SYNC`, fecha de detección y fecha de aplicación.               |
| RP-17 | Cambio no temporal simultáneo | Cambiar fecha y comuna en el mismo ciclo.                                                             | La comuna y la fecha se aplican; se registran cambios separados sin perder ninguno.                                                       |
| RP-18 | Valor inválido                | Ingresar una fecha de origen con formato inválido en la fuente de pruebas.                           | No se inventa una fecha; se registra la incidencia correspondiente y no se corrompen los datos vigentes.                                  |

## 5. Verificación mediante SQL de solo lectura

Reemplazar los parámetros por identificadores de la base de pruebas. Estas consultas son `SELECT` y
no modifican datos.

### 5.1 Cambio de origen

```sql
SELECT
  id,
  property_id,
  change_type,
  status,
  previous_values,
  current_values,
  detected_at,
  processed_at,
  error_message
FROM property_source_changes
WHERE property_id = ?
ORDER BY id;
```

Debe existir `AUCTION_DATE_CHANGED` con los valores anterior y nuevo. Al terminar correctamente, su
estado debe ser `PROCESSED`.

### 5.2 Reprogramación

```sql
SELECT
  id,
  workflow_instance_id,
  source_change_id,
  previous_auction_at,
  new_auction_at,
  origin,
  status,
  created_at,
  applied_at,
  error_message
FROM workflow_reprogrammings
WHERE workflow_instance_id = ?
ORDER BY id;
```

Debe existir exactamente una fila nueva con `origin = 'SYNC'`, `status = 'APPLIED'` y el
`source_change_id` correspondiente.

### 5.3 Tareas y vencimientos

```sql
SELECT
  id,
  status,
  due_reference,
  due_reference_at,
  due_offset_days,
  due_offset_minutes,
  due_at
FROM task_instances
WHERE workflow_instance_id = ?
ORDER BY id;
```

Comparar esta salida antes y después. Solo las tareas abiertas deben recalcularse. Las tareas
completadas, canceladas y bloqueadas deben conservar sus valores.

### 5.4 Historial

```sql
SELECT
  id,
  task_instance_id,
  event_type,
  event_source,
  details,
  occurred_at
FROM workflow_events
WHERE workflow_instance_id = ?
  AND event_type IN ('WORKFLOW_REPROGRAMMED', 'TASK_DUE_DATE_RECALCULATED')
ORDER BY id;
```

Debe existir un `WORKFLOW_REPROGRAMMED` y un `TASK_DUE_DATE_RECALCULATED` por cada vencimiento que
realmente cambió. Todos deben tener `event_source = 'SYNC'`.

## 6. Demostración de punta a punta

No ejecutar esta sección sin autorización previa para modificar una copia local de `admin_new`.

1. Elegir una propiedad aceptada de prueba con workflow abierto.
2. Registrar su identificador, fecha original y vencimientos actuales.
3. Ejecutar el sincronizador una vez y comprobar que no existan pendientes anteriores.
4. Modificar únicamente la fecha elegida en la copia local autorizada.
5. Ejecutar `npm.cmd run sync -- --once` desde `apps/api`.
6. Verificar las cuatro consultas de la sección 5.
7. Ejecutar nuevamente el sincronizador sin cambios y comprobar idempotencia.
8. Restaurar el valor original en la copia local.
9. Ejecutar nuevamente el sincronizador. La restauración es otro cambio real y debe producir una
   nueva reprogramación trazable.
10. Guardar evidencia y confirmar que no queden cambios o reprogramaciones en `PENDING`.

La restauración no elimina el historial: genera el registro inverso, preservando la auditoría.

## 7. Criterios de aprobación del Sprint 5

El Sprint 5 se considera aprobado cuando:

- RP-01 a RP-18 están ejecutados o tienen una justificación explícita para quedar pendientes.
- Las pruebas automáticas relevantes están en verde.
- No existen escrituras en el origen real `admin_new`.
- No quedan reprogramaciones válidas abandonadas en `PENDING`.
- No se modifican tareas cerradas ni se reabren workflows.
- El historial permite reconstruir qué cambió, cuándo, desde qué origen y qué vencimientos afectó.
- La repetición del sincronizador es idempotente.
- Los fallos no dejan actualizaciones parciales.

## 8. Registro de ejecuciones

Agregar una fila por cada sesión de prueba.

| Fecha      | Ambiente               | Responsable | Casos                                           | Resultado             | Evidencia o incidencia                                                                                        |
| ---------- | ---------------------- | ----------- | ----------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Local, bases de prueba | Codex       | RP-01, RP-02, RP-11, RP-12, RP-14, RP-16, RP-17 | Parcialmente aprobado | `admin-new-sync.test.ts`: 17/17. Suite completa: 136/138; fallos pendientes en `database-schema.test.ts`. |

## 9. Pendientes conocidos

- Automatizar cobertura explícita de RP-05 a RP-10, RP-13, RP-15 y RP-18.
- Resolver los dos fallos actuales de `database-schema.test.ts`: orden esperado de tablas y error
  local `ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE`.
- Ejecutar la demostración de la sección 6 únicamente cuando exista autorización para escribir en
  una copia local descartable de `admin_new`.
