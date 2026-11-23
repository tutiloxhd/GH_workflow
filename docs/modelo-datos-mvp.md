# Modelo de datos del MVP

## 1. Propósito

Este documento explica el modelo de datos reducido para el primer MVP del sistema de workflow de remates judiciales.

Está dirigido a desarrolladores y agentes de IA que necesiten comprender el alcance antes de proponer o implementar cambios.

Este modelo es más pequeño que el modelo completo disponible en [`sql/schema.sql`](../sql/schema.sql). No se debe asumir que todas las tablas del esquema completo forman parte del primer MVP.

## 2. Alcance funcional

El primer MVP debe permitir:

- Registrar usuarios.
- Iniciar y cerrar sesiones.
- Asignar uno o más roles a un usuario.
- Sincronizar propiedades aceptadas desde `admin_new`.
- Crear una instancia de workflow para cada propiedad aceptada.
- Asignar participantes principales y suplentes.
- Mostrar el dashboard de tareas del usuario.
- Abrir el detalle de una tarea en un modal.
- Registrar el avance de una tarea.
- Completar formularios de evidencia.
- Marcar una tarea como completada.
- Activar las tareas siguientes cuando se cumplan sus dependencias.
- Detectar cambios de fecha desde `admin_new`.
- Reprogramar el workflow y recalcular vencimientos abiertos.
- Conservar historial de cambios relevantes.

## 3. Fuera del alcance inicial

No forman parte del primer MVP, salvo que una decisión posterior los incorpore explícitamente:

- Redis u otro broker externo.
- Cola genérica de jobs.
- Transactional outbox.
- Notificaciones por correo.
- Documentos y archivos versionados.
- Editor visual de plantillas.
- Ramas posteriores al resultado del remate.
- Reportería avanzada.
- Permisos granulares por capacidad.
- Automatizaciones documentales completas.

La exclusión de una capacidad no autoriza a simularla silenciosamente dentro de otra tabla.

## 4. Principios del modelo

1. `admin_new` es una fuente externa de solo lectura.
2. La sincronización debe ser idempotente.
3. Un usuario puede tener varios roles.
4. Los participantes de un workflow pueden ser titulares o suplentes.
5. Las definiciones de tareas están separadas de las tareas reales.
6. El avance depende de relaciones entre tareas, no de un único número de paso.
7. Las transiciones deben ejecutarse dentro de transacciones.
8. Las tareas completadas conservan su historia y no se reescriben al reprogramar.
9. Los formularios JSON deben validarse según la tarea; no se acepta JSON arbitrario.
10. El estado `OVERDUE` no se almacena como estado de ejecución; se deriva desde `due_at`.

## 5. Diagrama relacional

```mermaid
erDiagram
    USERS {
        bigint id PK
        varchar name
        varchar email UK
        varchar password_hash
        varchar rut
        int admin_new_user_id UK
        bigint region_id FK
        varchar status
    }

    REGIONS {
        bigint id PK
        varchar name UK
    }

    USER_SESSIONS {
        bigint id PK
        bigint user_id FK
        char token_hash UK
        datetime expires_at
        datetime revoked_at
    }

    ROLES {
        bigint id PK
        varchar code UK
        varchar name
    }

    USER_ROLES {
        bigint user_id PK,FK
        bigint role_id PK,FK
        bigint assigned_by FK
    }

    PROPERTIES {
        bigint id PK
        bigint admin_new_id UK
        varchar title
        varchar address
        datetime auction_at
        datetime source_updated_at
        char source_hash
    }

    SYNC_CURSORS {
        bigint id PK
        varchar source_code UK
        datetime last_source_updated_at
        bigint last_source_id
    }

    SYNC_EXECUTIONS {
        bigint id PK
        varchar source_code
        varchar status
        datetime started_at
        datetime completed_at
        int workflows_started
    }

    SYNC_ISSUES {
        bigint id PK
        bigint sync_execution_id FK
        bigint admin_new_id
        varchar severity
        varchar code
    }

    PROPERTY_SOURCE_CHANGES {
        bigint id PK
        bigint property_id FK
        varchar change_type
        json previous_values
        json current_values
        varchar status
        bigint processed_by FK
    }

    WORKFLOW_TEMPLATES {
        bigint id PK
        varchar code UK
        varchar name
        int version
        boolean is_active
    }

    TASK_DEFINITIONS {
        bigint id PK
        bigint workflow_template_id FK
        varchar code
        varchar name
        varchar responsible_role
        varchar due_reference
        int due_offset_minutes
        boolean requires_evidence
    }

    TASK_DEPENDENCIES {
        bigint task_definition_id PK,FK
        bigint depends_on_task_definition_id PK,FK
    }

    WORKFLOW_INSTANCES {
        bigint id PK
        bigint property_id FK
        bigint workflow_template_id FK
        varchar status
        int lock_version
    }

    WORKFLOW_PARTICIPANTS {
        bigint id PK
        bigint workflow_instance_id FK
        bigint user_id FK
        varchar participant_type
        varchar assignment_type
        datetime valid_from
        datetime valid_to
    }

    WORKFLOW_REPROGRAMMINGS {
        bigint id PK
        bigint workflow_instance_id FK
        bigint source_change_id FK
        datetime previous_auction_at
        datetime new_auction_at
        varchar status
    }

    TASK_INSTANCES {
        bigint id PK
        bigint workflow_instance_id FK
        bigint task_definition_id FK
        bigint assigned_user_id FK
        bigint backup_user_id FK
        varchar status
        datetime due_at
    }

    TASK_EVIDENCE_SUBMISSIONS {
        bigint id PK
        bigint task_instance_id FK
        bigint submitted_by FK
        json form_data
    }

    WORKFLOW_EVENTS {
        bigint id PK
        bigint workflow_instance_id FK
        bigint task_instance_id FK
        bigint actor_user_id FK
        varchar event_type
        varchar event_source
        json details
    }

    USERS ||--o{ USER_SESSIONS : inicia
    USERS ||--o{ USER_ROLES : posee
    ROLES ||--o{ USER_ROLES : asigna

    PROPERTIES ||--o{ PROPERTY_SOURCE_CHANGES : registra
    SYNC_EXECUTIONS ||--o{ SYNC_ISSUES : informa
    USERS o|--o{ PROPERTY_SOURCE_CHANGES : revisa
    PROPERTIES ||--|| WORKFLOW_INSTANCES : origina

    WORKFLOW_TEMPLATES ||--o{ TASK_DEFINITIONS : define
    WORKFLOW_TEMPLATES ||--o{ WORKFLOW_INSTANCES : instancia

    TASK_DEFINITIONS ||--o{ TASK_DEPENDENCIES : sucesora
    TASK_DEFINITIONS ||--o{ TASK_DEPENDENCIES : requisito
    TASK_DEFINITIONS ||--o{ TASK_INSTANCES : materializa

    WORKFLOW_INSTANCES ||--o{ WORKFLOW_PARTICIPANTS : asigna
    USERS ||--o{ WORKFLOW_PARTICIPANTS : participa

    WORKFLOW_INSTANCES ||--o{ WORKFLOW_REPROGRAMMINGS : reprograma
    PROPERTY_SOURCE_CHANGES o|--o{ WORKFLOW_REPROGRAMMINGS : provoca

    WORKFLOW_INSTANCES ||--o{ TASK_INSTANCES : contiene
    USERS o|--o{ TASK_INSTANCES : responsable

    TASK_INSTANCES ||--o{ TASK_EVIDENCE_SUBMISSIONS : evidencia
    USERS ||--o{ TASK_EVIDENCE_SUBMISSIONS : registra

    WORKFLOW_INSTANCES ||--o{ WORKFLOW_EVENTS : audita
    TASK_INSTANCES o|--o{ WORKFLOW_EVENTS : detalla
    USERS o|--o{ WORKFLOW_EVENTS : ejecuta
```

## 6. Tablas del MVP

El modelo contiene 19 tablas agrupadas en cuatro áreas. `login_attempts` se agregó en el sprint 1 (migración `0001_login_attempts`) y `sync_issues` en el sprint 4 (migración `0004_sync_issues`).

La definición ejecutable es el esquema Drizzle de `apps/api/src/platform/database/schema/` y el SQL generado en [`sql/migrations/`](../sql/migrations/). Si este documento y el esquema difieren, se corrige el que esté equivocado en el mismo cambio.

### 6.1 Autenticación y roles

#### `users`

Cuenta de una persona.

Campos principales:

- `id`: identificador interno.
- `name`: nombre visible.
- `email`: identificador único de acceso.
- `password_hash`: hash seguro; nunca contraseña en texto plano.
- `status`: `ACTIVE`, `INACTIVE` o `BLOCKED`.
- `rut`: RUT informado por `gh_agente_zona`; puede ser nulo en cuentas locales.
- `admin_new_user_id`: identificador del usuario importado desde `admin_new`, único para hacer
  idempotente la importación.
- `region_id`: región del agente; referencia a `regions`.
- `created_at`, `updated_at`.

#### `regions`

Catálogo simple de regiones con `id` y `name`. Se usa para relacionar agentes con la región que
determina su elegibilidad de asignación. La información de comuna de las propiedades sigue siendo
parte del expediente operacional y es independiente de este catálogo.

El registro de usuario no debe permitir que una persona se asigne libremente un rol privilegiado.

#### `user_sessions`

Sesiones revocables.

Campos principales:

- `user_id`.
- `token_hash`: solo se guarda el hash del token.
- `expires_at`.
- `revoked_at`.
- `created_at`.

El token real debe entregarse en una cookie segura y `HttpOnly` cuando se defina la estrategia de autenticación.

#### `login_attempts`

Intentos de inicio de sesión, exitosos y fallidos, por email normalizado. También se registran emails sin cuenta, para no revelar cuáles existen.

- `email`, `succeeded`, `attempted_at`.
- Índice `(email, attempted_at)`.

Con 5 fallos en los últimos 15 minutos posteriores al último acceso exitoso, el login se rechaza con `LOGIN_TEMPORARILY_LOCKED`. Mientras dura el bloqueo los intentos no se registran.

#### `roles`

Catálogo inicial:

- `ADMIN`.
- `MANAGER`.
- `BIDDER`.
- `LEGAL_REVIEWER`.

#### `user_roles`

Relación muchos a muchos entre usuarios y roles.

Clave primaria:

```text
(user_id, role_id)
```

También conserva cuándo y quién asignó el rol.

### 6.2 Integración con `admin_new`

#### `properties`

Copia operacional de los datos necesarios para ejecutar el workflow.

Campos relevantes:

- `admin_new_id`: identificador único del origen.
- Datos de ubicación y causa.
- `auction_at`.
- Fechas y monto de garantía.
- `source_updated_at`.
- `source_hash`.
- `last_synced_at`.

La restricción única sobre `admin_new_id` evita duplicados.

#### `sync_cursors`

Indica hasta qué punto fue revisado el sistema de origen.

Conserva:

- Fuente.
- Última fecha revisada.
- Último identificador revisado.
- Inicio y término de la última ejecución.
- Estado y error más reciente.

#### `sync_executions`

Historial operacional del sincronizador.

Estados:

- `RUNNING`.
- `SUCCEEDED`.
- `PARTIAL`.
- `FAILED`.

Registra filas leídas, creadas, actualizadas, workflows iniciados, advertencias y errores.

El cursor también hace de candado: una ejecución solo empieza si toma el cursor de forma atómica, así que dos procesos no corren a la vez.

#### `sync_issues`

Advertencias y errores de una ejecución: valores de origen que no se pudieron interpretar, filas duplicadas, la falta de hora del remate y los fallos de una propiedad. Se registran cuando la propiedad se procesa, no en cada ejecución.

#### `property_source_changes`

Cambios relevantes detectados en el origen.

Tipos:

- `PROPERTY_ACCEPTED`: `PROCESSED` si se inició el workflow; `IGNORED` si el remate ya ocurrió.
- `AUCTION_DATE_CHANGED`: cubre las cuatro fechas de referencia. Queda `PENDING` si el workflow está abierto (lo aplica la reprogramación); si no, se aplica y queda `PROCESSED`.
- `PROPERTY_DATA_CHANGED`: se aplica directamente.
- `NO_LONGER_ACCEPTED`: `PENDING` si el workflow está abierto, hasta que un ADMIN lo marca como revisado (`processed_by`).

Conserva valores anteriores y nuevos para trazabilidad. Reglas completas: [ADR 0007](./adr/0007-sincronizacion-admin-new.md).

### 6.3 Definición y ejecución del workflow

#### `workflow_templates`

Plantilla versionada del flujo.

Restricción:

```text
UNIQUE (code, version)
```

Aunque el MVP tenga una sola plantilla, su versión debe conservarse.

#### `task_definitions`

Definición de cada tarea de la plantilla.

Campos importantes:

- Código y nombre.
- Descripción.
- Rol responsable.
- Orden visual.
- Si requiere evidencia.
- Plazo base: referencia temporal (`due_reference`), días de calendario en Santiago (`due_offset_days`) y minutos (`due_offset_minutes`). Por defecto, 3 días desde la activación (migración `0002`).

Cada workflow copia este plazo a sus `task_instances`, donde se puede editar sin tocar la plantilla. Ver [ADR 0006](./adr/0006-reglas-del-motor.md).

Referencias temporales iniciales:

- `TASK_ACTIVATED_AT`.
- `AUCTION_AT`.
- `GUARANTEE_PAYMENT_AT`.
- `GUARANTEE_RETURN_AT`.
- `BALANCE_PAYMENT_AT`.

#### `task_dependencies`

Indica qué tareas deben completarse antes de activar otra.

Clave primaria:

```text
(task_definition_id, depends_on_task_definition_id)
```

No debe sustituirse por un único campo lineal de etapa.

#### `workflow_instances`

Ejecución real de una plantilla para una propiedad.

Estados iniciales:

- `ACTIVE`.
- `SUSPENDED`.
- `CANCELLED`.
- `COMPLETED`.

`lock_version` permite detectar actualizaciones concurrentes.

`UNIQUE (property_id)` garantiza un solo workflow por propiedad. `suspended_at`, `cancelled_at` y `completed_at` registran cuándo ocurrió cada cambio de estado.

En la fase 1 todas las tareas son manuales: `task_definitions` no distingue tareas automáticas.

#### `workflow_participants`

Participantes titulares y suplentes de la instancia.

Tipos de participante iniciales:

- `MANAGER`.
- `BIDDER`.
- `LEGAL_REVIEWER`.

Tipos de asignación:

- `PRIMARY`.
- `BACKUP`.

Las asignaciones no se sobrescriben. Cuando cambian, se completa `valid_to` y se crea una nueva fila.

#### `workflow_reprogrammings`

Registro de cada reprogramación.

Conserva:

- Fecha anterior y nueva.
- Cambio del origen que la produjo.
- Origen de la acción.
- Motivo.
- Usuario solicitante, si aplica.
- Estado y error.

Estados:

- `PENDING`.
- `APPLIED`.
- `FAILED`.
- `CANCELLED`.

### 6.4 Operación de tareas

#### `task_instances`

Tareas reales mostradas en el dashboard.

Estados:

- `BLOCKED`.
- `READY`.
- `IN_PROGRESS`.
- `SUSPENDED` (workflow suspendido sin nueva fecha; `status_before_suspension` guarda el estado al que vuelve).
- `COMPLETED`.
- `CANCELLED`.

Campos importantes:

- Responsable y suplente.
- Estado previo a una suspensión.
- Copia editable del plazo (`due_reference`, `due_offset_days`, `due_offset_minutes`).
- Fecha de vencimiento.
- Fecha de referencia usada para calcularla.
- Inicio y término.
- Usuario que completó.
- Versión de bloqueo optimista.

Una tarea vencida continúa en `READY` o `IN_PROGRESS`. Se considera vencida cuando:

```text
due_at < ahora
AND status IN ('READY', 'IN_PROGRESS')
```

#### `task_evidence_submissions`

Formulario de evidencia asociado a una tarea.

Campos:

- Tarea.
- Usuario que envió.
- Datos del formulario en JSON.
- Fechas de envío y actualización.

Para el MVP puede existir un formulario vigente por tarea:

```text
UNIQUE (task_instance_id)
```

El backend debe validar `form_data` según el código de la definición de la tarea.

#### `workflow_events`

Historial append-only de la instancia y de sus tareas (ver [ADR 0005](./adr/0005-historial-de-workflow.md)).

- `workflow_instance_id` es obligatorio.
- `task_instance_id` es opcional: los eventos de instancia no llevan tarea.
- `event_source`: `USER`, `SYSTEM` o `SYNC`.

Eventos de instancia iniciales:

- `WORKFLOW_CREATED`.
- `WORKFLOW_SUSPENDED`.
- `WORKFLOW_RESUMED`.
- `WORKFLOW_CANCELLED`.
- `WORKFLOW_COMPLETED`.
- `WORKFLOW_REPROGRAMMED`.

Eventos de tarea iniciales:

- `TASK_CREATED`.
- `TASK_ACTIVATED`.
- `TASK_ASSIGNED`.
- `TASK_REASSIGNED`.
- `TASK_STARTED`.
- `TASK_PROGRESS_UPDATED`.
- `EVIDENCE_SUBMITTED`.
- `TASK_COMPLETED`.
- `TASK_DUE_DATE_RECALCULATED`.
- `TASK_CANCELLED`.

## 7. Resolución de responsables y suplentes

La asignación inicial de una tarea debe resolverse en este orden:

1. Reasignación explícita de la tarea, si existe.
2. Participante principal vigente del tipo requerido.
3. Usuario activo con el rol requerido.
4. Administrador activo como fallback, si negocio lo aprueba.

El suplente se obtiene desde el participante `BACKUP` vigente correspondiente.

`task_instances.assigned_user_id` y `backup_user_id` conservan la asignación efectiva de esa tarea. Esto facilita el dashboard y evita que un cambio futuro altere tareas ya completadas.

## 8. Completar una tarea

Cuando el usuario marca una tarea como completada, el backend debe ejecutar en una sola transacción:

1. Autenticar al usuario.
2. Bloquear la tarea o instancia necesaria.
3. Verificar que el workflow siga activo.
4. Verificar que la tarea esté `READY` o `IN_PROGRESS`.
5. Verificar que el usuario tenga autorización.
6. Verificar evidencia obligatoria.
7. Cambiar la tarea a `COMPLETED`.
8. Registrar `completed_at` y `completed_by`.
9. Insertar `TASK_COMPLETED` en `workflow_events`.
10. Buscar tareas bloqueadas cuyas dependencias estén completas.
11. Cambiarlas a `READY`.
12. Registrar `TASK_ACTIVATED` por cada una.
13. Completar el workflow si no quedan tareas obligatorias abiertas.
14. Confirmar la transacción.

El frontend no debe modificar directamente estados, dependencias ni campos de finalización.

## 9. En curso y evidencia

No hay porcentaje de avance: `progress_percentage` se eliminó en la migración `0003`. Una tarea `READY` puede marcarse `IN_PROGRESS` y luego completarse.

- Una tarea con evidencia obligatoria no puede completarse sin un formulario válido guardado.
- Los formularios por código de tarea se definen en `apps/api/src/modules/workflow/domain/evidence-forms.ts`; son básicos y provisorios.
- La plantilla v2 exige evidencia en «Retirar Vale Vista», «Registrar evidencia» y «Registrar resultado».

## 10. Sincronización

El sincronizador se ejecuta periódicamente (cada 60 s, provisorio) en un proceso separado del servidor HTTP (`npm run sync` en `apps/api`).

Para una propiedad nueva aceptada:

1. Consulta `admin_new` con credenciales de solo lectura y sesión `READ ONLY`.
2. Interpreta fechas, horas y montos guardados como texto; registra los inválidos en `sync_issues`.
3. Inserta `properties` con el hash de los valores de origen.
4. Si el remate es hoy o después (o se desconoce), crea una sola instancia de workflow, materializa las tareas y activa las que no tienen dependencias pendientes.
5. Registra el cambio y el resultado de la ejecución.

Si el hash no cambió, la propiedad no se vuelve a procesar.

La restricción única sobre `admin_new_id` y la unicidad correspondiente de la instancia deben impedir duplicados aunque el proceso se ejecute más de una vez.

## 11. Reprogramación

Cuando cambia la fecha del remate:

1. El sincronizador registra `AUCTION_DATE_CHANGED`.
2. Crea una reprogramación `PENDING`.
3. Bloquea la instancia dentro de una transacción.
4. Actualiza `properties.auction_at`.
5. Recalcula `due_at` solo en tareas abiertas cuya referencia cambió.
6. Conserva intactas las tareas completadas.
7. Registra un evento por cada vencimiento modificado.
8. Marca la reprogramación como `APPLIED`.
9. Confirma la transacción.

La fecha no debe sobrescribirse silenciosamente sin conservar valor anterior, valor nuevo y origen del cambio.

## 12. Consultas del dashboard

El dashboard debe consultar tareas asignadas al usuario como titular o suplente.

Ejemplo conceptual:

```sql
SELECT
    task_instance.id,
    task_definition.name,
    task_definition.description,
    task_instance.status,
    task_instance.due_at,
    property.title AS property_title,
    property.address
FROM task_instances AS task_instance
JOIN task_definitions AS task_definition
  ON task_definition.id = task_instance.task_definition_id
JOIN workflow_instances AS workflow_instance
  ON workflow_instance.id = task_instance.workflow_instance_id
JOIN properties AS property
  ON property.id = workflow_instance.property_id
WHERE (
    task_instance.assigned_user_id = :user_id
    OR task_instance.backup_user_id = :user_id
  )
  AND task_instance.status IN ('READY', 'IN_PROGRESS')
  AND workflow_instance.status = 'ACTIVE'
ORDER BY
  task_instance.due_at IS NULL,
  task_instance.due_at,
  task_instance.id;
```

El SQL definitivo depende de la librería de acceso a datos aprobada y no debe copiarse sin revisar índices y autorización.

## 13. Decisiones todavía pendientes

Ya resueltas: autenticación ([ADR 0003](./adr/0003-autenticacion.md)), validación ([ADR 0002](./adr/0002-validacion.md)), acceso a datos ([ADR 0001](./adr/0001-acceso-a-datos.md)) y reglas del motor: admin omnipotente, suplente, plazos y suspensión ([ADR 0006](./adr/0006-reglas-del-motor.md)).

Este documento no resuelve:

- Frecuencia definitiva del sincronizador (hoy, 60 s provisorios).
- Si las revisiones legales bloquean el avance.
- Plazos definitivos de cada tarea (hoy, 3 días provisorios).
- Estructura exacta de cada formulario de evidencia.
- Criterio definitivo para filas duplicadas en `admin_new` (hoy, la de mayor id, con advertencia).
- Si un remate ya ocurrido debe iniciar workflow, y qué hora usar cuando falta `hora_remate` (hoy: no se inicia; 00:00).

Un agente no debe tomar estas decisiones silenciosamente. Debe presentar alternativas y solicitar aprobación antes de incorporarlas al código o al esquema definitivo.
