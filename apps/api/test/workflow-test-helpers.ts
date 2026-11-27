import type { ResultSetHeader } from 'mysql2';
import type { UserAccount } from '../src/modules/identity/persistence/users-repository.js';
import {
  callApi,
  givenUser,
  logInAs,
  type ApiResponse,
  type IdentityTestContext,
} from './identity-test-harness.js';

// Forma mínima del detalle de workflow que usan las pruebas.
export interface WorkflowView {
  readonly id: number;
  readonly status: string;
  readonly auctionAt: string | null;
  readonly participants: {
    participantType: string;
    assignmentType: string;
    user: { id: number } | null;
  }[];
  readonly tasks: {
    id: number;
    code: string;
    name: string;
    status: string;
    assignee: { id: number } | null;
    backup: { id: number } | null;
    dueAt: string | null;
    requiresEvidence: boolean;
    evidence: { formData: Record<string, unknown> } | null;
    evidencePhotos: { id: number }[];
    evidenceForm: { fields: { name: string; type: string; options?: { value: string }[] }[] } | null;
    deadline: { dueReference: string; dueOffsetDays: number; dueOffsetMinutes: number };
  }[];
}

export interface WorkflowCast {
  readonly admin: UserAccount;
  readonly manager: UserAccount;
  readonly backupManager: UserAccount;
  readonly bidder: UserAccount;
  readonly legal: UserAccount;
  readonly cookies: Record<'admin' | 'manager' | 'backupManager' | 'bidder' | 'legal', string>;
}

export async function givenCast(context: IdentityTestContext): Promise<WorkflowCast> {
  const admin = await givenUser(context, { email: 'admin@example.test', roles: ['ADMIN'] });
  const manager = await givenUser(context, { email: 'gestor@example.test', roles: ['MANAGER'] });
  const backupManager = await givenUser(context, {
    email: 'gestor.suplente@example.test',
    roles: ['MANAGER'],
  });
  const bidder = await givenUser(context, { email: 'postor@example.test', roles: ['BIDDER'] });
  const legal = await givenUser(context, {
    email: 'legal@example.test',
    roles: ['LEGAL_REVIEWER'],
  });

  return {
    admin,
    manager,
    backupManager,
    bidder,
    legal,
    cookies: {
      admin: await logInAs(context, 'admin@example.test'),
      manager: await logInAs(context, 'gestor@example.test'),
      backupManager: await logInAs(context, 'gestor.suplente@example.test'),
      bidder: await logInAs(context, 'postor@example.test'),
      legal: await logInAs(context, 'legal@example.test'),
    },
  };
}

// Propiedad sintética insertada directamente: la sincronización con admin_new llega después.
export async function givenProperty(
  context: IdentityTestContext,
  auctionAt: string | null = '2026-12-07T13:00:00.000Z',
): Promise<number> {
  const [result] = await context.database.pool.query<ResultSetHeader>(
    `INSERT INTO properties (admin_new_id, title, auction_at, last_synced_at)
     VALUES (9000000000 + FLOOR(RAND() * 1000000), 'Propiedad sintética', ?, UTC_TIMESTAMP(6))`,
    [auctionAt === null ? null : new Date(auctionAt)],
  );
  await context.database.pool.query(
    "UPDATE properties SET assignment_region = 'Región Metropolitana', auction_mode = 'Presencial' WHERE id = ?",
    [result.insertId],
  );
  return result.insertId;
}

export function workflowOf(response: ApiResponse): WorkflowView {
  const body = response.body as { workflow?: WorkflowView } | undefined;
  if (!body?.workflow) throw new Error(`Respuesta sin workflow (HTTP ${response.status})`);
  return body.workflow;
}

export function taskOf(workflow: WorkflowView, code: string): WorkflowView['tasks'][number] {
  const task = workflow.tasks.find((candidate) => candidate.code === code);
  if (!task) throw new Error(`El workflow no tiene la tarea ${code}`);
  return task;
}

export const statusesOf = (workflow: WorkflowView): Record<string, string> =>
  Object.fromEntries(workflow.tasks.map((task) => [task.code, task.status]));

export async function startWorkflowFor(
  context: IdentityTestContext,
  cast: WorkflowCast,
  propertyId: number,
): Promise<WorkflowView> {
  return workflowOf(
    await callApi(context, 'POST', `/api/properties/${propertyId}/workflow`, {
      sessionCookie: cast.cookies.admin,
    }),
  );
}

export async function assignStandardParticipants(
  context: IdentityTestContext,
  cast: WorkflowCast,
  workflowId: number,
): Promise<ApiResponse> {
  return callApi(context, 'PUT', `/api/workflows/${workflowId}/participants`, {
    sessionCookie: cast.cookies.admin,
    body: {
      assignments: [
        {
          participantType: 'MANAGER',
          primaryUserId: cast.manager.id,
          backupUserId: cast.backupManager.id,
        },
        { participantType: 'BIDDER', primaryUserId: cast.bidder.id },
        { participantType: 'LEGAL_REVIEWER', primaryUserId: cast.legal.id },
      ],
    },
  });
}

// Evidencia válida y sintética para las tareas de la plantilla actual.
export const SYNTHETIC_EVIDENCE: Readonly<Record<string, Record<string, unknown>>> = {
  COLLECT_VALE_VISTA: { bank: 'Banco Sintético', valeVistaNumber: 'VV-0001', amountClp: 4200000 },
  DELIVER_TO_COURT_AND_RECORD_EVIDENCE: {
    deliveredOn: '2026-12-01',
    receivedBy: 'Receptor sintético',
  },
  PARTICIPATE_AND_RECORD_RESULT: { bidderCount: 0, outcome: 'NOT_AWARDED' },
};

const SYNTHETIC_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/F3sAAAAASUVORK5CYII=', 'base64');

export function uploadPhotoAs(
  context: IdentityTestContext, sessionCookie: string, taskId: number, bytes = SYNTHETIC_PNG,
): Promise<ApiResponse> {
  return callApi(context, 'POST', `/api/tasks/${taskId}/evidence/photos`, {
    sessionCookie, binaryBody: bytes, mimeType: 'image/png',
  });
}

export function submitEvidenceAs(
  context: IdentityTestContext,
  sessionCookie: string,
  taskId: number,
  formData: Record<string, unknown>,
): Promise<ApiResponse> {
  return callApi(context, 'PUT', `/api/tasks/${taskId}/evidence`, {
    sessionCookie,
    body: { formData },
  });
}

export function completeAs(
  context: IdentityTestContext,
  sessionCookie: string,
  taskId: number,
): Promise<ApiResponse> {
  return callApi(context, 'POST', `/api/tasks/${taskId}/complete`, { sessionCookie });
}

export async function getWorkflow(
  context: IdentityTestContext,
  cast: WorkflowCast,
  workflowId: number,
): Promise<WorkflowView> {
  return workflowOf(
    await callApi(context, 'GET', `/api/workflows/${workflowId}`, {
      sessionCookie: cast.cookies.admin,
    }),
  );
}
