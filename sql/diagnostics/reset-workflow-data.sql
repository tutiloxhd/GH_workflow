-- DESTRUCTIVO. Solo para la base local de desarrollo, con respaldo verificado.
-- Elimina instancias, historial, evidencias, notificaciones y todas las versiones
-- de plantillas. Conserva properties, users, roles, holidays y datos de sincronización.
-- Detener API, worker y sincronizador antes de ejecutar. Revisar conteos previos.
-- No ejecutar automáticamente ni usar en ambientes compartidos.

SELECT 'workflow_instances' AS entity, COUNT(*) AS rows_to_delete FROM workflow_instances
UNION ALL SELECT 'workflow_templates', COUNT(*) FROM workflow_templates
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'task_evidence_submissions', COUNT(*) FROM task_evidence_submissions;

-- Ejecutar con cliente mysql sin --force. El procedimiento revierte y relanza
-- cualquier error SQL, impidiendo un COMMIT parcial.
DELIMITER //
DROP PROCEDURE IF EXISTS reset_workflow_data//
CREATE PROCEDURE reset_workflow_data()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;
  START TRANSACTION;

DELETE FROM push_deliveries;
DELETE FROM notifications;
DELETE FROM notification_jobs;
DELETE FROM notification_outbox;
DELETE FROM workflow_notification_rule_sets;
DELETE FROM notification_rules;
DELETE FROM notification_rule_sets;
DELETE FROM task_evidence_photos;
DELETE FROM task_evidence_submissions;
DELETE FROM workflow_events;
DELETE FROM workflow_reprogrammings;
DELETE FROM workflow_participants;
DELETE FROM task_instances;
DELETE FROM workflow_instances;
DELETE FROM task_dependencies;
DELETE FROM task_definitions;
DELETE FROM workflow_templates;

-- Revisar que todas las sentencias hayan terminado sin error antes de confirmar.
  COMMIT;
END//
DELIMITER ;
CALL reset_workflow_data();
DROP PROCEDURE reset_workflow_data;

SELECT 'workflow_instances' AS entity, COUNT(*) AS remaining FROM workflow_instances
UNION ALL SELECT 'workflow_templates', COUNT(*) FROM workflow_templates
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'task_evidence_submissions', COUNT(*) FROM task_evidence_submissions;
