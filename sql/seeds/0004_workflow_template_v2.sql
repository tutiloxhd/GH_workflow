-- Propósito: plantilla «Remate judicial» v2 = v1 + evidencia obligatoria en tres tareas
--   (Retirar Vale Vista, Registrar evidencia y Registrar resultado). Formularios básicos de prueba.
-- Ambiente: cualquiera. No contiene datos personales.
-- Idempotente: INSERT IGNORE. La v1 no se modifica; solo deja de ser la plantilla activa.
--   Los workflows existentes conservan su versión; los nuevos usan la v2.
-- Requiere: migraciones 0000 a 0003 y seed 0002 (v1) aplicados.

INSERT IGNORE INTO workflow_templates (code, name, version, is_active)
VALUES ('REMATE_JUDICIAL', 'Remate judicial', 2, FALSE);

-- Copia los pasos de la v1; solo cambia requires_evidence.
INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, due_reference, due_offset_days, due_offset_minutes)
SELECT v2.id, step.code, step.name, step.description, step.responsible_role, step.display_order,
       step.code IN ('COLLECT_VALE_VISTA', 'RECORD_DELIVERY_EVIDENCE', 'RECORD_AUCTION_RESULT'),
       step.due_reference, step.due_offset_days, step.due_offset_minutes
  FROM workflow_templates AS v1
  JOIN task_definitions AS step ON step.workflow_template_id = v1.id
  JOIN workflow_templates AS v2 ON v2.code = v1.code AND v2.version = 2
 WHERE v1.code = 'REMATE_JUDICIAL' AND v1.version = 1;

-- Copia las dependencias de la v1, emparejando las tareas por código.
INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor_v2.id, requirement_v2.id
  FROM workflow_templates AS v1
  JOIN task_definitions AS successor_v1 ON successor_v1.workflow_template_id = v1.id
  JOIN task_dependencies AS dependency ON dependency.task_definition_id = successor_v1.id
  JOIN task_definitions AS requirement_v1 ON requirement_v1.id = dependency.depends_on_task_definition_id
  JOIN workflow_templates AS v2 ON v2.code = v1.code AND v2.version = 2
  JOIN task_definitions AS successor_v2
    ON successor_v2.workflow_template_id = v2.id AND successor_v2.code = successor_v1.code
  JOIN task_definitions AS requirement_v2
    ON requirement_v2.workflow_template_id = v2.id AND requirement_v2.code = requirement_v1.code
 WHERE v1.code = 'REMATE_JUDICIAL' AND v1.version = 1;

-- Solo una versión activa: la v2.
UPDATE workflow_templates SET is_active = (version = 2) WHERE code = 'REMATE_JUDICIAL';

-- Verificación: v2 activa con 15 tareas, 15 dependencias y 3 con evidencia.
SELECT
  (SELECT GROUP_CONCAT(CONCAT('v', version, IF(is_active, ' activa', '')) ORDER BY version)
     FROM workflow_templates WHERE code = 'REMATE_JUDICIAL') AS versions,
  (SELECT COUNT(*) FROM task_definitions td JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 2) AS task_count,
  (SELECT COUNT(*) FROM task_dependencies dep JOIN task_definitions td ON td.id = dep.task_definition_id
    JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 2) AS dependency_count,
  (SELECT COUNT(*) FROM task_definitions td JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 2 AND td.requires_evidence) AS evidence_count;
