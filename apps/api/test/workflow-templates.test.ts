import type { RowDataPacket } from 'mysql2';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  callApi,
  resetIdentityTables,
  startIdentityTestContext,
  type ApiResponse,
  type IdentityTestContext,
} from './identity-test-harness.js';
import {
  givenCast,
  givenProperty,
  startWorkflowFor,
  type WorkflowCast,
} from './workflow-test-helpers.js';

interface TaskView {
  code: string;
  name: string;
  description: string | null;
  responsibleRole: string;
  requiresEvidence: boolean;
  dueReference: string;
  dueOffsetDays: number;
  dueOffsetMinutes: number;
  dependsOn: string[];
  evidenceForm: { fields: { name: string }[] } | null;
}

// Fuente de feriados falsa: el viernes 13 de noviembre de 2026 (día siguiente al inicio de las
// pruebas) es feriado, y la fuente repite un día para probar la consolidación.
const fakeHolidayProvider = {
  fetchYear: (year: number) =>
    Promise.resolve(
      year === 2026
        ? [
            { date: '2026-11-13', name: 'Feriado de prueba', isInalienable: false },
            { date: '2026-12-08', name: 'Inmaculada Concepción', isInalienable: false },
            { date: '2026-12-08', name: 'Otra celebración', isInalienable: true },
          ]
        : null,
    ),
};

interface TemplateView {
  id: number;
  code: string;
  name: string;
  version: number;
  status: string;
  isActive: boolean;
  deadlineDayKind: string;
  taskCount: number;
  workflowCount: number;
  tasks: TaskView[];
}

const templateOf = (response: ApiResponse): TemplateView => {
  const body = response.body as { template?: TemplateView } | undefined;
  if (!body?.template) throw new Error(`Respuesta sin plantilla (HTTP ${response.status})`);
  return body.template;
};

const problemOf = (response: ApiResponse) =>
  response.body as { code: string; issues?: { kind: string }[] };

// Tablas de ejecución que referencian plantillas; se vacían antes de borrar las de prueba.
const INSTANCE_TABLES = [
  'notification_jobs',
  'notifications',
  'notification_outbox',
  'workflow_notification_rule_sets',
  'workflow_events',
  'task_evidence_submissions',
  'task_instances',
  'workflow_participants',
  'workflow_reprogrammings',
  'workflow_instances',
];

describe('administración de plantillas de flujo', () => {
  let context: IdentityTestContext;
  let cast: WorkflowCast;

  const api = (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    sessionCookie = cast.cookies.admin,
  ) =>
    callApi(context, method, `/api/workflow-templates${path}`, {
      sessionCookie,
      ...(body === undefined ? {} : { body }),
    });

  async function activeTemplate(): Promise<TemplateView> {
    const listed = await api('GET', '');
    const templates = (listed.body as { templates: TemplateView[] }).templates;
    const active = templates.find((template) => template.isActive);
    if (!active) throw new Error('No hay plantilla activa');
    return active;
  }

  beforeAll(async () => {
    context = await startIdentityTestContext({ holidayProvider: fakeHolidayProvider });
  });

  afterAll(async () => {
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    cast = await givenCast(context);
  });

  // Las plantillas creadas por las pruebas tienen autor; las del seed no. Se borran para que las
  // demás suites sigan usando la v2 del seed como activa.
  afterEach(async () => {
    const { pool } = context.database;
    for (const table of INSTANCE_TABLES) await pool.query(`DELETE FROM ${table}`);
    await pool.query(`
      DELETE rule FROM notification_rules AS rule
        JOIN notification_rule_sets AS rule_set ON rule_set.id = rule.rule_set_id
        JOIN workflow_templates AS template ON template.id = rule_set.workflow_template_id
       WHERE template.created_by IS NOT NULL`);
    await pool.query(`
      DELETE rule_set FROM notification_rule_sets AS rule_set
        JOIN workflow_templates AS template ON template.id = rule_set.workflow_template_id
       WHERE template.created_by IS NOT NULL`);
    await pool.query(`
      DELETE dependency FROM task_dependencies AS dependency
        JOIN task_definitions AS definition ON definition.id = dependency.task_definition_id
        JOIN workflow_templates AS template ON template.id = definition.workflow_template_id
       WHERE template.created_by IS NOT NULL`);
    await pool.query(`
      DELETE definition FROM task_definitions AS definition
        JOIN workflow_templates AS template ON template.id = definition.workflow_template_id
       WHERE template.created_by IS NOT NULL`);
    await pool.query('DELETE FROM workflow_templates WHERE created_by IS NOT NULL');
    await pool.query(`
      UPDATE workflow_templates
         SET status = 'PUBLISHED', archived_at = NULL, archived_by = NULL,
             is_active = (code = 'REMATE_JUDICIAL' AND version = 2)`);
  });

  it('solo el administrador puede ver y cambiar plantillas', async () => {
    const forbidden = await api('GET', '', undefined, cast.cookies.manager);
    expect(forbidden.status).toBe(403);

    const catalog = await api('GET', '/catalog');
    expect(catalog.status).toBe(200);
    expect(catalog.body).toMatchObject({
      participantAssignmentTaskCode: 'ASSIGN_MANAGER_AND_BIDDER',
      evidenceFieldTypes: expect.arrayContaining(['TEXT', 'CHOICE']) as unknown,
    });
  });

  it('una nueva versión se edita como borrador, se publica y la usan los workflows nuevos', async () => {
    const v2 = await activeTemplate();
    expect(v2).toMatchObject({ code: 'REMATE_JUDICIAL', version: 2, status: 'PUBLISHED' });

    const created = await api('POST', '', { sourceTemplateId: v2.id });
    expect(created.status).toBe(201);
    const draft = templateOf(created);
    expect(draft).toMatchObject({ version: 3, status: 'DRAFT', isActive: false, taskCount: 15 });

    const lastTask = draft.tasks.at(-1);
    if (!lastTask) throw new Error('El borrador no copió las tareas');
    // La copia guarda el formulario vigente de las tareas heredadas.
    expect(
      draft.tasks
        .find((task) => task.code === 'COLLECT_VALE_VISTA')
        ?.evidenceForm?.fields.map((field) => field.name),
    ).toEqual(['bank', 'valeVistaNumber', 'amountClp']);
    const closingForm = {
      fields: [
        { name: 'archiveNumber', label: 'N° de archivo', type: 'TEXT', isRequired: true },
        {
          name: 'channel',
          label: 'Canal',
          type: 'CHOICE',
          isRequired: false,
          options: [{ value: 'MAIL', label: 'Correo' }],
        },
      ],
    };
    const saved = await api('PUT', `/${draft.id}`, {
      name: 'Remate judicial (con cierre)',
      tasks: [
        ...draft.tasks,
        {
          code: 'CLOSE_FILE',
          name: 'Cerrar expediente',
          description: '',
          responsibleRole: 'ADMIN',
          requiresEvidence: true,
          dueReference: 'TASK_ACTIVATED_AT',
          dueOffsetDays: 5,
          dueOffsetMinutes: 0,
          dependsOn: [lastTask.code],
          position: { x: 640, y: 480 },
          evidenceForm: closingForm,
        },
      ],
    });
    expect(saved.status).toBe(200);
    expect(templateOf(saved)).toMatchObject({
      name: 'Remate judicial (con cierre)',
      taskCount: 16,
    });
    expect(templateOf(saved).tasks.at(-1)).toMatchObject({
      code: 'CLOSE_FILE',
      description: null,
      dependsOn: [lastTask.code],
      position: { x: 640, y: 480 },
      evidenceForm: closingForm,
    });

    const published = await api('POST', `/${draft.id}/publish`);
    expect(published.status).toBe(200);
    expect(templateOf(published)).toMatchObject({ status: 'PUBLISHED', isActive: true });
    expect((await activeTemplate()).id).toBe(draft.id);

    // Una versión publicada es inmutable.
    const edited = await api('PUT', `/${draft.id}`, { name: 'Otro', tasks: [] });
    expect(problemOf(edited).code).toBe('TEMPLATE_NOT_DRAFT');
    expect((await api('DELETE', `/${draft.id}`)).status).toBe(409);

    // Los workflows nuevos usan la v3 y heredan las reglas de notificación de la v2.
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));
    expect(workflow.tasks.map((task) => task.code)).toContain('CLOSE_FILE');
    const detail = await callApi(context, 'GET', `/api/workflows/${String(workflow.id)}`, {
      sessionCookie: cast.cookies.admin,
    });
    const closingTask = (
      detail.body as { workflow: { tasks: { code: string; evidenceForm: unknown }[] } }
    ).workflow.tasks.find((task) => task.code === 'CLOSE_FILE');
    expect(closingTask?.evidenceForm).toEqual(closingForm);
    const [ruleRows] = await context.database.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS rules
         FROM workflow_notification_rule_sets AS assignment
         JOIN notification_rule_sets AS rule_set ON rule_set.id = assignment.rule_set_id
         JOIN notification_rules AS rule ON rule.rule_set_id = rule_set.id
        WHERE assignment.workflow_instance_id = ? AND rule_set.workflow_template_id = ?`,
      [workflow.id, draft.id],
    );
    expect(ruleRows[0]?.rules).toBe(9);

    // La activa no se archiva; la anterior sí.
    expect(problemOf(await api('POST', `/${draft.id}/archive`)).code).toBe('TEMPLATE_ACTIVE');
    const archived = await api('POST', `/${v2.id}/archive`);
    expect(templateOf(archived)).toMatchObject({ status: 'ARCHIVED', isActive: false });
  });

  it('rechaza definiciones inválidas y publicar un flujo sin tareas', async () => {
    const created = await api('POST', '', { code: 'REMATE_PRUEBA', name: 'Flujo de prueba' });
    expect(created.status).toBe(201);
    const draft = templateOf(created);
    expect(draft).toMatchObject({ version: 1, status: 'DRAFT', taskCount: 0 });

    const emptyPublish = await api('POST', `/${draft.id}/publish`);
    expect(problemOf(emptyPublish)).toMatchObject({
      code: 'INVALID_TEMPLATE',
      issues: [{ kind: 'NO_TASKS' }],
    });

    const step = (code: string, dependsOn: string[], requiresEvidence = false) => ({
      code,
      name: code,
      description: null,
      responsibleRole: 'MANAGER',
      requiresEvidence,
      dueReference: 'TASK_ACTIVATED_AT',
      dueOffsetDays: 3,
      dueOffsetMinutes: 0,
      dependsOn,
    });
    const cyclic = await api('PUT', `/${draft.id}`, {
      name: 'Flujo de prueba',
      tasks: [step('A', ['B']), step('B', ['A']), step('C', [], true)],
    });
    expect(cyclic.status).toBe(400);
    expect(problemOf(cyclic).issues?.map((issue) => issue.kind)).toEqual([
      'EVIDENCE_FORM_MISSING',
      'DEPENDENCY_CYCLE',
    ]);

    const invalidCode = await api('PUT', `/${draft.id}`, {
      name: 'Flujo de prueba',
      tasks: [step('tarea minúscula', [])],
    });
    expect(problemOf(invalidCode).code).toBe('VALIDATION_FAILED');

    expect(problemOf(await api('POST', '', { sourceTemplateId: draft.id })).code).toBe(
      'TEMPLATE_DRAFT_EXISTS',
    );
    expect(problemOf(await api('POST', '', { code: 'REMATE_JUDICIAL', name: 'X' })).code).toBe(
      'TEMPLATE_CODE_TAKEN',
    );

    expect((await api('DELETE', `/${draft.id}`)).status).toBe(204);
    expect((await api('GET', `/${draft.id}`)).status).toBe(404);
  });

  it('las versiones nuevas cuentan los plazos en días hábiles, saltando feriados', async () => {
    const v2 = await activeTemplate();
    expect(v2.deadlineDayKind).toBe('CALENDAR');

    const holidaysApi = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) =>
      callApi(context, method, `/api/holidays${path}`, {
        sessionCookie: cast.cookies.admin,
        ...(body === undefined ? {} : { body }),
      });
    expect(
      (
        await callApi(context, 'POST', '/api/holidays/sync', {
          sessionCookie: cast.cookies.manager,
          body: { year: 2026 },
        })
      ).status,
    ).toBe(403);
    const synced = await holidaysApi('POST', '/sync', { year: 2026 });
    expect(synced.status).toBe(200);
    expect(synced.body).toMatchObject({
      canSync: true,
      holidays: [
        { date: '2026-11-13', source: 'BOOSTR' },
        {
          date: '2026-12-08',
          name: 'Inmaculada Concepción / Otra celebración',
          isInalienable: true,
        },
      ],
    });
    expect(problemOf(await holidaysApi('POST', '/sync', { year: 2027 })).code).toBe(
      'HOLIDAY_SOURCE_UNAVAILABLE',
    );
    expect(
      (await holidaysApi('POST', '', { date: '2026-12-31', name: 'Feriado bancario' })).status,
    ).toBe(201);
    expect(
      problemOf(await holidaysApi('POST', '', { date: '2026-12-31', name: 'Repetido' })).code,
    ).toBe('HOLIDAY_EXISTS');
    expect((await holidaysApi('DELETE', '/2026-12-31')).status).toBe(204);

    const draft = templateOf(await api('POST', '', { sourceTemplateId: v2.id }));
    expect(draft.deadlineDayKind).toBe('BUSINESS');
    const [first, ...rest] = draft.tasks;
    if (!first) throw new Error('El borrador no copió las tareas');
    await api('PUT', `/${draft.id}`, {
      name: draft.name,
      tasks: [
        { ...first, dueReference: 'TASK_ACTIVATED_AT', dueOffsetDays: 3, dueOffsetMinutes: 0 },
        ...rest,
      ],
    });
    await api('POST', `/${draft.id}/publish`);

    // Inicio: jueves 12 nov, 09:00. Se salta el viernes 13 (feriado) y el fin de semana:
    // lunes 16 (1), martes 17 (2), miércoles 18 (3).
    const workflow = await startWorkflowFor(context, cast, await givenProperty(context));
    const firstTask = workflow.tasks.find((task) => task.code === first.code);
    expect(firstTask?.dueAt).toBe('2026-11-18T12:00:00.000Z');
  });
});
