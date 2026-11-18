-- Reglas iniciales de notificación interna por versión de plantilla.
-- Idempotente; no modifica rule sets ya publicados.

INSERT IGNORE INTO notification_rule_sets (workflow_template_id, version, is_published)
SELECT id, 1, 1 FROM workflow_templates;

INSERT IGNORE INTO notification_rules (rule_set_id, event_type, offset_minutes, is_enabled)
SELECT id, 'TASK_ASSIGNED', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_REMINDER', 2880, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_ESCALATION', 1440, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_OVERDUE', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'TASK_COMPLETED', 0, 1 FROM notification_rule_sets;
INSERT IGNORE INTO notification_rules (rule_set_id, event_type, offset_minutes, is_enabled)
SELECT id, 'WORKFLOW_SUSPENDED', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'WORKFLOW_RESUMED', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'WORKFLOW_CANCELLED', 0, 1 FROM notification_rule_sets
UNION ALL SELECT id, 'WORKFLOW_REPROGRAMMED', 0, 1 FROM notification_rule_sets;

INSERT IGNORE INTO workflow_notification_rule_sets (workflow_instance_id, rule_set_id)
SELECT wi.id, nrs.id
  FROM workflow_instances wi
  JOIN notification_rule_sets nrs ON nrs.workflow_template_id = wi.workflow_template_id
 WHERE nrs.is_published = 1;

SELECT
  (SELECT COUNT(*) FROM notification_rule_sets WHERE is_published = 1) AS published_rule_sets,
  (SELECT COUNT(*) FROM notification_rules) AS notification_rules;
