# ADR 0009: Administración de plantillas de flujo

- **Estado:** aceptado (2026-11-23)
- **Ámbito:** `apps/api/src/modules/workflow-templates`, `apps/web/src/app/pages/workflow-templates`

## Contexto

Las plantillas de flujo (`workflow_templates`, `task_definitions`, `task_dependencies`) se
cargaban solo con seeds SQL. Se pidió una pantalla de administración para crear, editar y
eliminar flujos sin romper la regla de AGENTS.md: «una versión publicada es inmutable».

## Decisión

Aprobada por el usuario que dirige el proyecto:

- **Ciclo de vida:** `DRAFT` → `PUBLISHED` → `ARCHIVED` (columna `status`, migración `0014`).
  Las filas existentes quedan `PUBLISHED`; el valor por omisión de la columna es `PUBLISHED`
  para que los seeds sigan cargando plantillas publicadas.
- **Editar = nueva versión.** Un borrador copia las tareas y dependencias de una versión
  existente (misma `code`, `version + 1`) o empieza vacío como flujo nuevo (versión 1). Solo los
  borradores se editan; guardar reemplaza todas sus tareas (no tienen workflows). Un código
  admite un solo borrador a la vez.
- **Publicar** valida la definición y deja la versión como **única activa** (`is_active`). Los
  workflows existentes conservan su versión; los nuevos usan la activa. Copia las reglas de
  notificación publicadas de la plantilla que estaba activa (o las iniciales si no hay).
- **Eliminar** solo borra borradores. Una versión publicada se **archiva**; la activa no se
  puede archivar (primero se publica otra), para no quedar sin plantilla para iniciar remates.
- **Validación** (dominio, `template-definition.ts`): códigos únicos y en formato
  `MAYÚSCULAS_CON_GUION`, dependencias a tareas existentes, sin dependencia a sí misma ni
  ciclos, y evidencia exigida solo en tareas con formulario (`evidence-forms.ts`). Publicar exige
  además al menos una tarea.
- **Comportamientos ligados al código de tarea** se conservan: los formularios de evidencia y la
  regla de «Asignar gestor y postor» (`ASSIGN_MANAGER_AND_BIDDER`). El editor los muestra
  mediante `GET /api/workflow-templates/catalog`.
- **Trazabilidad:** autor, publicador y archivador con fecha en la propia fila
  (`created_by`, `published_by/at`, `archived_by/at`) y un log estructurado por comando.
  `workflow_events` es por workflow y no se usa para plantillas.

## Alternativas consideradas

- **Editar la versión publicada en el lugar:** descartado; alteraría workflows en curso.
- **Borrado físico de versiones publicadas:** descartado; las claves foráneas y el historial
  lo impiden.
- **Varias plantillas activas a la vez:** pospuesto. Requiere una regla para elegir el flujo
  de cada remate (p. ej. por tipo); el modelo por `code` ya permite tener varios flujos.

## Consecuencias

- Constructor de formularios de evidencia, ramas y condiciones siguen fuera de alcance.
- Tras aplicar la migración `0014`, `sql/workflow_mvp.sql` debe regenerarse con `mysqldump`.
