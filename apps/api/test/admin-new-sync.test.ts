import type { RowDataPacket } from 'mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  runAdminNewSync,
  type SyncDependencies,
  type SyncOutcome,
} from '../src/modules/admin-new-sync/application/run-sync.js';
import { importAdminNewAgentUsers } from '../src/modules/admin-new-sync/application/import-agent-users.js';
import type { AdminNewSource } from '../src/modules/admin-new-sync/persistence/admin-new-source.js';
import { insertSourceChange } from '../src/modules/admin-new-sync/persistence/sync-repository.js';
import { startSourceFixture, type SourceFixture } from './admin-new-source-fixture.js';
import {
  callApi,
  givenUser,
  logInAs,
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

  it('con --dev importa cuentas sin clave de origen con Test123 y conserva las existentes', async () => {
    const existing = await givenUser(context, {
      email: 'existente@example.test',
      roles: ['MANAGER'],
    });
    await context.database.pool.query('UPDATE users SET admin_new_user_id = ? WHERE id = ?', [
      71003,
      existing.id,
    ]);
    const source = {
      ...fixture.source,
      readAgentUsers: () =>
        Promise.resolve([
          {
            adminNewUserId: 71003,
            name: existing.name,
            rut: null,
            email: existing.email,
            legacyPassword: null,
            areaId: 3,
            regionName: null,
          },
          {
            adminNewUserId: 71004,
            name: 'Agente de prueba',
            rut: null,
            email: 'nuevo@example.test',
            legacyPassword: null,
            areaId: 3,
            regionName: null,
          },
        ]),
      close: () => Promise.resolve(),
    };
    const importUsers = (shouldApply: boolean) =>
      importAdminNewAgentUsers(
        {
          database: context.database,
          source,
          clock: context.clock,
          passwordHasher: context.dependencies.passwordHasher,
        },
        shouldApply,
        { developmentPassword: 'Test123' },
      );

    expect(await importUsers(false)).toMatchObject({
      eligibleUsers: 2,
      imported: 0,
      skippedIncompleteRecords: 0,
    });
    expect(await rows('SELECT id FROM users WHERE admin_new_user_id = ?', [71004])).toHaveLength(0);
    expect(await importUsers(true)).toMatchObject({ imported: 1, alreadyImported: 1 });
    const [imported] = await rows(
      'SELECT password_hash AS passwordHash FROM users WHERE admin_new_user_id = ?',
      [71004],
    );
    const [unchanged] = await rows('SELECT password_hash AS passwordHash FROM users WHERE id = ?', [
      existing.id,
    ]);
    expect(
      await context.dependencies.passwordHasher.matches('Test123', String(imported?.passwordHash)),
    ).toBe(true);
    expect(
      await context.dependencies.passwordHasher.matches('Test123', String(unchanged?.passwordHash)),
    ).toBe(false);
    expect(await importUsers(true)).toMatchObject({ imported: 0, alreadyImported: 2 });
  });

  it('actualiza la región de agentes ya importados desde gh_agente_zona', async () => {
    const user = await givenUser(context, {
      email: 'agente-region@example.test',
      roles: ['MANAGER'],
    });
    await context.database.pool.query(
      'INSERT INTO regions (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      ['Coquimbo'],
    );
    const regionRows = await rows('SELECT id FROM regions WHERE name = ?', ['Coquimbo']);
    await context.database.pool.query(
      'UPDATE users SET admin_new_user_id = ?, region_id = NULL WHERE id = ?',
      [71001, user.id],
    );
    const sourceUser = {
      adminNewUserId: 71001,
      name: user.name,
      rut: '12345678-5',
      email: user.email,
      legacyPassword: 'clave-sintetica',
      areaId: 3,
      regionName: 'Coquimbo',
    };
    const source = {
      ...fixture.source,
      readAgentUsers: () => Promise.resolve([sourceUser]),
      close: () => Promise.resolve(),
    };

    const summary = await importAdminNewAgentUsers(
      {
        database: context.database,
        source,
        clock: context.clock,
        passwordHasher: context.dependencies.passwordHasher,
      },
      true,
    );

    const [row] = await rows('SELECT region_id AS regionId FROM users WHERE id = ?', [user.id]);
    expect(summary).toMatchObject({ alreadyImported: 1, imported: 0, regionsUpdated: 1 });
    expect(row?.regionId).toBe(regionRows[0]?.id);
  });

  it('asigna la Región Metropolitana a un agente importado sin región de origen', async () => {
    const user = await givenUser(context, {
      email: 'agente-sin-region@example.test',
      roles: ['MANAGER'],
    });
    await context.database.pool.query(
      'UPDATE users SET admin_new_user_id = ?, region_id = NULL WHERE id = ?',
      [71002, user.id],
    );
    const source = {
      ...fixture.source,
      readAgentUsers: () =>
        Promise.resolve([
          {
            adminNewUserId: 71002,
            name: user.name,
            rut: '12345678-5',
            email: user.email,
            legacyPassword: 'clave-sintetica',
            areaId: 3,
            regionName: null,
          },
        ]),
      close: () => Promise.resolve(),
    };

    const summary = await importAdminNewAgentUsers(
      {
        database: context.database,
        source,
        clock: context.clock,
        passwordHasher: context.dependencies.passwordHasher,
      },
      true,
    );

    const [row] = await rows(
      'SELECT r.name AS regionName FROM users u JOIN regions r ON r.id = u.region_id WHERE u.id = ?',
      [user.id],
    );
    expect(summary).toMatchObject({ alreadyImported: 1, regionsUpdated: 1 });
    expect(row?.regionName).toBe('Región Metropolitana');
  });

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
      expect(Number(taskCount?.n)).toBe(13);

      const changes = await changesOf(101);
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({ changeType: 'PROPERTY_ACCEPTED', status: 'PROCESSED' });

      const [cursor] = await rows("SELECT * FROM sync_cursors WHERE source_code = 'ADMIN_NEW'");
      expect(cursor).toMatchObject({ last_status: 'SUCCEEDED', last_source_id: 101 });
    });

    it('asigna pagador y postor por RUT, agrega al revisor legal y completa la tarea', async () => {
      const admin = await givenUser(context, {
        email: 'source-admin@example.test',
        name: 'Administrador de origen',
        roles: ['ADMIN'],
      });
      const manager = await givenUser(context, {
        email: 'source-manager@example.test',
        name: 'Gestor de origen',
        roles: ['MANAGER'],
      });
      const bidder = await givenUser(context, {
        email: 'source-bidder@example.test',
        name: 'Postor de origen',
        roles: ['BIDDER'],
      });
      await context.database.pool.query('UPDATE users SET rut = ? WHERE id = ?', [
        '11111111-1',
        manager.id,
      ]);
      await context.database.pool.query('UPDATE users SET rut = ? WHERE id = ?', [
        '22222222-2',
        bidder.id,
      ]);
      await context.database.pool.query('UPDATE users SET region_id = NULL WHERE id IN (?, ?)', [
        manager.id,
        bidder.id,
      ]);
      const passwordHash = await context.dependencies.passwordHasher.hash('ClaveSintetica123');
      await context.database.pool.query(
        'INSERT INTO users (id, name, email, password_hash, status) VALUES (9, ?, ?, ?, ?)',
        ['Pablo Godoy', 'pablo.legal@example.test', passwordHash, 'ACTIVE'],
      );
      await context.database.pool.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT 9, id FROM roles WHERE code = 'LEGAL_REVIEWER'`,
      );
      await fixture.givenAccepted({
        id: 112,
        r1: FUTURE_AUCTION,
        payer: 'Pagador antiguo del remate',
        bidder: 'Postor antiguo del remate',
      });
      await fixture.setAuctionParticipants(
        112,
        'Nombre distinto del postor',
        'Nombre distinto del gestor',
        '22.222.222-2',
        '11.111.111-1',
      );

      await completedSync();

      expect(await propertyOf(112)).toMatchObject({
        auction_bidder_name: 'Nombre distinto del postor',
        auction_payer_name: 'Nombre distinto del gestor',
      });

      const [workflow] = await workflowsOf(112);
      const participants = await rows(
        `SELECT participant_type AS participantType, user_id AS userId
           FROM workflow_participants WHERE workflow_instance_id = ? ORDER BY participant_type`,
        [workflow?.id],
      );
      expect(participants).toEqual([
        { participantType: 'BIDDER', userId: bidder.id },
        { participantType: 'LEGAL_REVIEWER', userId: 9 },
        { participantType: 'MANAGER', userId: manager.id },
      ]);
      const [assignmentTask] = await rows(
        `SELECT ti.status, ti.assigned_user_id AS assignedUserId
           FROM task_instances ti JOIN task_definitions td ON td.id = ti.task_definition_id
          WHERE ti.workflow_instance_id = ? AND td.code = 'ASSIGN_MANAGER_AND_BIDDER'`,
        [workflow?.id],
      );
      expect(assignmentTask).toMatchObject({ status: 'COMPLETED', assignedUserId: admin.id });
    });

    it('deja abierta la asignación y advierte si los nombres no identifican usuarios únicos', async () => {
      await givenUser(context, {
        email: 'unmatched-admin@example.test',
        name: 'Administrador de origen',
        roles: ['ADMIN'],
      });
      await fixture.givenAccepted({
        id: 113,
        r1: FUTURE_AUCTION,
        payer: 'Gestor sin cuenta',
        bidder: 'Postor sin cuenta',
      });

      const outcome = await completedSync();

      expect(outcome.totals.warningCount).toBe(2);
      expect(await issueCodes(outcome.executionId)).toEqual([
        'SOURCE_PARTICIPANT_NOT_MATCHED',
        'SOURCE_PARTICIPANT_NOT_MATCHED',
      ]);
      const [workflow] = await workflowsOf(113);
      const [assignmentTask] = await rows(
        `SELECT ti.status FROM task_instances ti JOIN task_definitions td ON td.id = ti.task_definition_id
          WHERE ti.workflow_instance_id = ? AND td.code = 'ASSIGN_MANAGER_AND_BIDDER'`,
        [workflow?.id],
      );
      expect(assignmentTask?.status).toBe('READY');
      expect(
        await rows('SELECT id FROM workflow_participants WHERE workflow_instance_id = ?', [
          workflow?.id,
        ]),
      ).toHaveLength(0);
    });

    it('asigna el postor a un workflow existente aunque falte el pagador', async () => {
      const admin = await givenUser(context, {
        email: 'property-13913-admin@example.test',
        name: 'Administrador 13913',
        roles: ['ADMIN'],
      });
      const bidder = await givenUser(context, {
        email: 'property-13913-bidder@example.test',
        name: 'Postor 13913',
        roles: ['BIDDER'],
      });
      await fixture.givenAccepted({ id: 13913, r1: FUTURE_AUCTION });
      await completedSync();
      await fixture.setAuctionParticipants(13913, bidder.name, null);

      const outcome = await completedSync();

      expect(outcome.totals.warningCount).toBe(1);
      const [workflow] = await workflowsOf(13913);
      const adminCookie = await logInAs(context, 'property-13913-admin@example.test');
      const detail = await callApi(context, 'GET', `/api/workflows/${String(workflow?.id)}`, {
        sessionCookie: adminCookie,
      });
      expect(detail.body).toMatchObject({
        workflow: {
          property: {
            auctionBidderName: bidder.name,
            auctionPayerName: null,
          },
        },
      });
      expect(await changesOf(13913)).toHaveLength(1);
      expect(
        await rows(
          `SELECT participant_type AS participantType, user_id AS userId
             FROM workflow_participants WHERE workflow_instance_id = ?`,
          [workflow?.id],
        ),
      ).toEqual([{ participantType: 'BIDDER', userId: bidder.id }]);
      const [assignmentTask] = await rows(
        `SELECT ti.status, ti.assigned_user_id AS assignedUserId
           FROM task_instances ti JOIN task_definitions td ON td.id = ti.task_definition_id
          WHERE ti.workflow_instance_id = ? AND td.code = 'ASSIGN_MANAGER_AND_BIDDER'`,
        [workflow?.id],
      );
      expect(assignmentTask).toMatchObject({ status: 'READY', assignedUserId: admin.id });
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
        readAgentUsers: () => Promise.reject(new Error('Conexión rechazada')),
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
    it('un cambio de fecha con workflow abierto reprograma plazos e historial', async () => {
      await fixture.givenAccepted({ id: 108, r1: FUTURE_AUCTION });
      await completedSync();
      const [workflow] = await workflowsOf(108);
      const [deadlineBefore] = await rows(
        `SELECT due_at AS dueAt FROM task_instances
          WHERE workflow_instance_id = ? AND status = 'READY' ORDER BY id LIMIT 1`,
        [workflow?.id],
      );

      context.clock.advanceMinutes(60);
      await fixture.setAuctionDate(108, '2026-12-14');
      await fixture.setCommune(108, 'Providencia');
      const outcome = await completedSync();

      expect(outcome.totals.recordsUpdated).toBe(1);
      const property = await propertyOf(108);
      expect(property?.commune).toBe('Providencia');
      expect((property?.auction_at as Date).toISOString()).toBe('2026-12-14T13:30:00.000Z');

      const changes = await changesOf(108);
      expect(changes.slice(1)).toMatchObject([
        {
          changeType: 'AUCTION_DATE_CHANGED',
          status: 'PROCESSED',
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

      const [deadlineAfter] = await rows(
        `SELECT due_at AS dueAt FROM task_instances
          WHERE workflow_instance_id = ? AND status = 'READY' ORDER BY id LIMIT 1`,
        [workflow?.id],
      );
      expect(
        (deadlineAfter?.dueAt as Date).getTime() - (deadlineBefore?.dueAt as Date).getTime(),
      ).toBe(60 * 60 * 1000);
      const [reprogramming] = await rows(
        `SELECT origin, status, source_change_id AS sourceChangeId
           FROM workflow_reprogrammings WHERE workflow_instance_id = ?`,
        [workflow?.id],
      );
      expect(reprogramming).toMatchObject({
        origin: 'SYNC',
        status: 'APPLIED',
        sourceChangeId: Number(changes[1]?.id),
      });
      const events = await rows(
        `SELECT event_type AS eventType, event_source AS eventSource
           FROM workflow_events WHERE workflow_instance_id = ? ORDER BY id`,
        [workflow?.id],
      );
      expect(events).toEqual(
        expect.arrayContaining([
          { eventType: 'TASK_DUE_DATE_RECALCULATED', eventSource: 'SYNC' },
          { eventType: 'WORKFLOW_REPROGRAMMED', eventSource: 'SYNC' },
        ]),
      );

      // Sin nuevos cambios en el origen, no se repite el aviso.
      await completedSync();
      expect(await changesOf(108)).toHaveLength(3);
    });

    it('retoma una reprogramación pendiente aunque el origen no vuelva a cambiar', async () => {
      await fixture.givenAccepted({ id: 114, r1: FUTURE_AUCTION });
      await completedSync();
      const property = await propertyOf(114);
      const [workflow] = await workflowsOf(114);
      const detectedAt = context.clock.now();
      const sourceChangeId = await insertSourceChange(context.database.db, {
        propertyId: Number(property?.id),
        changeType: 'AUCTION_DATE_CHANGED',
        status: 'PENDING',
        previousValues: { auctionAt: '2026-12-07T13:30:00.000Z' },
        currentValues: { auctionAt: '2026-12-15T13:30:00.000Z' },
        detectedAt,
      });
      const outcome = await completedSync();

      expect(outcome.totals.recordsUpdated).toBe(0);
      expect(((await propertyOf(114))?.auction_at as Date).toISOString()).toBe(
        '2026-12-15T13:30:00.000Z',
      );
      expect((await changesOf(114)).at(-1)).toMatchObject({ status: 'PROCESSED' });
      const [reprogramming] = await rows(
        `SELECT source_change_id AS sourceChangeId, status,
                previous_auction_at AS previousAuctionAt, new_auction_at AS newAuctionAt
           FROM workflow_reprogrammings WHERE workflow_instance_id = ?`,
        [workflow?.id],
      );
      expect(reprogramming).toMatchObject({
        sourceChangeId,
        status: 'APPLIED',
        previousAuctionAt: new Date('2026-12-07T13:30:00.000Z'),
        newAuctionAt: new Date('2026-12-15T13:30:00.000Z'),
      });
    });

    it('conserva intactas las tareas completadas y bloqueadas', async () => {
      await fixture.givenAccepted({ id: 115, r1: FUTURE_AUCTION });
      await completedSync();
      const [workflow] = await workflowsOf(115);
      const tasksBefore = await rows(
        `SELECT id, status, due_at AS dueAt FROM task_instances
          WHERE workflow_instance_id = ? ORDER BY id`,
        [workflow?.id],
      );
      const completedTask = tasksBefore.find((task) => task.status === 'READY');
      const blockedTask = tasksBefore.find((task) => task.status === 'BLOCKED');
      const completedTaskId = Number(completedTask?.id);
      const blockedTaskId = Number(blockedTask?.id);
      await context.database.pool.query(
        `UPDATE task_instances SET status = 'COMPLETED', completed_at = ? WHERE id = ?`,
        [context.clock.now(), completedTaskId],
      );

      await fixture.setAuctionDate(115, '2026-12-14');
      await completedSync();

      const tasksAfter = await rows(
        `SELECT id, status, due_at AS dueAt FROM task_instances
          WHERE id IN (?, ?) ORDER BY id`,
        [completedTaskId, blockedTaskId],
      );
      expect(
        tasksAfter.map((task) => ({ id: Number(task.id), status: String(task.status) })),
      ).toEqual([
        { id: completedTaskId, status: 'COMPLETED' },
        { id: blockedTaskId, status: 'BLOCKED' },
      ]);
      expect(String(tasksAfter[0]?.dueAt ?? null)).toBe(String(completedTask?.dueAt ?? null));
      expect(String(tasksAfter[1]?.dueAt ?? null)).toBe(String(blockedTask?.dueAt ?? null));
    });

    it('reprograma tareas suspendidas sin reactivar el workflow', async () => {
      const cast = await givenCast(context);
      await fixture.givenAccepted({ id: 116, r1: FUTURE_AUCTION });
      await completedSync();
      const [workflow] = await workflowsOf(116);
      const workflowId = Number(workflow?.id);
      const suspended = await callApi(context, 'POST', `/api/workflows/${workflowId}/suspend`, {
        sessionCookie: cast.cookies.legal,
        body: { reason: 'Revisión legal' },
      });
      expect(suspended.status).toBe(200);
      const [taskBefore] = await rows(
        `SELECT id, due_at AS dueAt FROM task_instances
          WHERE workflow_instance_id = ? AND status = 'SUSPENDED' ORDER BY id LIMIT 1`,
        [workflowId],
      );

      context.clock.advanceMinutes(30);
      await fixture.setAuctionDate(116, '2026-12-14');
      await completedSync();

      expect((await workflowsOf(116))[0]?.status).toBe('SUSPENDED');
      const [taskAfter] = await rows(
        'SELECT status, due_at AS dueAt FROM task_instances WHERE id = ?',
        [taskBefore?.id],
      );
      expect(taskAfter?.status).toBe('SUSPENDED');
      expect((taskAfter?.dueAt as Date).getTime() - (taskBefore?.dueAt as Date).getTime()).toBe(
        30 * 60 * 1000,
      );
    });

    it('aplica juntas las fechas r3, r4 y r5 y permite eliminar una referencia', async () => {
      await fixture.givenAccepted({ id: 117, r1: FUTURE_AUCTION });
      await completedSync();
      const [workflow] = await workflowsOf(117);
      const tasks = await rows(
        'SELECT id FROM task_instances WHERE workflow_instance_id = ? ORDER BY id LIMIT 3',
        [workflow?.id],
      );
      const references = ['GUARANTEE_PAYMENT_AT', 'GUARANTEE_RETURN_AT', 'BALANCE_PAYMENT_AT'];
      for (const [index, task] of tasks.entries()) {
        await context.database.pool.query(
          `UPDATE task_instances
              SET status = 'READY', due_reference = ?, due_reference_at = NULL, due_at = NULL
            WHERE id = ?`,
          [references[index], task.id],
        );
      }

      await fixture.setReferenceDates(117, {
        r3: '2026-12-10',
        r4: '2026-12-11',
        r5: '2026-12-12',
      });
      await completedSync();

      const recalculated = await rows(
        `SELECT due_reference AS dueReference, due_reference_at AS dueReferenceAt
           FROM task_instances WHERE id IN (?, ?, ?) ORDER BY id`,
        tasks.map((task) => Number(task.id)),
      );
      expect(recalculated).toEqual([
        {
          dueReference: 'GUARANTEE_PAYMENT_AT',
          dueReferenceAt: new Date('2026-12-10T15:00:00.000Z'),
        },
        {
          dueReference: 'GUARANTEE_RETURN_AT',
          dueReferenceAt: new Date('2026-12-11T03:00:00.000Z'),
        },
        {
          dueReference: 'BALANCE_PAYMENT_AT',
          dueReferenceAt: new Date('2026-12-12T03:00:00.000Z'),
        },
      ]);

      await fixture.setReferenceDates(117, {
        r3: null,
        r4: '2026-12-11',
        r5: '2026-12-12',
      });
      await completedSync();
      const [withoutGuaranteeDate] = await rows(
        'SELECT due_reference_at AS dueReferenceAt, due_at AS dueAt FROM task_instances WHERE id = ?',
        [tasks[0]?.id],
      );
      expect(withoutGuaranteeDate).toMatchObject({ dueReferenceAt: null, dueAt: null });
    });

    it('un pendiente inválido no aplica cambios parciales y queda recuperable', async () => {
      await fixture.givenAccepted({ id: 118, r1: FUTURE_AUCTION });
      await completedSync();
      const property = await propertyOf(118);
      const sourceChangeId = await insertSourceChange(context.database.db, {
        propertyId: Number(property?.id),
        changeType: 'AUCTION_DATE_CHANGED',
        status: 'PENDING',
        previousValues: { auctionAt: '2026-12-07T13:30:00.000Z' },
        currentValues: { auctionAt: 'fecha-inválida' },
        detectedAt: context.clock.now(),
      });

      const outcome = await completedSync();

      expect(outcome.status).toBe('PARTIAL');
      expect((await propertyOf(118))?.auction_at).toEqual(property?.auction_at);
      expect((await changesOf(118)).at(-1)).toMatchObject({
        id: sourceChangeId,
        status: 'PENDING',
      });
      expect(await issueCodes(outcome.executionId)).toContain('REPROGRAMMING_FAILED');
    });

    it('un workflow cerrado no se reabre ni crea reprogramación pendiente', async () => {
      await fixture.givenAccepted({ id: 119, r1: FUTURE_AUCTION });
      await completedSync();
      const [workflow] = await workflowsOf(119);
      await context.database.pool.query(
        `UPDATE workflow_instances SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?`,
        [context.clock.now(), workflow?.id],
      );
      await context.database.pool.query(
        `UPDATE task_instances SET status = 'CANCELLED'
          WHERE workflow_instance_id = ? AND status <> 'COMPLETED'`,
        [workflow?.id],
      );

      await fixture.setAuctionDate(119, '2026-12-14');
      await completedSync();

      expect((await workflowsOf(119))[0]?.status).toBe('CANCELLED');
      expect(((await propertyOf(119))?.auction_at as Date).toISOString()).toBe(
        '2026-12-14T13:30:00.000Z',
      );
      expect((await changesOf(119)).at(-1)).toMatchObject({
        changeType: 'AUCTION_DATE_CHANGED',
        status: 'PROCESSED',
      });
      expect(
        await rows('SELECT id FROM workflow_reprogrammings WHERE workflow_instance_id = ?', [
          workflow?.id,
        ]),
      ).toHaveLength(0);
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
