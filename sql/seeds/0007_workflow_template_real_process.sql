-- Plantilla única tras reset-workflow-data.sql. Desarrollo local; ejecutar antes
-- de 0005_notification_rules.sql. Reejecutable sin duplicar definiciones.
-- Plazos provisorios: 3 días hábiles desde activación, según plantilla base.
INSERT IGNORE INTO workflow_templates
  (code, name, version, status, is_active, deadline_day_kind)
VALUES ('REMATE_JUDICIAL', 'Remate judicial', 1, 'PUBLISHED', TRUE, 'BUSINESS');

INSERT IGNORE INTO task_definitions
  (workflow_template_id, code, name, description, responsible_role, display_order,
   requires_evidence, evidence_form, due_reference, due_offset_days, due_offset_minutes)
SELECT template.id, step.code, step.name, step.description, step.responsible_role,
       step.display_order, step.requires_evidence, step.evidence_form,
       'TASK_ACTIVATED_AT', 3, 0
  FROM workflow_templates AS template
  JOIN (
    SELECT 1 AS display_order, 'ACCEPT_PROPERTY' AS code, 'Aceptar propiedad' AS name,
      'Confirmar la aceptación de la propiedad en admin_new.' AS description,
      'ADMIN' AS responsible_role, FALSE AS requires_evidence, NULL AS evidence_form
    UNION ALL SELECT 2, 'ASSIGN_MANAGER_AND_BIDDER', 'Asignar gestor y postor',
      'Definir el gestor y el postor responsables del remate.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 3, 'LEGAL_REVIEW', 'Revisión legal',
      'Revisar los antecedentes legales antes de preparar la garantía.', 'LEGAL_REVIEWER', FALSE, NULL
    UNION ALL SELECT 4, 'GENERATE_VALE_VISTA_LETTER', 'Generar carta Vale Vista',
      'Preparar la carta para solicitar el Vale Vista.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 5, 'SEND_LETTER_TO_GENERAL_MANAGER', 'Enviar carta al gerente general',
      'Enviar la carta al gerente general.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 6, 'SEND_LETTER_TO_BANK', 'Gerente general envía carta al banco',
      'Confirmar el envío de la carta al banco.', 'ADMIN', FALSE, NULL
    UNION ALL SELECT 7, 'PREPARE_SUBMISSION_FORM', 'Generar formulario',
      'Preparar el formulario para presentar la garantía.', 'MANAGER', FALSE, NULL
    UNION ALL SELECT 8, 'COLLECT_VALE_VISTA', 'Retirar Vale Vista',
      'Retirar el Vale Vista y registrar sus datos.', 'MANAGER', TRUE,
      '{"fields":[{"name":"bank","label":"Banco","type":"TEXT","isRequired":true},{"name":"valeVistaNumber","label":"N° de Vale Vista","type":"TEXT","isRequired":true},{"name":"amountClp","label":"Monto (pesos)","type":"AMOUNT_CLP","isRequired":true}]}'
    UNION ALL SELECT 9, 'CONSIGN_GUARANTEE', 'Consignar garantía',
      'Consignar la garantía para participar en el remate.', 'MANAGER', FALSE, NULL
    UNION ALL SELECT 10, 'DELIVER_TO_COURT_AND_RECORD_EVIDENCE',
      'Entregar Vale Vista y formulario al tribunal y registrar evidencia',
      'Entregar el Vale Vista y el formulario al tribunal y registrar la recepción.', 'MANAGER', TRUE,
      '{"fields":[{"name":"deliveredOn","label":"Fecha de entrega","type":"DATE","isRequired":true},{"name":"receivedBy","label":"Recibido por","type":"TEXT","isRequired":true},{"name":"notes","label":"Observaciones","type":"LONG_TEXT","isRequired":false}]}'
    UNION ALL SELECT 11, 'FINAL_LEGAL_REVIEW', 'Revisión legal final',
      'Realizar la revisión legal final antes del remate.', 'LEGAL_REVIEWER', FALSE, NULL
    UNION ALL SELECT 12, 'PREPARE_PARTICIPATION_AND_ALERTS', 'Alertas y preparar participación',
      'Preparar la participación y confirmar las alertas previas al remate.', 'BIDDER', FALSE, NULL
    UNION ALL SELECT 13, 'PARTICIPATE_AND_RECORD_RESULT',
      'Ingresar, participar y registrar remate',
      'Participar en el remate y registrar su resultado.', 'BIDDER', TRUE,
      '{"fields":[{"name":"outcome","label":"Resultado","type":"CHOICE","isRequired":true,"options":[{"value":"AWARDED","label":"Adjudicado"},{"value":"NOT_AWARDED","label":"No adjudicado"},{"value":"RESCHEDULED","label":"Reprogramado"},{"value":"DESERTED","label":"Desierto"}]},{"name":"awardedAmountClp","label":"Monto adjudicado (pesos)","type":"AMOUNT_CLP","isRequired":false},{"name":"notes","label":"Observaciones","type":"LONG_TEXT","isRequired":false}]}'
  ) AS step
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

INSERT IGNORE INTO task_dependencies (task_definition_id, depends_on_task_definition_id)
SELECT successor.id, predecessor.id
  FROM workflow_templates AS template
  JOIN task_definitions AS successor ON successor.workflow_template_id = template.id
  JOIN task_definitions AS predecessor ON predecessor.workflow_template_id = template.id
    AND predecessor.display_order = successor.display_order - 1
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1;

SELECT template.id, template.is_active, COUNT(DISTINCT task.id) AS task_count,
       COUNT(DISTINCT dependency.task_definition_id) AS dependency_count
  FROM workflow_templates AS template
  JOIN task_definitions AS task ON task.workflow_template_id = template.id
  LEFT JOIN task_dependencies AS dependency ON dependency.task_definition_id = task.id
 WHERE template.code = 'REMATE_JUDICIAL' AND template.version = 1
 GROUP BY template.id, template.is_active;
