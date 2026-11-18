# ADR 0007: Sincronización con admin_new (fase 1)

- **Estado:** aceptado (2026-11-13); implementado en el sprint 4. Las reglas marcadas como provisorias esperan confirmación de negocio.
- **Ámbito:** `apps/api/src/modules/admin-new-sync`, `apps/api/src/entrypoints/sync.ts`

## Contexto

`admin_new` es un sistema externo. No se modifica: no tiene fecha de modificación, sus tablas hijas no tienen claves foráneas, los ids de `dato_propiedad.id_p` y `datos_lremate.idp` son TEXT, y las fechas y montos se guardan como texto.

Una muestra de la copia local (77 propiedades aceptadas, 13 nov 2026) confirmó estos formatos:

| Columna | Formato encontrado |
| --- | --- |
| `r1`, `r3`, `r4`, `r5` | `AAAA-MM-DD`; algunos vacíos o nulos |
| `r2` | pesos con puntos de miles (`8.100.000`) |
| `hora_remate` | `HH:MM` casi siempre; también `9:00`, `11.30`, vacío o nulo |
| `hora_garantia_desde/hasta` | TIME |

Solo una propiedad aceptada tenía dos filas en `dato_propiedad`, ambas con la misma fecha.

## Decisión

**Proceso separado.** `npm run sync` corre cada `SYNC_INTERVAL_SECONDS` (60 por defecto, provisorio), y `npm run sync -- --once` hace una sola ejecución. La siguiente ejecución empieza cuando termina la anterior. La API no dispara sincronizaciones: solo muestra su estado en `/api/sync/*`, para administradores.

**Solo lectura.** El adaptador (`persistence/admin-new-source.ts`) solo hace SELECT y declara la sesión `READ ONLY`. Admite credenciales propias (`ADMIN_NEW_DB_*`); en producción debe usar un usuario con solo SELECT sobre `propiedad`, `dato_propiedad`, `datos_lremate` y `estado_remate`. Los ids de las tablas hijas se comparan como texto (`IN ('13965', …)`), porque comparar TEXT con INT obliga a MySQL a recorrer la tabla. `estado_remate.id_r` se busca primero por `datos_lremate.id_dr`; la copia local también contiene filas relacionadas por `propiedad.id_propiedad`, que se usan como fallback solo cuando ese valor no corresponde a ningún `id_dr`. Se toma el estado con mayor `id_er` y se leen postor y pagador de forma independiente.

**Detección por hash.** Como el origen no tiene fecha de modificación, cada ejecución lee todas las aceptadas (`id_clasif = 7`, indexado) y compara el SHA-256 de sus valores de origen con `properties.source_hash`. Si no cambió, la propiedad no se procesa. El cursor guarda el estado, el último error y el mayor id leído, y también sirve de candado: un UPDATE condicional impide que dos procesos corran a la vez. Un candado de más de 15 minutos se considera abandonado.

**Filas duplicadas (provisorio).** Se usa la fila de mayor id y se registra una advertencia `DUPLICATE_*_ROWS`.

**Valores inválidos.** No se inventan. Un valor que no se puede interpretar queda en null y genera una advertencia en `sync_issues`. Las advertencias solo se registran cuando la propiedad se procesa (al ser nueva o al cambiar), no en cada ejecución.

**Fechas.** Se interpretan como hora de Santiago y se guardan en UTC.

- Remate: `r1` + `hora_remate`. Sin hora, se toma 00:00 y se advierte. Así los plazos medidos desde el remate quedan en el lado seguro.
- Pago de la garantía: `r3` + `hora_garantia_hasta`; sin hora, 00:00.
- Devolución de la garantía (`r4`) y pago del saldo (`r5`): 00:00.

**Inicio del workflow (provisorio).** Una propiedad aceptada sin workflow lo recibe cuando su remate es hoy o después, o cuando la fecha se desconoce. Un remate ya ocurrido se copia, pero no abre un flujo con todas sus tareas vencidas: el cambio queda `IGNORED` y un administrador puede iniciarlo desde «Propiedades sin workflow». Si después la fecha pasa a ser futura, la siguiente ejecución inicia el workflow. No hay duplicados: `properties.admin_new_id` y `workflow_instances.property_id` son únicos, y el inicio es idempotente.

**Asignación inicial desde `estado_remate`.** `pagador` (gestor) se vincula con un usuario interno activo de rol `MANAGER`, y `postor` con uno de rol `BIDDER`, por coincidencia exacta y única del nombre. Cada participante que tenga coincidencia se asigna al workflow activo aunque falte el otro. Si ambos se vinculan, se crean sus puestos primarios en el workflow antes de activar tareas y se completa automáticamente `ASSIGN_MANAGER_AND_BIDDER`; la tarea conserva su responsable interno y la auditoría identifica `ADMIN_NEW` como origen. Si un nombre no tiene coincidencia única, se registra una advertencia; la tarea continúa abierta hasta que ambos roles estén asignados desde el origen o manualmente.

**Nombres de las partes del remate.** Los valores originales de `postor` y `pagador` se conservan en la copia de `properties` y se muestran en el detalle del workflow junto a los responsables internos. No se usan como cuentas ni como responsables de tareas. Los nombres se actualizan con cada sincronización y no se incluyen en el historial JSON de cambios de propiedad.

**Cambios en propiedades ya copiadas.**

- Datos que no son fechas: se aplican y quedan como `PROPERTY_DATA_CHANGED`, con el valor anterior y el nuevo.
- Fechas de referencia (remate, garantía, devolución, saldo):
  - Si el workflow está abierto (`ACTIVE` o `SUSPENDED`), **no se sobrescriben**. Quedan como `AUCTION_DATE_CHANGED PENDING` para la reprogramación del sprint 5, que recalcula los plazos.
  - Si no hay workflow abierto, se aplican directamente.
- Una propiedad que deja de estar aceptada, o que desaparece del origen, genera `NO_LONGER_ACCEPTED` una sola vez. El workflow no se toca. Si está abierto, el cambio queda `PENDING` hasta que un administrador decide qué hacer con el workflow y lo marca como revisado (`processed_by`). Si vuelve a aceptarse, se registra `PROPERTY_ACCEPTED`.
- Las propiedades sintéticas de desarrollo (`admin_new_id` ≥ 9 000 000 000) se ignoran.

**Errores.** El fallo de una propiedad se registra como `ERROR` y no detiene el lote; la ejecución queda `PARTIAL`. Si no se puede leer admin_new, la ejecución queda `FAILED` y la siguiente lo reintenta.

## Consecuencias

- Migración `0004`: tabla `sync_issues`, `sync_executions.workflows_started` y `property_source_changes.processed_by`.
- Leer todas las aceptadas en cada ejecución es barato con el volumen actual (decenas de filas; la primera carga de 77 tardó 0,7 s y las siguientes, 0,2 s). Si crece mucho, o si admin_new agrega `updated_at` como propone la guía técnica, se pasa a lectura incremental con el cursor.
- La copia local de admin_new es una foto: casi todos sus remates ya ocurrieron, por lo que la primera carga copió 77 propiedades e inició 1 workflow.
- Pendiente de confirmar con negocio: la frecuencia, el criterio de la fila de mayor id, la regla de no iniciar remates pasados y la hora 00:00 cuando falta `hora_remate`.
