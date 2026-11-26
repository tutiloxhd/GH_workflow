-- Propósito: reiniciar las plantillas de workflow y todos sus datos dependientes para HU-13.
-- Ambiente permitido: bases locales y de desarrollo únicamente.
-- DESTRUCTIVO: elimina workflows, tareas, historial, evidencias y notificaciones.
-- No usar en otros ambientes. Confirmar la base seleccionada antes de ejecutar.
-- Si una sentencia falla antes del COMMIT, ejecutar ROLLBACK en esta misma conexión.

START TRANSACTION;

SET @properties_before = (SELECT COUNT(*) FROM properties);
SET @users_before = (SELECT COUNT(*) FROM users);
SET @roles_before = (SELECT COUNT(*) FROM roles);
SET @holidays_before = (SELECT COUNT(*) FROM holidays);
SET @sync_cursors_before = (SELECT COUNT(*) FROM sync_cursors);
SET @sync_executions_before = (SELECT COUNT(*) FROM sync_executions);
SET @sync_issues_before = (SELECT COUNT(*) FROM sync_issues);
SET @property_changes_before = (SELECT COUNT(*) FROM property_source_changes);

DELETE FROM notification_jobs;
DELETE FROM notifications;
DELETE FROM notification_outbox;
DELETE FROM workflow_notification_rule_sets;
DELETE FROM task_evidence_submissions;
DELETE FROM workflow_events;
DELETE FROM workflow_reprogrammings;
DELETE FROM workflow_participants;
DELETE FROM task_instances;
DELETE FROM workflow_instances;
DELETE FROM notification_rules;
DELETE FROM notification_rule_sets;
DELETE FROM task_dependencies;
DELETE FROM task_definitions;
DELETE FROM workflow_templates;

SELECT
  (SELECT COUNT(*) FROM notification_jobs) AS notification_jobs,
  (SELECT COUNT(*) FROM notifications) AS notifications,
  (SELECT COUNT(*) FROM notification_outbox) AS notification_outbox,
  (SELECT COUNT(*) FROM workflow_notification_rule_sets) AS workflow_notification_rule_sets,
  (SELECT COUNT(*) FROM task_evidence_submissions) AS task_evidence_submissions,
  (SELECT COUNT(*) FROM workflow_events) AS workflow_events,
  (SELECT COUNT(*) FROM workflow_reprogrammings) AS workflow_reprogrammings,
  (SELECT COUNT(*) FROM workflow_participants) AS workflow_participants,
  (SELECT COUNT(*) FROM task_instances) AS task_instances,
  (SELECT COUNT(*) FROM workflow_instances) AS workflow_instances,
  (SELECT COUNT(*) FROM notification_rules) AS notification_rules,
  (SELECT COUNT(*) FROM notification_rule_sets) AS notification_rule_sets,
  (SELECT COUNT(*) FROM task_dependencies) AS task_dependencies,
  (SELECT COUNT(*) FROM task_definitions) AS task_definitions,
  (SELECT COUNT(*) FROM workflow_templates) AS workflow_templates,
  @properties_before AS properties_before,
  (SELECT COUNT(*) FROM properties) AS properties_after,
  @properties_before = (SELECT COUNT(*) FROM properties) AS properties_preserved,
  @users_before AS users_before,
  (SELECT COUNT(*) FROM users) AS users_after,
  @users_before = (SELECT COUNT(*) FROM users) AS users_preserved,
  @roles_before AS roles_before,
  (SELECT COUNT(*) FROM roles) AS roles_after,
  @roles_before = (SELECT COUNT(*) FROM roles) AS roles_preserved,
  @holidays_before AS holidays_before,
  (SELECT COUNT(*) FROM holidays) AS holidays_after,
  @holidays_before = (SELECT COUNT(*) FROM holidays) AS holidays_preserved,
  @sync_cursors_before AS sync_cursors_before,
  (SELECT COUNT(*) FROM sync_cursors) AS sync_cursors_after,
  @sync_cursors_before = (SELECT COUNT(*) FROM sync_cursors) AS sync_cursors_preserved,
  @sync_executions_before AS sync_executions_before,
  (SELECT COUNT(*) FROM sync_executions) AS sync_executions_after,
  @sync_executions_before = (SELECT COUNT(*) FROM sync_executions) AS sync_executions_preserved,
  @sync_issues_before AS sync_issues_before,
  (SELECT COUNT(*) FROM sync_issues) AS sync_issues_after,
  @sync_issues_before = (SELECT COUNT(*) FROM sync_issues) AS sync_issues_preserved,
  @property_changes_before AS property_source_changes_before,
  (SELECT COUNT(*) FROM property_source_changes) AS property_source_changes_after,
  @property_changes_before = (SELECT COUNT(*) FROM property_source_changes) AS property_source_changes_preserved;

COMMIT;
