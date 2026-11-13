-- Propósito: plantilla publicada «Remate judicial» v1 (flujo principal de la fase 1, sin ramas).
-- Ambiente: cualquiera. No contiene datos personales.
-- Idempotente: INSERT IGNORE. Una versión publicada es inmutable: si ya existe, no se modifica.
--   Para cambiar pasos, plazos o dependencias se crea una versión nueva, nunca se edita esta.
-- Fuente: references/motor/workflow-motor/db/plantilla-remate.js (pasos 2 a 16 de la maqueta).
-- Decisiones de la fase 1: todas las tareas son manuales (las «automáticas» las hace un ADMIN)
--   y todas tienen el plazo provisorio de 3 días corridos desde su activación.
-- Requiere: migraciones 0000 a 0002 aplicadas.

INSERT IGNORE INTO workflow_templates (code, name, version, is_active)
VALUES ('REMATE_JUDICIAL', 'Remate judicial', 1, TRUE);

INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, due_reference, due_offset_days, due_offset_minutes)
SELECT template.id, step.code, step.name, step.description, step.responsible_role,
       step.display_order, FALSE, 'TASK_ACTIVATED_AT', 3, 0
  FROM workflow_templates AS template
  JOIN (
    SELECT 2 AS display_order, 'ASSIGN_MANAGER_AND_BIDDER' AS code, 'Asignar gestor y postor' AS name,
           'Definir quién gestiona el remate y quién participa como postor.' AS description,
           'ADMIN' AS responsible_role
    UNION ALL SELECT 3, 'GENERATE_VALE_VISTA_LETTER', 'Generar carta Vale Vista',
           'Generar la carta para solicitar el Vale Vista.', 'ADMIN'
    UNION ALL SELECT 4, 'SEND_LETTER_TO_GENERAL_MANAGER', 'Enviar carta al gerente general',
           'Enviar la carta por email, con el adjunto, al gerente general.', 'ADMIN'
    UNION ALL SELECT 5, 'SEND_LETTER_TO_BANK', 'Enviar carta al banco',
           'El gerente general envía la carta al banco desde su buzón.', 'ADMIN'
    UNION ALL SELECT 6, 'PREPARE_SUBMISSION_FORM', 'Generar formulario',
           'Generar el formulario que se entrega junto al Vale Vista.', 'MANAGER'
    UNION ALL SELECT 7, 'PRE_DELIVERY_LEGAL_REVIEW', 'Revisión legal pre-entrega',
           'Revisión legal previa a la entrega. Legal puede suspender o cancelar el remate.',
           'LEGAL_REVIEWER'
    UNION ALL SELECT 8, 'COLLECT_VALE_VISTA', 'Retirar Vale Vista',
           'Retirar el Vale Vista en el banco.', 'MANAGER'
    UNION ALL SELECT 9, 'DELIVER_VALE_VISTA_AND_FORM', 'Entregar Vale Vista + formulario',
           'Entregar el Vale Vista y el formulario en el juzgado.', 'MANAGER'
    UNION ALL SELECT 10, 'RECORD_DELIVERY_EVIDENCE', 'Registrar evidencia',
           'Registrar las fotos timbradas como evidencia de la entrega.', 'MANAGER'
    UNION ALL SELECT 11, 'FINAL_LEGAL_REVIEW', 'Revisión legal final',
           'Revisión legal final antes del remate. Legal puede suspender o cancelar el remate.',
           'LEGAL_REVIEWER'
    UNION ALL SELECT 12, 'PREPARE_PARTICIPATION', 'Preparar participación',
           'Dejar listos el link de la sala y el monto para participar.', 'BIDDER'
    UNION ALL SELECT 13, 'PRE_AUCTION_ALERTS', 'Alertas pre-remate',
           'Avisar a los participantes antes del remate.', 'ADMIN'
    UNION ALL SELECT 14, 'ENTER_VIRTUAL_ROOM', 'Ingresar a sala virtual',
           'Ingresar a la sala virtual, como máximo 15 minutos antes.', 'BIDDER'
    UNION ALL SELECT 15, 'PARTICIPATE_IN_AUCTION', 'Participar en remate',
           'Participar en el remate.', 'BIDDER'
    UNION ALL SELECT 16, 'RECORD_AUCTION_RESULT', 'Registrar resultado',
           'Registrar el resultado del remate.', 'BIDDER'
  ) AS step
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

-- Dependencias: la tarea no se activa hasta que todas sus requisitos estén completadas.
INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, requirement.id
  FROM workflow_templates AS template
  JOIN (
    SELECT 'GENERATE_VALE_VISTA_LETTER' AS successor_code, 'ASSIGN_MANAGER_AND_BIDDER' AS requirement_code
    UNION ALL SELECT 'SEND_LETTER_TO_GENERAL_MANAGER', 'GENERATE_VALE_VISTA_LETTER'
    UNION ALL SELECT 'SEND_LETTER_TO_BANK', 'SEND_LETTER_TO_GENERAL_MANAGER'
    UNION ALL SELECT 'PREPARE_SUBMISSION_FORM', 'ASSIGN_MANAGER_AND_BIDDER'
    UNION ALL SELECT 'PRE_DELIVERY_LEGAL_REVIEW', 'ASSIGN_MANAGER_AND_BIDDER'
    UNION ALL SELECT 'COLLECT_VALE_VISTA', 'SEND_LETTER_TO_BANK'
    UNION ALL SELECT 'DELIVER_VALE_VISTA_AND_FORM', 'PREPARE_SUBMISSION_FORM'
    UNION ALL SELECT 'DELIVER_VALE_VISTA_AND_FORM', 'COLLECT_VALE_VISTA'
    UNION ALL SELECT 'RECORD_DELIVERY_EVIDENCE', 'DELIVER_VALE_VISTA_AND_FORM'
    UNION ALL SELECT 'FINAL_LEGAL_REVIEW', 'RECORD_DELIVERY_EVIDENCE'
    UNION ALL SELECT 'PREPARE_PARTICIPATION', 'RECORD_DELIVERY_EVIDENCE'
    UNION ALL SELECT 'PRE_AUCTION_ALERTS', 'PREPARE_PARTICIPATION'
    UNION ALL SELECT 'ENTER_VIRTUAL_ROOM', 'PREPARE_PARTICIPATION'
    UNION ALL SELECT 'PARTICIPATE_IN_AUCTION', 'ENTER_VIRTUAL_ROOM'
    UNION ALL SELECT 'RECORD_AUCTION_RESULT', 'PARTICIPATE_IN_AUCTION'
  ) AS dependency
  JOIN task_definitions AS successor
    ON successor.workflow_template_id = template.id AND successor.code = dependency.successor_code
  JOIN task_definitions AS requirement
    ON requirement.workflow_template_id = template.id AND requirement.code = dependency.requirement_code
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

-- Verificación: debe devolver 15 tareas y 15 dependencias.
SELECT
  (SELECT COUNT(*) FROM task_definitions td JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 1) AS task_count,
  (SELECT COUNT(*) FROM task_dependencies dep JOIN task_definitions td ON td.id = dep.task_definition_id
    JOIN workflow_templates wt ON wt.id = td.workflow_template_id
    WHERE wt.code = 'REMATE_JUDICIAL' AND wt.version = 1) AS dependency_count;
