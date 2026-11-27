-- Desarrollo local. Publica v3 sin modificar v1/v2. Requiere migración 0019.
-- Pasos 8 y 10: fotos obligatorias. Paso 8: aviso a legal al guardar evidencia.
-- Paso 13: número de postores y resultado de solo dos opciones.

INSERT IGNORE INTO workflow_templates (code, name, version, status, is_active, deadline_day_kind)
SELECT code, name, 3, 'PUBLISHED', FALSE, deadline_day_kind
  FROM workflow_templates WHERE code = 'REMATE_JUDICIAL' AND version = 2;

INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, evidence_form, due_reference, due_offset_days, due_offset_minutes)
SELECT next_template.id, task.code, task.name, task.description, task.responsible_role,
       task.display_order, task.requires_evidence,
       CASE
         WHEN task.code = 'COLLECT_VALE_VISTA' THEN
           JSON_SET(task.evidence_form, '$.requiresPhoto', TRUE, '$.notifyLegalOnSubmit', TRUE)
         WHEN task.code = 'DELIVER_TO_COURT_AND_RECORD_EVIDENCE' THEN
           JSON_SET(task.evidence_form, '$.requiresPhoto', TRUE)
         WHEN task.code = 'PARTICIPATE_AND_RECORD_RESULT' THEN JSON_OBJECT('fields', JSON_ARRAY(
           JSON_OBJECT('name', 'bidderCount', 'label', 'Cantidad de postores', 'type', 'INTEGER', 'isRequired', TRUE),
           JSON_OBJECT('name', 'outcome', 'label', 'Resultado', 'type', 'CHOICE', 'isRequired', TRUE,
             'options', JSON_ARRAY(
               JSON_OBJECT('value', 'AWARDED', 'label', 'Adjudicado'),
               JSON_OBJECT('value', 'NOT_AWARDED', 'label', 'No adjudicado'))),
           JSON_OBJECT('name', 'awardedAmountClp', 'label', 'Monto adjudicado (pesos)', 'type', 'AMOUNT_CLP', 'isRequired', FALSE),
           JSON_OBJECT('name', 'notes', 'label', 'Observaciones', 'type', 'LONG_TEXT', 'isRequired', FALSE)))
         ELSE task.evidence_form
       END,
       task.due_reference, task.due_offset_days, task.due_offset_minutes
  FROM workflow_templates previous_template
  JOIN task_definitions task ON task.workflow_template_id = previous_template.id
  JOIN workflow_templates next_template ON next_template.code = previous_template.code
    AND next_template.version = 3
 WHERE previous_template.code = 'REMATE_JUDICIAL' AND previous_template.version = 2;

INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, predecessor.id
  FROM workflow_templates template
  JOIN task_definitions successor ON successor.workflow_template_id = template.id
  JOIN task_definitions predecessor ON predecessor.workflow_template_id = template.id
    AND predecessor.display_order = successor.display_order - 1
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 3;

INSERT IGNORE INTO notification_rule_sets (workflow_template_id, version, is_published)
SELECT id, 1, 1 FROM workflow_templates WHERE code = 'REMATE_JUDICIAL' AND version = 3;

INSERT IGNORE INTO notification_rules (rule_set_id, event_type, offset_minutes, is_enabled)
SELECT next_rules.id, previous_rule.event_type, previous_rule.offset_minutes, previous_rule.is_enabled
  FROM workflow_templates previous_template
  JOIN notification_rule_sets previous_rules ON previous_rules.workflow_template_id = previous_template.id
  JOIN notification_rules previous_rule ON previous_rule.rule_set_id = previous_rules.id
  JOIN workflow_templates next_template ON next_template.code = previous_template.code AND next_template.version = 3
  JOIN notification_rule_sets next_rules ON next_rules.workflow_template_id = next_template.id
 WHERE previous_template.code = 'REMATE_JUDICIAL' AND previous_template.version = 2;

INSERT IGNORE INTO notification_rules (rule_set_id, event_type, offset_minutes, is_enabled)
SELECT rules.id, 'EVIDENCE_SUBMITTED', 0, 1
  FROM notification_rule_sets rules
  JOIN workflow_templates template ON template.id = rules.workflow_template_id
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 3;

UPDATE workflow_templates SET is_active = (version = 3) WHERE code = 'REMATE_JUDICIAL';

SELECT template.version, template.is_active, COUNT(DISTINCT task.id) AS task_count
  FROM workflow_templates template JOIN task_definitions task ON task.workflow_template_id = template.id
 WHERE template.code = 'REMATE_JUDICIAL'
 GROUP BY template.version, template.is_active ORDER BY template.version;
