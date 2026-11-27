# Notificaciones y Panel de control

## 1. Objetivo

El sistema de notificaciones informa cambios relevantes del workflow y de sus tareas sin depender de correo electrónico. Los avisos se guardan en la base de datos, aparecen en la campana de la aplicación y permanecen en el historial incluso después de que el usuario los marca como leídos.

La configuración se administra desde **Panel de control > Notificaciones**. Solamente los usuarios con rol `ADMIN` pueden consultar o publicar cambios en las reglas.

## 2. Canales disponibles

El canal interno es el canal autoritativo:

- **Notificación interna:** se muestra en la campana de la aplicación.

Web Push está implementado como canal opcional para instalaciones compatibles de
Chrome y Edge. La persona lo activa en **Mi perfil** para cada dispositivo. El
mensaje del sistema es genérico; el detalle permanece en la aplicación y requiere
sesión. Para habilitarlo, se deben revisar y aplicar `sql/migrations/0018_web_push.sql`
y configurar `PUSH_VAPID_SUBJECT`, `PUSH_VAPID_PUBLIC_KEY` y
`PUSH_VAPID_PRIVATE_KEY` en API, worker y scheduler. Si no se configuran, el canal
permanece desactivado y siguen funcionando las notificaciones internas.

Genera las claves una sola vez por ambiente desde `apps/api` con
`node node_modules/web-push/src/cli.js generate-vapid-keys`. Guarda la clave
privada solo en variables de entorno seguras y no la cambies sin planificar la
renovación de las suscripciones. El endpoint del navegador y las claves de
suscripción son datos sensibles; no deben copiarse a logs o fixtures.

El SQL de push se aplicó en la base local de desarrollo el 2026-11-26 con
autorización del usuario. En otros ambientes requiere revisión y aprobación.
El snapshot consolidado de `0018_web_push.sql` se encuentra en
`sql/migrations/meta/0018_snapshot.json`. Reconcilia el esquema Drizzle con las
migraciones manuales 0010–0018. `db:generate` confirma que no quedan cambios de
esquema pendientes; la comprobación se realizó sin aplicar SQL a la base.

Para pruebas desde el túnel HTTPS de VS Code, configura en `apps/api/.env`
`WEB_ADDITIONAL_ORIGIN` con el origen exacto del enlace (sin barra final). La API
mantiene `WEB_ORIGIN=http://localhost:4200` y acepta escrituras únicamente desde
esos dos orígenes explícitos. Reinicia la API cuando cambie el enlace del túnel.

No se envían correos todavía. Nodemailer o SMTP no forman parte del flujo activo actual.

## 3. Eventos configurables

Cada versión de plantilla de workflow tiene un conjunto versionado de reglas. Todas las reglas pueden activarse o desactivarse desde el Panel de control.

| Regla                   | Cuándo se activa                                  | Destinatarios                                                 | Momento                                                                                        |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `TASK_ASSIGNED`         | Una tarea se activa o se asigna                   | Titular actual de la tarea                                    | Inmediato, después de confirmar el evento                                                      |
| `TASK_REMINDER`         | Una tarea abierta tiene fecha de vencimiento      | Titular actual de la tarea                                    | La cantidad de horas configurada antes del vencimiento                                         |
| `TASK_ESCALATION`       | Una tarea abierta se aproxima al vencimiento      | Todos los usuarios activos con rol `ADMIN` o `LEGAL_REVIEWER` | La cantidad de horas configurada antes del vencimiento                                         |
| `TASK_OVERDUE`          | Una tarea abierta alcanza su fecha de vencimiento | Titular actual de la tarea                                    | En el vencimiento; si se recalcula y ya está vencida, se programa para procesamiento inmediato |
| `TASK_COMPLETED`        | Una tarea se completa                             | Titular de la tarea completada                                | Inmediato, después de confirmar la operación                                                   |
| `WORKFLOW_SUSPENDED`    | El workflow se suspende                           | Todos sus participantes activos                               | Inmediato, después de confirmar la suspensión                                                  |
| `WORKFLOW_RESUMED`      | El workflow se reanuda                            | Todos sus participantes activos                               | Inmediato, después de confirmar la reanudación                                                 |
| `WORKFLOW_CANCELLED`    | El workflow se cancela                            | Todos sus participantes activos                               | Inmediato, después de confirmar la cancelación                                                 |
| `WORKFLOW_REPROGRAMMED` | Se aplica una nueva fecha de remate               | Todos sus participantes activos                               | Inmediato, después de confirmar la reprogramación                                              |

Los destinatarios de eventos de workflow se obtienen con `DISTINCT`, por lo que una persona que ocupe más de una participación recibe un solo aviso por evento.

## 4. Reglas de tiempo

Solo `TASK_REMINDER` y `TASK_ESCALATION` permiten configurar anticipación. El Panel de control muestra el valor en horas y lo persiste internamente en minutos.

Valores iniciales:

- Recordatorio al titular: 48 horas antes.
- Escalamiento a administración y legal: 24 horas antes.
- Tarea vencida: al momento del vencimiento.

Una tarea genera avisos programados solamente si:

- Tiene titular.
- Tiene fecha de vencimiento.
- Está en estado `READY` o `IN_PROGRESS`.
- La regla correspondiente está activa.

Si la hora de un recordatorio o escalamiento ya pasó al momento de programarlo, ese aviso previo no se genera retroactivamente. El aviso de vencimiento sí se programa inmediatamente cuando la tarea ya está vencida.

## 5. Cambios de estado de una tarea

### Activación o asignación

Se crea la notificación inmediata de asignación y se programan recordatorio, escalamiento y vencimiento según las reglas vigentes.

### Cambio de titular, fecha o reanudación

Los jobs pendientes anteriores se cancelan y se generan otros con el titular, fecha y reglas actuales. Esto evita que un antiguo titular reciba un aviso futuro.

### Suspensión

Se cancelan los jobs pendientes de la tarea. La suspensión no congela ni desplaza el tiempo: al reanudar se vuelve a evaluar la fecha original o la fecha recalculada por la operación de reprogramación.

### Cancelación o finalización

Se cancelan los jobs pendientes. Al completar, además, se crea el aviso `TASK_COMPLETED` cuando su regla está activa.

## 6. Persistencia, lectura y navegación

Las notificaciones creadas se guardan en `notifications`. No desaparecen al cerrar sesión, recargar la página o reiniciar los procesos.

Estados visibles:

- **No leída:** incrementa el contador de la campana.
- **Leída:** permanece en el historial, pero deja de incrementar el contador.

El usuario puede marcar una notificación individual o usar **Marcar todas como leídas**.

Al hacer clic:

- Una notificación asociada a una tarea abre el workflow y abre directamente el detalle de esa tarea.
- Una notificación general del workflow abre el workflow correspondiente.
- Antes de navegar, la notificación se marca como leída.

El frontend mantiene el contador mediante Server-Sent Events. La conexión informa cambios aproximadamente cada 15 segundos y existe una consulta de respaldo cada 60 segundos.

## 7. Panel de control

Ruta: `/panel-de-control`

Permiso requerido: `ADMIN`.

El panel permite:

1. Elegir la versión de plantilla de workflow cuando existe más de una.
2. Activar o desactivar cualquiera de los nueve eventos.
3. Configurar en horas la anticipación de recordatorios y escalamientos.
4. Publicar los cambios como una nueva versión inmutable de reglas.

### Publicación de cambios

Al pulsar **Publicar cambios** se ejecuta una operación transaccional:

1. Se bloquea el conjunto publicado actual.
2. Se marca como no publicado.
3. Se crea un conjunto con número de versión incrementado.
4. Se copian los nueve valores enviados desde el panel.
5. Los workflows asociados al conjunto anterior pasan al nuevo.
6. Después de confirmar la transacción, se cancelan y regeneran los jobs pendientes de sus tareas abiertas.

Por lo tanto, los cambios afectan:

- Todos los eventos nuevos.
- Los recordatorios, escalamientos y vencimientos todavía pendientes de tareas abiertas existentes.

No afectan:

- Notificaciones ya creadas.
- Avisos previos cuya hora ya pasó.
- Tareas completadas o canceladas.

## 8. Procesamiento técnico

El sistema separa eventos de negocio, jobs técnicos y notificaciones visibles.

### Outbox

Cada evento de workflow se registra dentro de la misma transacción que modifica el workflow. En esa transacción también se inserta una fila en `notification_outbox`. Los efectos se procesan solamente después del commit, por lo que una operación revertida no envía avisos.

El worker consulta hasta 25 filas por ciclo, usa bloqueo con lease de 60 segundos y `FOR UPDATE SKIP LOCKED`. Cuando no hay trabajo espera 5 segundos. Si falla una fila, libera el bloqueo, registra una causa sanitizada y reprograma el intento un minuto después.

### Scheduler

Los avisos con fecha futura viven en `notification_jobs`. El scheduler consulta trabajos vencidos cada 15 segundos y procesa lotes de hasta 25.

Cada job tiene:

- Estado `PENDING`, `PROCESSING`, `COMPLETED`, `CANCELLED` o `FAILED`.
- Lease de 60 segundos para recuperar trabajos abandonados.
- Máximo de 5 intentos.
- Backoff exponencial en minutos antes del siguiente intento.

Antes de materializar un aviso, el scheduler confirma que la tarea siga abierta y que el destinatario siga siendo válido. Si no, cancela el job.

### Idempotencia

Las notificaciones y jobs usan claves de deduplicación únicas. Un reintento del mismo evento no crea una segunda notificación para el mismo usuario.

## 9. Tablas relacionadas

- `notification_rule_sets`: versiones de reglas por versión de plantilla.
- `notification_rules`: activación y anticipación de cada evento.
- `workflow_notification_rule_sets`: conjunto de reglas asociado a cada instancia.
- `notification_outbox`: eventos pendientes de materialización.
- `notification_jobs`: avisos futuros, reintentos y estado técnico.
- `notifications`: avisos permanentes visibles para usuarios.
- `workflow_events`: historial de negocio que origina los efectos.

La columna física del tipo de evento se llama `event_type`; no se utiliza `trigger` como nombre de columna SQL.

## 10. Procesos requeridos

En el servidor deben ejecutarse por separado:

```powershell
cd apps/api
npm run notifications:worker:start
npm run notifications:scheduler:start
```

En desarrollo se pueden ejecutar:

```powershell
cd apps/api
npm run notifications:worker
npm run notifications:scheduler
```

La API por sí sola permite consultar y marcar notificaciones, pero no reemplaza al worker ni al scheduler. Si estos procesos no están activos, los eventos quedan persistidos y se procesan cuando vuelvan a iniciar.

## 11. API

Endpoints para usuarios autenticados:

- `GET /api/notifications`: listado paginado.
- `GET /api/notifications/unread-count`: cantidad no leída.
- `GET /api/notifications/stream`: actualizaciones SSE.
- `POST /api/notifications/:notificationId/read`: marcar una notificación propia.
- `POST /api/notifications/read-all`: marcar todas como leídas.

Endpoints exclusivos para `ADMIN`:

- `GET /api/notification-rules`: conjuntos publicados.
- `PUT /api/notification-rules/:ruleSetId`: publicar una nueva versión completa.

La actualización exige exactamente una regla por cada evento conocido. No acepta reglas parciales ni eventos duplicados.

## 12. Diagnóstico básico

Si no aparecen notificaciones, revisar en este orden:

1. Que el evento esté activo en **Panel de control > Notificaciones**.
2. Que el workflow tenga un conjunto en `workflow_notification_rule_sets`.
3. Que el destinatario esté activo y corresponda a la regla.
4. Que el worker y scheduler estén ejecutándose.
5. Que `notification_outbox` no tenga filas con `last_error`.
6. Que `notification_jobs` no esté en `FAILED` o haya sido cancelado por cambio de estado o titular.
7. Que la notificación no haya sido creada previamente con la misma clave de deduplicación.

Las reglas de configuración se aplican hacia adelante. Publicar una nueva versión también reconstruye los avisos futuros de tareas abiertas, pero nunca reescribe el historial de notificaciones ya emitidas.
