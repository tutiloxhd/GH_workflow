-- Propósito: plantilla «Remate judicial» v3 estrictamente lineal.
-- Cada tarea depende de la tarea inmediatamente anterior según display_order.
-- Ambiente: cualquiera. No contiene datos personales.
-- Idempotente: INSERT IGNORE. Las versiones publicadas v1 y v2 no se modifican.
-- Los workflows existentes conservan su versión; los nuevos usan la v3.
-- Requiere: migraciones 0000 a 0003 y seed 0004 (v2) aplicados.

INSERT IGNORE INTO workflow_templates (code, name, version, is_active)
VALUES ('REMATE_JUDICIAL', 'Remate judicial', 3, FALSE);

-- Copia sin cambios las tareas, responsables, plazos y requisitos de evidencia de v2.
INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, due_reference, due_offset_days, due_offset_minutes)
SELECT v3.id, task.code, task.name, task.description, task.responsible_role, task.display_order,
       task.requires_evidence, task.due_reference, task.due_offset_days, task.due_offset_minutes
  FROM workflow_templates AS v2
  JOIN task_definitions AS task ON task.workflow_template_id = v2.id
  JOIN workflow_templates AS v3 ON v3.code = v2.code AND v3.version = 3
 WHERE v2.code = 'REMATE_JUDICIAL' AND v2.version = 2;

-- Cadena lineal: cada tarea tiene como único requisito la anterior en el orden publicado.
INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, requirement.id
  FROM workflow_templates AS template
  JOIN task_definitions AS successor ON successor.workflow_template_id = template.id
  JOIN task_definitions AS requirement
    ON requirement.workflow_template_id = template.id
   AND requirement.display_order = successor.display_order - 1
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 3;

-- Solo una versión activa: la v3.
UPDATE workflow_templates SET is_active = (version = 3) WHERE code = 'REMATE_JUDICIAL';

-- Verificación: v3 activa con 15 tareas, 14 dependencias y 3 tareas con evidencia.
SELECT
  (SELECT GROUP_CONCAT(CONCAT('v', version, IF(is_active, ' activa', '')) ORDER BY version)
     FROM workflow_templates WHERE code = 'REMATE_JUDICIAL') AS versions,
  (SELECT COUNT(*) FROM task_definitions td JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 3) AS task_count,
  (SELECT COUNT(*) FROM task_dependencies dep JOIN task_definitions td ON td.id = dep.task_definition_id
    JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 3) AS dependency_count,
  (SELECT COUNT(*) FROM task_definitions td JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 3 AND td.requires_evidence) AS evidence_count;
