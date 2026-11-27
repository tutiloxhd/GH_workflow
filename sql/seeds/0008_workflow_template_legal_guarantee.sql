-- Desarrollo local. Nueva versión publicada sin modificar la versión 1.
-- Paso 9: LEGAL_REVIEWER. Paso 10: nombre simplificado; conserva código y evidencia.
-- Reejecutable; requiere 0007 y migraciones hasta 0018.

INSERT IGNORE INTO workflow_templates
  (code, name, version, status, is_active, deadline_day_kind)
SELECT code, name, 2, 'PUBLISHED', FALSE, deadline_day_kind
  FROM workflow_templates WHERE code = 'REMATE_JUDICIAL' AND version = 1;

INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, evidence_form, due_reference, due_offset_days, due_offset_minutes)
SELECT next_template.id, task.code,
       CASE WHEN task.code = 'DELIVER_TO_COURT_AND_RECORD_EVIDENCE'
         THEN 'Entregar Vale Vista y Formulario al tribunal' ELSE task.name END,
       task.description,
       CASE WHEN task.code = 'CONSIGN_GUARANTEE'
         THEN 'LEGAL_REVIEWER' ELSE task.responsible_role END,
       task.display_order, task.requires_evidence, task.evidence_form,
       task.due_reference, task.due_offset_days, task.due_offset_minutes
  FROM workflow_templates AS previous_template
  JOIN task_definitions AS task ON task.workflow_template_id = previous_template.id
  JOIN workflow_templates AS next_template
    ON next_template.code = previous_template.code AND next_template.version = 2
 WHERE previous_template.code = 'REMATE_JUDICIAL' AND previous_template.version = 1;

INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, predecessor.id
  FROM workflow_templates AS template
  JOIN task_definitions AS successor ON successor.workflow_template_id = template.id
  JOIN task_definitions AS predecessor ON predecessor.workflow_template_id = template.id
    AND predecessor.display_order = successor.display_order - 1
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 2;

UPDATE workflow_templates
   SET is_active = (version = 2)
 WHERE code = 'REMATE_JUDICIAL';

SELECT template.version, template.is_active, COUNT(DISTINCT task.id) AS task_count,
       COUNT(DISTINCT dependency.task_definition_id) AS dependency_count
  FROM workflow_templates AS template
  JOIN task_definitions AS task ON task.workflow_template_id = template.id
  LEFT JOIN task_dependencies AS dependency ON dependency.task_definition_id = task.id
 WHERE template.code = 'REMATE_JUDICIAL'
 GROUP BY template.version, template.is_active
 ORDER BY template.version;
