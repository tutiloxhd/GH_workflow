-- Propósito: plantilla base publicada del remate judicial, con el flujo lineal vigente.
-- Ambiente: cualquiera. No contiene datos personales.
-- Idempotente: INSERT IGNORE; no modifica una versión existente.
-- Requiere: migraciones 0000 a 0010 aplicadas.

INSERT IGNORE INTO workflow_templates
  (code, name, version, is_active)
VALUES ('REMATE_JUDICIAL', 'Remate judicial', 1, TRUE);

INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, evidence_form, due_reference, due_offset_days, due_offset_minutes)
SELECT template.id, step.code, step.name, step.description, step.responsible_role,
       step.display_order, step.requires_evidence, step.evidence_form,
       'TASK_ACTIVATED_AT', 3, 0
  FROM workflow_templates AS template
  JOIN (
    SELECT 1 AS display_order, 'ACCEPT_PROPERTY' AS code, 'Aceptar propiedad' AS name,
           'Confirmar la aceptación de la propiedad para continuar con el remate.' AS description,
           'ADMIN' AS responsible_role, FALSE AS requires_evidence, NULL AS evidence_form
    UNION ALL SELECT 2, 'ASSIGN_MANAGER_AND_BIDDER', 'Asignar gestor y postor',
           'Confirmar quién gestiona el remate y quién participa como postor.',
           'ADMIN', FALSE, NULL
    UNION ALL SELECT 3, 'LEGAL_REVIEW', 'Revisión legal',
           'Revisar los antecedentes legales de la propiedad.', 'LEGAL_REVIEWER', FALSE, NULL
    UNION ALL SELECT 4, 'GENERATE_VALE_VISTA_LETTER', 'Generar carta Vale Vista',
           'Generar la carta para solicitar el Vale Vista.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 5, 'SEND_LETTER_TO_GENERAL_MANAGER', 'Enviar carta al gerente general',
           'Enviar la carta al gerente general para su gestión.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 6, 'SEND_LETTER_TO_BANK', 'Gerente general envía carta al banco',
           'Gestionar el envío de la carta al banco.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 7, 'PREPARE_SUBMISSION_FORM', 'Generar formulario',
           'Preparar el formulario que se entrega junto al Vale Vista.', 'MANAGER', FALSE, NULL
    UNION ALL SELECT 8, 'COLLECT_VALE_VISTA', 'Retirar Vale Vista',
           'Retirar el Vale Vista en el banco.', 'MANAGER', TRUE,
           '{"fields":[{"name":"bank","label":"Banco","type":"TEXT","isRequired":true},{"name":"valeVistaNumber","label":"N° de Vale Vista","type":"TEXT","isRequired":true},{"name":"amountClp","label":"Monto (pesos)","type":"AMOUNT_CLP","isRequired":true}]}'
    UNION ALL SELECT 9, 'CONSIGN_GUARANTEE', 'Consignar garantía',
           'Consignar la garantía en el tribunal correspondiente.', 'MANAGER', TRUE,
           '{"fields":[{"name":"consignedOn","label":"Fecha de consignación","type":"DATE","isRequired":true},{"name":"court","label":"Tribunal","type":"TEXT","isRequired":true},{"name":"receiptNumber","label":"N°/folio del comprobante","type":"TEXT","isRequired":true}]}'
    UNION ALL SELECT 10, 'DELIVER_TO_COURT_AND_RECORD_EVIDENCE', 'Entregar Vale Vista y formulario al tribunal y registrar evidencia',
           'Entregar los documentos al tribunal y registrar los datos de recepción.', 'MANAGER', TRUE,
           '{"fields":[{"name":"deliveredOn","label":"Fecha de entrega","type":"DATE","isRequired":true},{"name":"receivedBy","label":"Recibido por","type":"TEXT","isRequired":true},{"name":"notes","label":"Observaciones","type":"LONG_TEXT","isRequired":false}]}'
    UNION ALL SELECT 11, 'FINAL_LEGAL_REVIEW', 'Revisión legal final',
           'Revisar los antecedentes legales antes del remate.', 'LEGAL_REVIEWER', FALSE, NULL
    UNION ALL SELECT 12, 'PREPARE_PARTICIPATION_AND_ALERTS', 'Alertas y preparar participación',
           'Preparar la participación y avisar a quienes corresponda antes del remate.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 13, 'PARTICIPATE_AND_RECORD_RESULT', 'Ingresar, participar y registrar remate',
           'Ingresar a la sala, participar en el remate y registrar su resultado.', 'BIDDER', TRUE,
           '{"fields":[{"name":"outcome","label":"Resultado","type":"CHOICE","isRequired":true,"options":[{"value":"AWARDED","label":"Adjudicado"},{"value":"NOT_AWARDED","label":"No adjudicado"},{"value":"RESCHEDULED","label":"Reprogramado"},{"value":"DESERTED","label":"Desierto"}]},{"name":"awardedAmountClp","label":"Monto adjudicado (pesos)","type":"AMOUNT_CLP","isRequired":false},{"name":"notes","label":"Observaciones","type":"LONG_TEXT","isRequired":false}]}'
  ) AS step
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, requirement.id
  FROM workflow_templates AS template
  JOIN task_definitions AS successor
    ON successor.workflow_template_id = template.id
  JOIN task_definitions AS requirement
    ON requirement.workflow_template_id = template.id
   AND requirement.display_order = successor.display_order - 1
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

SELECT
  (SELECT COUNT(*) FROM workflow_templates WHERE code = 'REMATE_JUDICIAL') AS template_count,
  (SELECT COUNT(*) FROM workflow_templates
    WHERE code = 'REMATE_JUDICIAL' AND version = 1 AND is_active = TRUE) AS valid_template_count,
  (SELECT COUNT(*) FROM task_definitions AS task
     JOIN workflow_templates AS template ON template.id = task.workflow_template_id
    WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1) AS task_count,
  (SELECT COUNT(*) FROM task_dependencies AS dependency
     JOIN task_definitions AS task ON task.id = dependency.task_definition_id
     JOIN workflow_templates AS template ON template.id = task.workflow_template_id
    WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1) AS dependency_count,
  (SELECT COUNT(*) FROM task_definitions AS task
     JOIN workflow_templates AS template ON template.id = task.workflow_template_id
    WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1
      AND task.requires_evidence = TRUE AND task.evidence_form IS NOT NULL) AS evidence_form_count;
