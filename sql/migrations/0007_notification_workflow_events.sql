-- Amplía las reglas configurables con eventos del ciclo de vida del workflow.
-- Los destinatarios se resuelven en runtime entre todos los participantes activos.

ALTER TABLE `notification_rules` DROP CONSTRAINT `chk_notification_rules_trigger`;
--> statement-breakpoint
ALTER TABLE `notification_rules` ADD CONSTRAINT `chk_notification_rules_trigger`
  CHECK (`event_type` IN (
    'TASK_ASSIGNED', 'TASK_REMINDER', 'TASK_ESCALATION', 'TASK_OVERDUE', 'TASK_COMPLETED',
    'WORKFLOW_SUSPENDED', 'WORKFLOW_RESUMED', 'WORKFLOW_CANCELLED', 'WORKFLOW_REPROGRAMMED'
  ));
--> statement-breakpoint
INSERT IGNORE INTO `notification_rules` (`rule_set_id`, `event_type`, `offset_minutes`, `is_enabled`)
SELECT `id`, 'WORKFLOW_SUSPENDED', 0, 1 FROM `notification_rule_sets`
UNION ALL SELECT `id`, 'WORKFLOW_RESUMED', 0, 1 FROM `notification_rule_sets`
UNION ALL SELECT `id`, 'WORKFLOW_CANCELLED', 0, 1 FROM `notification_rule_sets`
UNION ALL SELECT `id`, 'WORKFLOW_REPROGRAMMED', 0, 1 FROM `notification_rule_sets`;
