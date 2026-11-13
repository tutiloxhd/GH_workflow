import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  runAdminNewSync,
  type SyncDependencies,
  type SyncOutcome,
} from '../src/modules/admin-new-sync/application/run-sync.js';
import type { AdminNewSource } from '../src/modules/admin-new-sync/persistence/admin-new-source.js';
import { startSourceFixture, type SourceFixture } from './admin-new-source-fixture.js';
import {
  callApi,
  resetIdentityTables,
  startIdentityTestContext,
  type IdentityTestContext,
} from './identity-test-harness.js';
import { givenCast, givenProperty, type WorkflowCast } from './workflow-test-helpers.js';

// El reloj de pruebas parte el 12 nov 2026 a las 09:00 de Santiago.
const FUTURE_AUCTION = '2026-12-07';
const PAST_AUCTION = '2026-11-10';

describe('sincronización con admin_new', () => {
  let context: IdentityTestContext;
  let fixture: SourceFixture;

  beforeAll(async () => {
    context = await startIdentityTestContext();
    fixture = await startSourceFixture(context.database.pool);
  });

  afterAll(async () => {
    await fixture.close();
    await context.close();
  });

  beforeEach(async () => {
    await resetIdentityTables(context);
    await fixture.reset();
  });

  const dependencies = (source: AdminNewSource = fixture.source): SyncDependencies => ({
    database: context.database,
    clock: context.clock,
    source,
  });

  const sync = () => runAdminNewSync(dependencies());

  async function completedSync(): Promise<Extract<SyncOutcome, { kind: 'COMPLETED' }>> {
    const outcome = await sync();
    if (outcome.kind !== 'COMPLETED') throw new Error('La sincronización no se ejecutó');
    return outcome;
  }

  async function rows(statement: string, values: unknown[] = []): Promise<RowDataPacket[]> {
    const [result] = await context.database.pool.query<RowDataPacket[]>(statement, values);
    return result;
  }

  const propertyOf = async (adminNewId: number) =>
    (await rows('SELECT * FROM properties WHERE admin_new_id = ?', [adminNewId]))[0];

  const workflowsOf = (adminNewId: number) =>
    rows(
      `SELECT w.id, w.status FROM workflow_instances w
         JOIN properties p ON p.id = w.property_id WHERE p.admin_new_id = ?`,
      [adminNewId],
    );

  const changesOf = (adminNewId: number) =>
    rows(
      `SELECT c.change_type AS changeType, c.status, c.previous_values AS previousValues,
              c.current_values AS currentValues, c.processed_by AS processedBy, c.id
         FROM property_source_changes c JOIN properties p ON p.id = c.property_id
        WHERE p.admin_new_id = ? ORDER BY c.id`,
      [adminNewId],
    );

  const issueCodes = async (executionId: number) =>
    (
      await rows('SELECT code FROM sync_issues WHERE sync_execution_id = ? ORDER BY id', [
        executionId,
      ])
    ).map((row) => row.code as string);

  describe('propiedades nuevas', () => {
    it('una propiedad aceptada genera su workflow sola', async () => {
      await fixture.givenAccepted({ id: 101, r1: FUTURE_AUCTION, horaRemate: '10:30' });

      const outcome = await completedSync();

      expect(outcome.status).toBe('SUCCEEDED');
      expect(outcome.totals).toMatchObject({
        recordsRead: 1,
        recordsCreated: 1,
        recordsUpdated: 0,
        workflowsStarted: 1,
        errorCount: 0,
      });
      const property = await propertyOf(101);
      expect(property).toMatchObject({
        title: 'Propiedad sintética',
        commune: 'Ñuñoa',
        court: 'C.A. de Santiago',
        case_reference: 'c-0001-2026',
        guarantee_amount: '8100000.00',
        guarantee_window_end: '12:00:00',
      });
      // 10:30 en Santiago con horario de verano (UTC−3).
      expect((property?.auction_at as Date).toISOString()).toBe('2026-12-07T13:30:00.000Z');
      expect((property?.guarantee_payment_at as Date).toISOString()).toBe(
        '2026-12-04T15:00:00.000Z',
      );

      const workflows = await workflowsOf(101);
      expect(workflows).toHaveLength(1);
      expect(workflows[0]?.status).toBe('ACTIVE');
      const [taskCount] = await rows(
        'SELECT COUNT(*) AS n FROM task_instances WHERE workflow_instance_id = ?',
        [workflows[0]?.id],
      );
      expect(Number(taskCount?.n)).toBe(15);

      const changes = await changesOf(101);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ changeType: 'PROPERTY_ACCEPTED', status: 'PROCESSED' });

      const [cursor] = await rows("SELECT * FROM sync_cursors WHERE source_code = 'ADMIN_NEW'");
      expect(cursor).toMatchObject({ last_status: 'SUCCEEDED', last_source_id: 101 });
    });

    it('repetir la sincronización no duplica propiedades, workflows ni cambios', async () => {
      await fixture.givenAccepted({ id: 101, r1: FUTURE_AUCTION });
      await completedSync();

      const second = await completedSync();

      expect(second.totals).toMatchObject({
        recordsRead: 1,
        recordsCreated: 0,
        recordsUpdated: 0,
        workflowsStarted: 0,
        warningCount: 0,
      });
      expect(await rows('SELECT id FROM properties')).toHaveLength(1);
      expect(await workflowsOf(101)).toHaveLength(1);
      expect(await changesOf(101)).toHaveLength(1);
      expect(await rows('SELECT id FROM sync_executions')).toHaveLength(2);
    });

    it('dos ejecuciones simultáneas: una espera su turno y no hay duplicados', async () => {
      await fixture.givenAccepted({ id: 101, r1: FUTURE_AUCTION });

      const outcomes = await Promise.all([sync(), sync()]);

      expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual([
        'COMPLETED',
        'SKIPPED_ALREADY_RUNNING',
      ]);
      expect(await workflowsOf(101)).toHaveLength(1);
    });

    it('ignora propiedades no aceptadas', async () => {
      await fixture.givenAccepted({ id: 102, classificationId: 3, r1: FUTURE_AUCTION });

      const outcome = await completedSync();

      expect(outcome.totals.recordsRead).toBe(0);
      expect(await propertyOf(102)).toBeUndefined();
    });

    it('un remate ya ocurrido se copia sin iniciar workflow; si se reprograma a futuro, se inicia', async () => {
      await fixture.givenAccepted({ id: 103, r1: PAST_AUCTION });

      const first = await completedSync();

      expect(first.totals).toMatchObject({ recordsCreated: 1, workflowsStarted: 0 });
      expect(await workflowsOf(103)).toHaveLength(0);
      expect((await changesOf(103))[0]).toMatchObject({
        changeType: 'PROPERTY_ACCEPTED',
        status: 'IGNORED',
      });

      await fixture.setAuctionDate(103, FUTURE_AUCTION);
      const second = await completedSync();

      expect(second.totals).toMatchObject({ recordsUpdated: 1, workflowsStarted: 1 });
      expect(await workflowsOf(103)).toHaveLength(1);
      // Sin workflow abierto, la fecha nueva se aplica directamente.
      expect((await changesOf(103))[1]).toMatchObject({
        changeType: 'AUCTION_DATE_CHANGED',
        status: 'PROCESSED',
      });
    });

    it('un remate de hoy sí inicia workflow', async () => {
      await fixture.givenAccepted({ id: 104, r1: '2026-11-12', horaRemate: '08:00' });

      expect((await completedSync()).totals.workflowsStarted).toBe(1);
    });
  });

  describe('calidad de los datos de origen', () => {
    it('con filas duplicadas usa la de mayor id y lo advierte una sola vez', async () => {
      await fixture.givenAccepted({ id: 105, r1: '2026-12-01' });
      await fixture.addDetailRow(105, { r1: FUTURE_AUCTION });

      const first = await completedSync();

      expect(((await propertyOf(105))?.auction_at as Date).toISOString()).toBe(
        '2026-12-07T13:30:00.000Z',
      );
      expect(await issueCodes(first.executionId)).toEqual(['DUPLICATE_DETAIL_ROWS']);
      expect(first.status).toBe('SUCCEEDED');

      const second = await completedSync();
      expect(await issueCodes(second.executionId)).toEqual([]);
    });

    it('informa los valores inválidos y no los inventa', async () => {
      await fixture.givenAccepted({
        id: 106,
        r1: FUTURE_AUCTION,
        r2: 'a convenir',
        r3: '04/12/2026',
        horaRemate: null,
      });

      const outcome = await completedSync();

      expect(await issueCodes(outcome.executionId)).toEqual([
        'MISSING_AUCTION_TIME',
        'INVALID_AMOUNT',
        'INVALID_DATE',
      ]);
      const property = await propertyOf(106);
      expect(property?.guarantee_amount).toBeNull();
      expect(property?.guarantee_payment_at).toBeNull();
      // Sin hora conocida: 00:00 de Santiago.
      expect((property?.auction_at as Date).toISOString()).toBe('2026-12-07T03:00:00.000Z');
      expect(outcome.totals.warningCount).toBe(3);
    });

    it('si admin_new no responde, la ejecución queda FAILED y la siguiente funciona', async () => {
      const brokenSource: AdminNewSource = {
        readAcceptedProperties: () => Promise.reject(new Error('Conexión rechazada')),
        readClassifications: () => Promise.resolve(new Map()),
        close: () => Promise.resolve(),
      };

      const failed = await runAdminNewSync(dependencies(brokenSource));

      expect(failed).toMatchObject({ kind: 'COMPLETED', status: 'FAILED' });
      const [cursor] = await rows("SELECT * FROM sync_cursors WHERE source_code = 'ADMIN_NEW'");
      expect(cursor).toMatchObject({ last_status: 'FAILED', last_error: 'Conexión rechazada' });

      await fixture.givenAccepted({ id: 107, r1: FUTURE_AUCTION });
      expect((await completedSync()).status).toBe('SUCCEEDED');
    });
  });

  describe('cambios en propiedades ya sincronizadas', () => {
    it('un cambio de fecha con workflow abierto queda pendiente; los demás datos se aplican', async () => {
      await fixture.givenAccepted({ id: 108, r1: FUTURE_AUCTION });
      await completedSync();

      await fixture.setAuctionDate(108, '2026-12-14');
      await fixture.setCommune(108, 'Providencia');
      const outcome = await completedSync();

      expect(outcome.totals.recordsUpdated).toBe(1);
      const property = await propertyOf(108);
      expect(property?.commune).toBe('Providencia');
      // La fecha no se sobrescribe: la aplica la reprogramación, que recalcula los plazos.
      expect((property?.auction_at as Date).toISOString()).toBe('2026-12-07T13:30:00.000Z');

      const changes = await changesOf(108);
      expect(changes.slice(1)).toMatchObject([
        {
          changeType: 'AUCTION_DATE_CHANGED',
          status: 'PENDING',
          previousValues: { auctionAt: '2026-12-07T13:30:00.000Z' },
          currentValues: { auctionAt: '2026-12-14T13:30:00.000Z' },
        },
        {
          changeType: 'PROPERTY_DATA_CHANGED',
          status: 'PROCESSED',
          previousValues: { commune: 'Ñuñoa' },
          currentValues: { commune: 'Providencia' },
        },
      ]);

      // Sin nuevos cambios en el origen, no se repite el aviso.
      await completedSync();
      expect(await changesOf(108)).toHaveLength(3);
    });

    it('una propiedad que deja de estar aceptada se avisa una vez y el workflow sigue', async () => {
      await fixture.givenAccepted({ id: 109, r1: FUTURE_AUCTION });
      await completedSync();

      await fixture.setClassification(109, 3);
      await completedSync();
      await completedSync();

      const changes = await changesOf(109);
      expect(
        changes.map((change) => `${String(change.changeType)}:${String(change.status)}`),
      ).toEqual(['PROPERTY_ACCEPTED:PROCESSED', 'NO_LONGER_ACCEPTED:PENDING']);
      expect(changes[1]?.currentValues).toMatchObject({
        existsInSource: true,
        classificationId: 3,
      });
      expect((await workflowsOf(109))[0]?.status).toBe('ACTIVE');

      await fixture.setClassification(109, 7);
      await completedSync();
      expect((await changesOf(109)).at(-1)).toMatchObject({
        changeType: 'PROPERTY_ACCEPTED',
        status: 'PROCESSED',
      });
    });

    it('una propiedad borrada del origen se avisa como no aceptada', async () => {
      await fixture.givenAccepted({ id: 110, r1: FUTURE_AUCTION });
      await completedSync();

      await fixture.deleteProperty(110);
      await completedSync();

      expect((await changesOf(110)).at(-1)).toMatchObject({
        changeType: 'NO_LONGER_ACCEPTED',
        currentValues: { existsInSource: false },
      });
    });

    it('no toca las propiedades sintéticas de desarrollo', async () => {
      const propertyId = await givenProperty(context);

      await completedSync();

      expect(
        await rows('SELECT id FROM property_source_changes WHERE property_id = ?', [propertyId]),
      ).toHaveLength(0);
    });
  });

  describe('API de administración', () => {
    let cast: WorkflowCast;

    beforeEach(async () => {
      cast = await givenCast(context);
    });

    it('el estado y las incidencias solo los ve un administrador', async () => {
      await fixture.givenAccepted({ id: 111, r1: FUTURE_AUCTION, horaRemate: '' });
      const outcome = await completedSync();

      const status = await callApi(context, 'GET', '/api/sync/status', {
        sessionCookie: cast.cookies.admin,
      });
      expect(status.status).toBe(200);
      expect(status.body).toMatchObject({
        cursor: { lastStatus: 'SUCCEEDED' },
        executions: [{ id: outcome.executionId, status: 'SUCCEEDED', workflowsStarted: 1 }],
      });

      const issues = await callApi(
        context,
        'GET',
        `/api/sync/executions/${outcome.executionId}/issues`,
        { sessionCookie: cast.cookies.admin },
      );
      expect(issues.body).toMatchObject({
        issues: [{ adminNewId: 111, severity: 'WARNING', code: 'MISSING_AUCTION_TIME' }],
      });

      const forbidden = await callApi(context, 'GET', '/api/sync/status', {
        sessionCookie: cast.cookies.manager,
      });
      expect(forbidden.status).toBe(403);
      const missing = await callApi(context, 'GET', '/api/sync/executions/999999/issues', {
        sessionCookie: cast.cookies.admin,
      });
      expect(missing.status).toBe(404);
    });

    it('un administrador marca como revisado el aviso de propiedad no aceptada', async () => {
      await fixture.givenAccepted({ id: 112, r1: FUTURE_AUCTION });
      await completedSync();
      await fixture.setClassification(112, 3);
      await completedSync();

      const pending = await callApi(context, 'GET', '/api/sync/changes?status=PENDING', {
        sessionCookie: cast.cookies.admin,
      });
      const { changes } = pending.body as { changes: { id: number; changeType: string }[] };
      expect(changes.map((change) => change.changeType)).toEqual(['NO_LONGER_ACCEPTED']);
      const changeId = changes[0]?.id ?? 0;

      const reviewed = await callApi(context, 'POST', `/api/sync/changes/${changeId}/review`, {
        sessionCookie: cast.cookies.admin,
      });
      expect(reviewed.status).toBe(200);
      expect((await changesOf(112)).at(-1)).toMatchObject({
        status: 'PROCESSED',
        processedBy: cast.admin.id,
      });

      const again = await callApi(context, 'POST', `/api/sync/changes/${changeId}/review`, {
        sessionCookie: cast.cookies.admin,
      });
      expect(again.status).toBe(409);
    });

    it('los cambios de fecha pendientes no se pueden marcar a mano', async () => {
      await fixture.givenAccepted({ id: 113, r1: FUTURE_AUCTION });
      await completedSync();
      await fixture.setAuctionDate(113, '2026-12-14');
      await completedSync();

      const [change] = (await changesOf(113)).filter(
        (candidate) => candidate.changeType === 'AUCTION_DATE_CHANGED',
      );
      const response = await callApi(
        context,
        'POST',
        `/api/sync/changes/${String(change?.id)}/review`,
        { sessionCookie: cast.cookies.admin },
      );
      expect(response.status).toBe(409);
    });
  });
});
