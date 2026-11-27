-- DESTRUCTIVO. Solo base local de desarrollo, con respaldo verificado.
-- Elimina instancias y su historial para recrearlas con la plantilla activa.
-- Conserva propiedades, usuarios, roles, feriados y plantillas publicadas.
-- Detener API, worker, scheduler y sincronizador antes de ejecutar.
-- Usar cliente mysql sin --force; un error revierte toda la transacción.

DELIMITER //
DROP PROCEDURE IF EXISTS reset_workflow_instances//
CREATE PROCEDURE reset_workflow_instances()
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
  DELETE FROM task_evidence_photos;
  DELETE FROM task_evidence_submissions;
  DELETE FROM workflow_events;
  DELETE FROM workflow_reprogrammings;
  DELETE FROM workflow_participants;
  DELETE FROM task_instances;
  DELETE FROM workflow_instances;
  COMMIT;
END//
DELIMITER ;
CALL reset_workflow_instances();
DROP PROCEDURE reset_workflow_instances;

SELECT COUNT(*) AS remaining_workflows FROM workflow_instances;
