import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startWorkflow } from '../src/modules/workflow/application/start-workflow.js';
import { completeTask } from '../src/modules/workflow/application/task-commands.js';
import {
  callApi,
  resetIdentityTables,
  startIdentityTestContext,
  type IdentityTestContext,
} from './identity-test-harness.js';
import {
  assignStandardParticipants,
  completeAs,
  getWorkflow,
  givenCast,
  givenProperty,
  startWorkflowFor,
  statusesOf,
  submitEvidenceAs,
  SYNTHETIC_EVIDENCE,
  taskOf,
  workflowOf,
  type WorkflowCast,
  type WorkflowView,
} from './workflow-test-helpers.js';

const TASK_ORDER = [
  'ASSIGN_MANAGER_AND_BIDDER',
  'GENERATE_VALE_VISTA_LETTER',
  'SEND_LETTER_TO_GENERAL_MANAGER',
  'SEND_LETTER_TO_BANK',
  'PREPARE_SUBMISSION_FORM',
  'PRE_DELIVERY_LEGAL_REVIEW',
  'COLLECT_VALE_VISTA',
  'DELIVER_VALE_VISTA_AND_FORM',
  'RECORD_DELIVERY_EVIDENCE',
  'FINAL_LEGAL_REVIEW',
  'PREPARE_PARTICIPATION',
  'PRE_AUCTION_ALERTS',
  'ENTER_VIRTUAL_ROOM',
  'PARTICIPATE_IN_AUCTION',
  'RECORD_AUCTION_RESULT',
];

describe('motor del workflow', () => {
  let context: IdentityTestContext;
  let cast: WorkflowCast;

  beforeAll(async () => {
    context = await startIdentityTestContext();
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    cast = await givenCast(context);
  });

  const workflowDeps = () => ({ database: context.database, clock: context.clock });

  async function startAndAssign(): Promise<WorkflowView> {
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));
    expect((await assignStandardParticipants(context, cast, workflow.id)).status).toBe(200);
    return getWorkflow(context, cast, workflow.id);
  }

  // Completa la tarea; si exige evidencia, primero envía una evidencia sintética válida.
  async function completeByCode(workflowId: number, code: string, cookie = cast.cookies.admin) {
    const task = taskOf(await getWorkflow(context, cast, workflowId), code);
    const evidence = SYNTHETIC_EVIDENCE[code];
    if (task.requiresEvidence && evidence) {
      expect((await submitEvidenceAs(context, cookie, task.id, evidence)).status).toBe(200);
    }
    return completeAs(context, cookie, task.id);
  }

  it('el inicio es idempotente y solo activa la primera tarea, asignada a un admin', async () => {
    const propertyId = await givenProperty(context);

    const first = await callApi(context, 'POST', `/api/properties/${propertyId}/workflow`, {
      sessionCookie: cast.cookies.admin,
    });
    const second = await callApi(context, 'POST', `/api/properties/${propertyId}/workflow`, {
      sessionCookie: cast.cookies.admin,
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const workflow = workflowOf(first);
    expect(workflowOf(second).id).toBe(workflow.id);
    expect(workflow.tasks.map((task) => task.code)).toEqual(TASK_ORDER);
    const firstTask = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER');
    expect(firstTask).toMatchObject({ status: 'READY', assignee: { id: cast.admin.id } });
    // Plazo provisorio: 3 días desde la activación (12 nov 12:00 UTC).
    expect(firstTask.dueAt).toBe('2026-11-15T12:00:00.000Z');
    expect(workflow.tasks.filter((task) => task.status !== 'BLOCKED')).toHaveLength(1);
  });

  it('dos inicios concurrentes de la misma propiedad crean un solo workflow', async () => {
    const propertyId = await givenProperty(context);

    const outcomes = await Promise.all([
      startWorkflow(workflowDeps(), cast.admin.id, propertyId),
      startWorkflow(workflowDeps(), cast.admin.id, propertyId),
    ]);

    const ids = outcomes.map((outcome) => (outcome.isSuccess ? outcome.value.workflowId : null));
    expect(ids[0]).not.toBeNull();
    expect(ids[0]).toBe(ids[1]);
    const [rows] = await context.database.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM workflow_instances WHERE property_id = ?',
      [propertyId],
    );
    expect(rows[0]?.total).toBe(1);
  });

  it('«Asignar gestor y postor» exige participantes y al completarse abre tres tareas en paralelo', async () => {
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));
    const firstTaskId = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER').id;

    expect(await completeAs(context, cast.cookies.admin, firstTaskId)).toMatchObject({
      status: 409,
      body: { code: 'PARTICIPANTS_REQUIRED' },
    });

    await assignStandardParticipants(context, cast, workflow.id);
    const after = workflowOf(await completeAs(context, cast.cookies.admin, firstTaskId));

    expect(statusesOf(after)).toMatchObject({
      ASSIGN_MANAGER_AND_BIDDER: 'COMPLETED',
      GENERATE_VALE_VISTA_LETTER: 'READY',
      PREPARE_SUBMISSION_FORM: 'READY',
      PRE_DELIVERY_LEGAL_REVIEW: 'READY',
      SEND_LETTER_TO_GENERAL_MANAGER: 'BLOCKED',
    });
    expect(taskOf(after, 'PREPARE_SUBMISSION_FORM')).toMatchObject({
      assignee: { id: cast.manager.id },
      backup: { id: cast.backupManager.id },
    });
    expect(taskOf(after, 'PRE_DELIVERY_LEGAL_REVIEW').assignee?.id).toBe(cast.legal.id);
  });

  it('una tarea con dos requisitos espera a ambos', async () => {
    const workflow = await startAndAssign();
    for (const code of [
      'ASSIGN_MANAGER_AND_BIDDER',
      'GENERATE_VALE_VISTA_LETTER',
      'SEND_LETTER_TO_GENERAL_MANAGER',
      'SEND_LETTER_TO_BANK',
      'COLLECT_VALE_VISTA',
    ]) {
      expect((await completeByCode(workflow.id, code)).status).toBe(200);
    }
    expect(
      taskOf(await getWorkflow(context, cast, workflow.id), 'DELIVER_VALE_VISTA_AND_FORM').status,
    ).toBe('BLOCKED');

    const after = workflowOf(
      await completeByCode(workflow.id, 'PREPARE_SUBMISSION_FORM', cast.cookies.manager),
    );
    expect(taskOf(after, 'DELIVER_VALE_VISTA_AND_FORM').status).toBe('READY');
  });

  it('recorre el flujo completo hasta COMPLETED y deja historial de cada paso', async () => {
    const workflow = await startAndAssign();

    for (const code of TASK_ORDER) {
      expect((await completeByCode(workflow.id, code)).status).toBe(200);
    }

    const finished = await getWorkflow(context, cast, workflow.id);
    expect(finished.status).toBe('COMPLETED');
    expect(new Set(Object.values(statusesOf(finished)))).toEqual(new Set(['COMPLETED']));

    const events = await callApi(context, 'GET', `/api/workflows/${workflow.id}/events`, {
      sessionCookie: cast.cookies.admin,
    });
    const types = (events.body as { events: { eventType: string }[] }).events.map(
      (event) => event.eventType,
    );
    expect(types[0]).toBe('WORKFLOW_CREATED');
    expect(types.filter((type) => type === 'TASK_COMPLETED')).toHaveLength(15);
    expect(types.filter((type) => type === 'TASK_ACTIVATED')).toHaveLength(15);
    expect(types.at(-1)).toBe('WORKFLOW_COMPLETED');
  });

  it('solo el responsable, su suplente o un admin pueden trabajar una tarea', async () => {
    const workflow = await startAndAssign();
    await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');
    const formTaskId = taskOf(
      await getWorkflow(context, cast, workflow.id),
      'PREPARE_SUBMISSION_FORM',
    ).id;

    expect(await completeAs(context, cast.cookies.bidder, formTaskId)).toMatchObject({
      status: 403,
      body: { code: 'FORBIDDEN' },
    });
    expect((await completeAs(context, cast.cookies.admin, formTaskId)).status).toBe(200);
    expect(await completeAs(context, cast.cookies.admin, formTaskId)).toMatchObject({
      status: 409,
      body: { code: 'TASK_NOT_OPEN' },
    });
  });

  it('cuando el suplente actúa pasa a ser titular del rol en todo el workflow', async () => {
    const workflow = await startAndAssign();
    await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');
    const formTaskId = taskOf(
      await getWorkflow(context, cast, workflow.id),
      'PREPARE_SUBMISSION_FORM',
    ).id;

    const response = await callApi(context, 'POST', `/api/tasks/${formTaskId}/start`, {
      sessionCookie: cast.cookies.backupManager,
    });
    expect(response.status).toBe(200);

    const after = await getWorkflow(context, cast, workflow.id);
    expect(taskOf(after, 'PREPARE_SUBMISSION_FORM')).toMatchObject({
      status: 'IN_PROGRESS',
      assignee: { id: cast.backupManager.id },
      backup: null,
    });
    const managers = after.participants.filter(
      (participant) => participant.participantType === 'MANAGER',
    );
    expect(
      managers.map((participant) => [participant.assignmentType, participant.user?.id]),
    ).toEqual([['PRIMARY', cast.backupManager.id]]);
    // El titular anterior ya no puede trabajarla.
    expect((await completeAs(context, cast.cookies.manager, formTaskId)).status).toBe(403);

    // Las tareas futuras del rol también son del nuevo titular.
    for (const code of [
      'GENERATE_VALE_VISTA_LETTER',
      'SEND_LETTER_TO_GENERAL_MANAGER',
      'SEND_LETTER_TO_BANK',
    ]) {
      await completeByCode(workflow.id, code);
    }
    expect(
      taskOf(await getWorkflow(context, cast, workflow.id), 'COLLECT_VALE_VISTA').assignee?.id,
    ).toBe(cast.backupManager.id);
  });

  it('dos completaciones simultáneas de la misma tarea: una gana y no se duplican activaciones', async () => {
    const workflow = await startAndAssign();
    const taskId = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER').id;
    const actor = { id: cast.admin.id, roles: cast.admin.roles };

    const outcomes = await Promise.all([
      completeTask(workflowDeps(), actor, taskId),
      completeTask(workflowDeps(), actor, taskId),
    ]);

    expect(outcomes.map((outcome) => outcome.isSuccess).sort()).toEqual([false, true]);
    expect(outcomes.find((outcome) => !outcome.isSuccess)).toEqual({
      isSuccess: false,
      failure: 'TASK_NOT_OPEN',
    });
    const [rows] = await context.database.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM workflow_events
        WHERE workflow_instance_id = ? AND event_type = 'TASK_ACTIVATED'`,
      [workflow.id],
    );
    // 1 al iniciar + 3 al completar la primera tarea.
    expect(rows[0]?.total).toBe(4);
  });

  it('ya no existe registro de avance: el endpoint no está', async () => {
    const workflow = await startAndAssign();
    const taskId = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER').id;

    const response = await callApi(context, 'POST', `/api/tasks/${taskId}/progress`, {
      sessionCookie: cast.cookies.admin,
      body: { progressPercentage: 50 },
    });

    expect(response.status).toBe(404);
  });

  describe('evidencia', () => {
    // Lleva el workflow hasta que «Retirar Vale Vista» (exige evidencia) esté abierta.
    async function workflowAtCollectValeVista(): Promise<{ workflowId: number; taskId: number }> {
      const workflow = await startAndAssign();
      for (const code of [
        'ASSIGN_MANAGER_AND_BIDDER',
        'GENERATE_VALE_VISTA_LETTER',
        'SEND_LETTER_TO_GENERAL_MANAGER',
        'SEND_LETTER_TO_BANK',
      ]) {
        await completeByCode(workflow.id, code);
      }
      const task = taskOf(await getWorkflow(context, cast, workflow.id), 'COLLECT_VALE_VISTA');
      expect(task).toMatchObject({ status: 'READY', requiresEvidence: true, evidence: null });
      return { workflowId: workflow.id, taskId: task.id };
    }

    it('no se completa sin evidencia; con evidencia válida sí', async () => {
      const { taskId } = await workflowAtCollectValeVista();

      expect(await completeAs(context, cast.cookies.manager, taskId)).toMatchObject({
        status: 409,
        body: { code: 'EVIDENCE_REQUIRED' },
      });

      const saved = workflowOf(
        await submitEvidenceAs(
          context,
          cast.cookies.manager,
          taskId,
          SYNTHETIC_EVIDENCE.COLLECT_VALE_VISTA ?? {},
        ),
      );
      expect(taskOf(saved, 'COLLECT_VALE_VISTA').evidence?.formData).toEqual(
        SYNTHETIC_EVIDENCE.COLLECT_VALE_VISTA,
      );
      expect((await completeAs(context, cast.cookies.manager, taskId)).status).toBe(200);
    });

    it('rechaza evidencia inválida e informa los campos, sin guardar nada', async () => {
      const { workflowId, taskId } = await workflowAtCollectValeVista();

      const response = await submitEvidenceAs(context, cast.cookies.manager, taskId, {
        bank: 'Banco',
        amountClp: -5,
        extra: 'no permitido',
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'INVALID_EVIDENCE' });
      expect((response.body as { invalidFields: string[] }).invalidFields.sort()).toEqual([
        'amountClp',
        'extra',
        'valeVistaNumber',
      ]);
      expect(
        taskOf(await getWorkflow(context, cast, workflowId), 'COLLECT_VALE_VISTA').evidence,
      ).toBeNull();
    });

    it('volver a enviar reemplaza la evidencia vigente', async () => {
      const { workflowId, taskId } = await workflowAtCollectValeVista();
      const first = SYNTHETIC_EVIDENCE.COLLECT_VALE_VISTA ?? {};

      await submitEvidenceAs(context, cast.cookies.manager, taskId, first);
      await submitEvidenceAs(context, cast.cookies.manager, taskId, {
        ...first,
        bank: 'Otro banco',
      });

      expect(
        taskOf(await getWorkflow(context, cast, workflowId), 'COLLECT_VALE_VISTA').evidence
          ?.formData,
      ).toMatchObject({ bank: 'Otro banco' });
      const [rows] = await context.database.pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS total FROM task_evidence_submissions WHERE task_instance_id = ?',
        [taskId],
      );
      expect(rows[0]?.total).toBe(1);
    });

    it('enviar evidencia como suplente lo convierte en titular', async () => {
      const { workflowId, taskId } = await workflowAtCollectValeVista();

      await submitEvidenceAs(
        context,
        cast.cookies.backupManager,
        taskId,
        SYNTHETIC_EVIDENCE.COLLECT_VALE_VISTA ?? {},
      );

      expect(
        taskOf(await getWorkflow(context, cast, workflowId), 'COLLECT_VALE_VISTA').assignee?.id,
      ).toBe(cast.backupManager.id);
    });

    it('una tarea sin formulario rechaza evidencia y un ajeno no puede enviarla', async () => {
      const { workflowId, taskId } = await workflowAtCollectValeVista();
      const withoutForm = taskOf(
        await getWorkflow(context, cast, workflowId),
        'PREPARE_SUBMISSION_FORM',
      );

      expect(
        (await submitEvidenceAs(context, cast.cookies.manager, withoutForm.id, { any: 1 })).body,
      ).toMatchObject({ code: 'EVIDENCE_NOT_APPLICABLE' });
      expect(
        (
          await submitEvidenceAs(
            context,
            cast.cookies.bidder,
            taskId,
            SYNTHETIC_EVIDENCE.COLLECT_VALE_VISTA ?? {},
          )
        ).status,
      ).toBe(403);
    });

    it('«Registrar resultado» adjudicado exige el monto', async () => {
      const workflow = await startAndAssign();
      for (const code of TASK_ORDER.slice(0, -1)) await completeByCode(workflow.id, code);
      const taskId = taskOf(
        await getWorkflow(context, cast, workflow.id),
        'RECORD_AUCTION_RESULT',
      ).id;

      const withoutAmount = await submitEvidenceAs(context, cast.cookies.bidder, taskId, {
        outcome: 'AWARDED',
      });
      expect(withoutAmount.body).toMatchObject({
        code: 'INVALID_EVIDENCE',
        invalidFields: ['awardedAmountClp'],
      });
    });
  });

  describe('listados', () => {
    it('el tablero muestra todo al admin y solo lo propio a los demás', async () => {
      const mine = await startAndAssign();
      await startWorkflowFor(context, cast, await givenProperty(context));

      const list = async (cookie: string) =>
        (await callApi(context, 'GET', '/api/workflows', { sessionCookie: cookie })).body as {
          workflows: { id: number; openTaskCount: number }[];
          total: number;
        };

      expect((await list(cast.cookies.admin)).total).toBe(2);
      const managerView = await list(cast.cookies.manager);
      expect(managerView.workflows.map((workflow) => workflow.id)).toEqual([mine.id]);
      expect(managerView.workflows[0]?.openTaskCount).toBe(1);
    });

    it('las propiedades solo las lista un admin, con filtro «sin workflow»', async () => {
      await startWorkflowFor(context, cast, await givenProperty(context));
      const withoutWorkflow = await givenProperty(context);

      const response = await callApi(context, 'GET', '/api/properties?withoutWorkflow=true', {
        sessionCookie: cast.cookies.admin,
      });

      expect(response.body).toMatchObject({
        total: 1,
        properties: [{ id: withoutWorkflow, workflow: null }],
      });
      expect(
        (await callApi(context, 'GET', '/api/properties', { sessionCookie: cast.cookies.manager }))
          .status,
      ).toBe(403);
    });

    it('el listado de usuarios se filtra por rol', async () => {
      const response = await callApi(context, 'GET', '/api/users?role=MANAGER', {
        sessionCookie: cast.cookies.admin,
      });

      expect(
        (response.body as { users: { id: number }[] }).users.map((user) => user.id).sort(),
      ).toEqual([cast.manager.id, cast.backupManager.id].sort());
    });
  });

  describe('suspensión', () => {
    it('sin nueva fecha suspende el workflow y sus tareas; reanudar exige la fecha', async () => {
      const workflow = await startAndAssign();
      await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');
      const formTaskId = taskOf(
        await getWorkflow(context, cast, workflow.id),
        'PREPARE_SUBMISSION_FORM',
      ).id;
      await callApi(context, 'POST', `/api/tasks/${formTaskId}/start`, {
        sessionCookie: cast.cookies.manager,
      });

      expect(
        (
          await callApi(context, 'POST', `/api/workflows/${workflow.id}/suspend`, {
            sessionCookie: cast.cookies.manager,
            body: { reason: 'Sin permiso' },
          })
        ).status,
      ).toBe(403);

      const suspended = workflowOf(
        await callApi(context, 'POST', `/api/workflows/${workflow.id}/suspend`, {
          sessionCookie: cast.cookies.legal,
          body: { reason: 'Revisión de títulos' },
        }),
      );
      expect(suspended.status).toBe('SUSPENDED');
      expect(statusesOf(suspended)).toMatchObject({
        ASSIGN_MANAGER_AND_BIDDER: 'COMPLETED',
        GENERATE_VALE_VISTA_LETTER: 'SUSPENDED',
        PREPARE_SUBMISSION_FORM: 'SUSPENDED',
        SEND_LETTER_TO_BANK: 'BLOCKED',
      });
      expect((await completeAs(context, cast.cookies.admin, formTaskId)).body).toMatchObject({
        code: 'WORKFLOW_NOT_ACTIVE',
      });

      const resumeWithoutDate = await callApi(
        context,
        'POST',
        `/api/workflows/${workflow.id}/resume`,
        {
          sessionCookie: cast.cookies.legal,
          body: {},
        },
      );
      expect(resumeWithoutDate).toMatchObject({
        status: 400,
        body: { code: 'NEW_AUCTION_DATE_REQUIRED' },
      });

      context.clock.advanceMinutes(2 * 60);
      const resumed = workflowOf(
        await callApi(context, 'POST', `/api/workflows/${workflow.id}/resume`, {
          sessionCookie: cast.cookies.legal,
          body: { newAuctionAt: '2026-12-20T10:00:00-03:00', reason: 'Nueva fecha fijada' },
        }),
      );
      expect(resumed).toMatchObject({ status: 'ACTIVE', auctionAt: '2026-12-20T13:00:00.000Z' });
      expect(statusesOf(resumed)).toMatchObject({
        GENERATE_VALE_VISTA_LETTER: 'READY',
        PREPARE_SUBMISSION_FORM: 'IN_PROGRESS',
      });
      // El plazo desde la activación vuelve a correr desde la reanudación (12 nov 14:00 UTC).
      expect(taskOf(resumed, 'PREPARE_SUBMISSION_FORM').dueAt).toBe('2026-11-15T14:00:00.000Z');
    });

    it('con nueva fecha el workflow sigue activo, se reprograma y las completadas no cambian', async () => {
      const workflow = await startAndAssign();
      await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');
      const before = await getWorkflow(context, cast, workflow.id);

      context.clock.advanceMinutes(60);
      const after = workflowOf(
        await callApi(context, 'POST', `/api/workflows/${workflow.id}/suspend`, {
          sessionCookie: cast.cookies.admin,
          body: {
            reason: 'Tribunal suspendió el remate',
            newAuctionAt: '2026-12-21T09:30:00-03:00',
          },
        }),
      );

      expect(after).toMatchObject({ status: 'ACTIVE', auctionAt: '2026-12-21T12:30:00.000Z' });
      expect(taskOf(after, 'ASSIGN_MANAGER_AND_BIDDER').dueAt).toBe(
        taskOf(before, 'ASSIGN_MANAGER_AND_BIDDER').dueAt,
      );
      expect(taskOf(after, 'PREPARE_SUBMISSION_FORM').dueAt).toBe('2026-11-15T13:00:00.000Z');

      const [rows] = await context.database.pool.query<RowDataPacket[]>(
        `SELECT origin, status, previous_auction_at AS previousAuctionAt, new_auction_at AS newAuctionAt
           FROM workflow_reprogrammings WHERE workflow_instance_id = ?`,
        [workflow.id],
      );
      expect(rows).toEqual([
        {
          origin: 'USER',
          status: 'APPLIED',
          previousAuctionAt: new Date('2026-12-07T13:00:00.000Z'),
          newAuctionAt: new Date('2026-12-21T12:30:00.000Z'),
        },
      ]);
    });

    it('cancelar cierra las tareas abiertas y no se puede reanudar', async () => {
      const workflow = await startAndAssign();
      await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');

      const cancelled = workflowOf(
        await callApi(context, 'POST', `/api/workflows/${workflow.id}/cancel`, {
          sessionCookie: cast.cookies.legal,
          body: { reason: 'Problema legal' },
        }),
      );

      expect(cancelled.status).toBe('CANCELLED');
      expect(new Set(Object.values(statusesOf(cancelled)))).toEqual(
        new Set(['COMPLETED', 'CANCELLED']),
      );
      expect(
        (
          await callApi(context, 'POST', `/api/workflows/${workflow.id}/resume`, {
            sessionCookie: cast.cookies.legal,
            body: { newAuctionAt: '2026-12-20T10:00:00-03:00' },
          })
        ).body,
      ).toMatchObject({ code: 'WORKFLOW_NOT_SUSPENDED' });
    });
  });

  it('editar el plazo de una tarea afecta solo a ese workflow, no a la plantilla ni a otros', async () => {
    const first = await startAndAssign();
    const second = await startWorkflowFor(context, cast, await givenProperty(context));
    const taskId = taskOf(first, 'ASSIGN_MANAGER_AND_BIDDER').id;

    const changed = workflowOf(
      await callApi(context, 'PUT', `/api/tasks/${taskId}/deadline`, {
        sessionCookie: cast.cookies.admin,
        body: { dueReference: 'AUCTION_AT', dueOffsetDays: -5, dueOffsetMinutes: 0 },
      }),
    );

    // 5 días antes del remate del 7 dic a las 10:00 de Santiago.
    expect(taskOf(changed, 'ASSIGN_MANAGER_AND_BIDDER')).toMatchObject({
      dueAt: '2026-12-02T13:00:00.000Z',
      deadline: { dueReference: 'AUCTION_AT', dueOffsetDays: -5 },
    });
    expect(
      taskOf(await getWorkflow(context, cast, second.id), 'ASSIGN_MANAGER_AND_BIDDER').deadline,
    ).toEqual({
      dueReference: 'TASK_ACTIVATED_AT',
      dueOffsetDays: 3,
      dueOffsetMinutes: 0,
    });
    const [rows] = await context.database.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT due_reference AS dueReference, due_offset_days AS days FROM task_definitions`,
    );
    expect(rows).toEqual([{ dueReference: 'TASK_ACTIVATED_AT', days: 3 }]);

    expect(
      (
        await callApi(context, 'PUT', `/api/tasks/${taskId}/deadline`, {
          sessionCookie: cast.cookies.manager,
          body: { dueReference: 'AUCTION_AT', dueOffsetDays: 1 },
        })
      ).status,
    ).toBe(403);
  });

  it('una referencia de negocio sin fecha deja la tarea sin vencimiento', async () => {
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context, null));
    const taskId = taskOf(workflow, 'ASSIGN_MANAGER_AND_BIDDER').id;

    const changed = workflowOf(
      await callApi(context, 'PUT', `/api/tasks/${taskId}/deadline`, {
        sessionCookie: cast.cookies.admin,
        body: { dueReference: 'AUCTION_AT', dueOffsetDays: -1 },
      }),
    );

    expect(taskOf(changed, 'ASSIGN_MANAGER_AND_BIDDER').dueAt).toBeNull();
  });

  it('«mis tareas» muestra las del titular y las del suplente, y el detalle se restringe a participantes', async () => {
    const workflow = await startAndAssign();
    await completeByCode(workflow.id, 'ASSIGN_MANAGER_AND_BIDDER');

    const mine = async (cookie: string) =>
      (
        (await callApi(context, 'GET', '/api/tasks/mine', { sessionCookie: cookie })).body as {
          tasks: { code: string; role: string }[];
        }
      ).tasks;

    expect(await mine(cast.cookies.manager)).toEqual([
      expect.objectContaining({ code: 'PREPARE_SUBMISSION_FORM', role: 'ASSIGNEE' }),
    ]);
    expect(await mine(cast.cookies.backupManager)).toEqual([
      expect.objectContaining({ code: 'PREPARE_SUBMISSION_FORM', role: 'BACKUP' }),
    ]);

    const outsider = await callApi(context, 'GET', `/api/workflows/${workflow.id}`, {
      sessionCookie: await (async () => {
        const { givenUser, logInAs } = await import('./identity-test-harness.js');
        await givenUser(context, { email: 'ajeno@example.test', roles: ['MANAGER'] });
        return logInAs(context, 'ajeno@example.test');
      })(),
    });
    expect(outsider.status).toBe(403);
  });

  it('rechaza participantes sin el rol correspondiente', async () => {
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));

    const response = await callApi(context, 'PUT', `/api/workflows/${workflow.id}/participants`, {
      sessionCookie: cast.cookies.admin,
      body: { assignments: [{ participantType: 'MANAGER', primaryUserId: cast.bidder.id }] },
    });

    expect(response).toMatchObject({ status: 400, body: { code: 'INVALID_PARTICIPANT' } });
  });
});
