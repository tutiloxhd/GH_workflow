import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveEvidenceForm } from '../src/modules/workflow/domain/evidence-forms.js';
import { startIdentityTestContext, type IdentityTestContext } from './identity-test-harness.js';

interface TaskDefinitionRow extends RowDataPacket {
  readonly code: string;
  readonly responsibleRole: string;
  readonly requiresEvidence: number;
  readonly evidenceForm: unknown;
}

const TASK_CODES = [
  'ACCEPT_PROPERTY',
  'ASSIGN_MANAGER_AND_BIDDER',
  'LEGAL_REVIEW',
  'GENERATE_VALE_VISTA_LETTER',
  'SEND_LETTER_TO_GENERAL_MANAGER',
  'SEND_LETTER_TO_BANK',
  'PREPARE_SUBMISSION_FORM',
  'COLLECT_VALE_VISTA',
  'CONSIGN_GUARANTEE',
  'DELIVER_TO_COURT_AND_RECORD_EVIDENCE',
  'FINAL_LEGAL_REVIEW',
  'PREPARE_PARTICIPATION_AND_ALERTS',
  'PARTICIPATE_AND_RECORD_RESULT',
] as const;

describe('plantilla base del remate judicial', () => {
  let context: IdentityTestContext;

  beforeAll(async () => {
    context = await startIdentityTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  it('mantiene los 13 pasos de HU-13, el rol gestor en la tarea 9 y sus formularios', async () => {
    const [tasks] = await context.database.pool.query<TaskDefinitionRow[]>(
      `SELECT task.code, task.responsible_role AS responsibleRole,
              task.requires_evidence AS requiresEvidence, task.evidence_form AS evidenceForm
         FROM task_definitions AS task
         JOIN workflow_templates AS template ON template.id = task.workflow_template_id
        WHERE template.code = 'REMATE_JUDICIAL'
          AND template.version = 1
        ORDER BY task.display_order`,
    );

    expect(tasks.map((task) => task.code)).toEqual(TASK_CODES);
    expect(tasks[8]).toMatchObject({
      code: 'CONSIGN_GUARANTEE',
      responsibleRole: 'MANAGER',
      requiresEvidence: 1,
    });

    const evidenceForms = tasks
      .filter((task) => task.requiresEvidence === 1)
      .map((task) => [
        task.code,
        resolveEvidenceForm(task.code, task.evidenceForm)?.fields.map((field) => field.name),
      ]);
    expect(evidenceForms).toEqual([
      ['COLLECT_VALE_VISTA', ['bank', 'valeVistaNumber', 'amountClp']],
      ['CONSIGN_GUARANTEE', ['consignedOn', 'court', 'receiptNumber']],
      ['DELIVER_TO_COURT_AND_RECORD_EVIDENCE', ['deliveredOn', 'receivedBy', 'notes']],
      ['PARTICIPATE_AND_RECORD_RESULT', ['outcome', 'awardedAmountClp', 'notes']],
    ]);
  });
});
