import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';

const LEASE_MILLISECONDS = 60_000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

export interface NotificationProcessorDependencies {
  readonly database: Database;
  readonly clock: Clock;
}

interface OutboxRow extends RowDataPacket {
  readonly id: number;
  readonly event_type: string;
  readonly workflow_instance_id: number;
  readonly task_instance_id: number | null;
}

interface TaskRow extends RowDataPacket {
  readonly id: number;
  readonly workflow_instance_id: number;
  readonly name: string;
  readonly status: string;
  readonly assigned_user_id: number | null;
  readonly due_at: Date | null;
}

interface UserRow extends RowDataPacket {
  readonly id: number;
}

interface RuleRow extends RowDataPacket {
  readonly event_type: string;
  readonly offset_minutes: number;
  readonly is_enabled: number;
}

interface JobRow extends RowDataPacket {
  readonly id: number;
  readonly task_instance_id: number;
  readonly user_id: number;
  readonly event_type: 'TASK_REMINDER' | 'TASK_ESCALATION' | 'TASK_OVERDUE';
  readonly occurrence_key: string;
  readonly attempts: number;
}

const deduplicationKey = (...parts: readonly (string | number)[]): string =>
  createHash('sha256').update(parts.join(':')).digest('hex');

async function findTask(database: Database, taskId: number): Promise<TaskRow | undefined> {
  const [rows] = await database.pool.execute<TaskRow[]>(
    `SELECT ti.id, ti.workflow_instance_id, td.name, ti.status, ti.assigned_user_id, ti.due_at
       FROM task_instances ti
       JOIN task_definitions td ON td.id = ti.task_definition_id
      WHERE ti.id = ?`,
    [taskId],
  );
  return rows[0];
}

async function escalationRecipients(database: Database): Promise<number[]> {
  const [rows] = await database.pool.execute<UserRow[]>(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'ACTIVE' AND r.code IN ('ADMIN', 'LEGAL_REVIEWER')`,
  );
  return rows.map((row) => row.id);
}

async function rulesForWorkflow(database: Database, workflowId: number): Promise<RuleRow[]> {
  const [rows] = await database.pool.execute<RuleRow[]>(
    `SELECT nr.event_type, nr.offset_minutes, nr.is_enabled
       FROM workflow_notification_rule_sets wnrs
       JOIN notification_rules nr ON nr.rule_set_id = wnrs.rule_set_id
      WHERE wnrs.workflow_instance_id = ?`,
    [workflowId],
  );
  return rows;
}

async function isRuleEnabled(
  database: Database,
  workflowId: number,
  trigger: string,
): Promise<boolean> {
  return (await rulesForWorkflow(database, workflowId)).some(
    (rule) => rule.event_type === trigger && rule.is_enabled === 1,
  );
}

async function createNotification(
  database: Database,
  input: {
    readonly userId: number;
    readonly trigger: string;
    readonly workflowId: number;
    readonly taskId: number;
    readonly taskName: string;
    readonly occurrence: string;
  },
): Promise<void> {
  const titles: Record<string, string> = {
    TASK_ASSIGNED: 'Nueva tarea asignada',
    TASK_REMINDER: 'Tarea próxima a vencer',
    TASK_ESCALATION: 'Escalamiento preventivo',
    TASK_OVERDUE: 'Tarea vencida',
    TASK_COMPLETED: 'Tarea completada',
  };
  await database.pool.execute(
    `INSERT IGNORE INTO notifications
       (user_id, event_type, title, body, workflow_instance_id, task_instance_id, deduplication_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.trigger,
      titles[input.trigger] ?? 'Notificación',
      input.taskName,
      input.workflowId,
      input.taskId,
      deduplicationKey(input.trigger, input.occurrence, input.userId),
    ],
  );
}

async function cancelPendingJobs(database: Database, taskId: number): Promise<void> {
  await database.pool.execute(
    `UPDATE notification_jobs
        SET status = 'CANCELLED', locked_by = NULL, locked_until = NULL
      WHERE task_instance_id = ? AND status IN ('PENDING', 'PROCESSING')`,
    [taskId],
  );
}

async function scheduleTaskNotifications(
  database: Database,
  task: TaskRow,
  occurrence: string,
  now: Date,
): Promise<void> {
  if (!task.assigned_user_id || !task.due_at || !['READY', 'IN_PROGRESS'].includes(task.status)) {
    return;
  }
  const dueAt = task.due_at.getTime();
  const ruleMap = new Map(
    (await rulesForWorkflow(database, task.workflow_instance_id)).map((rule) => [
      rule.event_type,
      rule,
    ]),
  );
  const jobs: Array<{ trigger: string; userId: number; scheduledAt: Date }> = [];
  const reminderRule = ruleMap.get('TASK_REMINDER');
  const reminderAt = new Date(dueAt - (reminderRule?.offset_minutes ?? 0) * 60_000);
  if (reminderRule?.is_enabled === 1 && reminderAt > now) {
    jobs.push({ trigger: 'TASK_REMINDER', userId: task.assigned_user_id, scheduledAt: reminderAt });
  }
  const escalationRule = ruleMap.get('TASK_ESCALATION');
  const escalationAt = new Date(dueAt - (escalationRule?.offset_minutes ?? 0) * 60_000);
  if (escalationRule?.is_enabled === 1 && escalationAt > now) {
    for (const userId of await escalationRecipients(database)) {
      jobs.push({ trigger: 'TASK_ESCALATION', userId, scheduledAt: escalationAt });
    }
  }
  if (ruleMap.get('TASK_OVERDUE')?.is_enabled === 1) {
    jobs.push({
      trigger: 'TASK_OVERDUE',
      userId: task.assigned_user_id,
      scheduledAt: new Date(Math.max(dueAt, now.getTime())),
    });
  }

  for (const job of jobs) {
    await database.pool.execute(
      `INSERT IGNORE INTO notification_jobs
         (task_instance_id, user_id, event_type, occurrence_key, scheduled_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        task.id,
        job.userId,
        job.trigger,
        deduplicationKey(task.id, job.trigger, job.userId, occurrence, task.due_at.toISOString()),
        job.scheduledAt,
      ],
    );
  }
}

async function handleOutboxRow(
  dependencies: NotificationProcessorDependencies,
  row: OutboxRow,
): Promise<void> {
  if (!row.task_instance_id) return;
  const task = await findTask(dependencies.database, row.task_instance_id);
  if (!task) return;
  const now = dependencies.clock.now();
  const occurrence = String(row.id);

  if (row.event_type === 'TASK_COMPLETED') {
    await cancelPendingJobs(dependencies.database, task.id);
    if (
      task.assigned_user_id &&
      (await isRuleEnabled(dependencies.database, task.workflow_instance_id, 'TASK_COMPLETED'))
    ) {
      await createNotification(dependencies.database, {
        userId: task.assigned_user_id,
        trigger: 'TASK_COMPLETED',
        workflowId: task.workflow_instance_id,
        taskId: task.id,
        taskName: task.name,
        occurrence,
      });
    }
    return;
  }
  if (['TASK_CANCELLED', 'TASK_SUSPENDED'].includes(row.event_type)) {
    await cancelPendingJobs(dependencies.database, task.id);
    return;
  }
  if (
    [
      'TASK_ASSIGNED',
      'TASK_DEADLINE_CHANGED',
      'TASK_DUE_DATE_RECALCULATED',
      'TASK_RESUMED',
    ].includes(row.event_type)
  ) {
    await cancelPendingJobs(dependencies.database, task.id);
  }
  if (row.event_type === 'TASK_ACTIVATED' || row.event_type === 'TASK_ASSIGNED') {
    if (
      task.assigned_user_id &&
      (await isRuleEnabled(dependencies.database, task.workflow_instance_id, 'TASK_ASSIGNED'))
    ) {
      await createNotification(dependencies.database, {
        userId: task.assigned_user_id,
        trigger: 'TASK_ASSIGNED',
        workflowId: task.workflow_instance_id,
        taskId: task.id,
        taskName: task.name,
        occurrence,
      });
    }
  }
  if (
    [
      'TASK_ACTIVATED',
      'TASK_ASSIGNED',
      'TASK_DEADLINE_CHANGED',
      'TASK_DUE_DATE_RECALCULATED',
      'TASK_RESUMED',
    ].includes(row.event_type)
  ) {
    await scheduleTaskNotifications(dependencies.database, task, occurrence, now);
  }
}

export async function processNotificationOutbox(
  dependencies: NotificationProcessorDependencies,
  workerId: string,
): Promise<number> {
  const connection = await dependencies.database.pool.getConnection();
  const now = dependencies.clock.now();
  const lockedUntil = new Date(now.getTime() + LEASE_MILLISECONDS);
  let rows: OutboxRow[] = [];
  try {
    await connection.beginTransaction();
    const [selected] = await connection.execute<OutboxRow[]>(
      `SELECT id, event_type, workflow_instance_id, task_instance_id
         FROM notification_outbox
        WHERE processed_at IS NULL AND available_at <= ?
          AND (locked_until IS NULL OR locked_until < ?)
        ORDER BY id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`,
      [now, now],
    );
    rows = selected;
    for (const row of rows) {
      await connection.execute(
        `UPDATE notification_outbox
            SET locked_by = ?, locked_until = ?, attempts = attempts + 1
          WHERE id = ?`,
        [workerId, lockedUntil, row.id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  for (const row of rows) {
    try {
      await handleOutboxRow(dependencies, row);
      await dependencies.database.pool.execute(
        `UPDATE notification_outbox
            SET processed_at = ?, locked_by = NULL, locked_until = NULL, last_error = NULL
          WHERE id = ? AND locked_by = ?`,
        [dependencies.clock.now(), row.id, workerId],
      );
    } catch (error) {
      await dependencies.database.pool.execute(
        `UPDATE notification_outbox
            SET locked_by = NULL, locked_until = NULL, available_at = DATE_ADD(?, INTERVAL 1 MINUTE),
                last_error = ?
          WHERE id = ? AND locked_by = ?`,
        [
          dependencies.clock.now(),
          error instanceof Error ? error.name : 'UnknownError',
          row.id,
          workerId,
        ],
      );
    }
  }
  return rows.length;
}

export async function processDueNotificationJobs(
  dependencies: NotificationProcessorDependencies,
  workerId = 'notifications-scheduler',
): Promise<number> {
  const now = dependencies.clock.now();
  const lockedUntil = new Date(now.getTime() + LEASE_MILLISECONDS);
  const connection = await dependencies.database.pool.getConnection();
  let jobs: JobRow[] = [];
  try {
    await connection.beginTransaction();
    const [selected] = await connection.execute<JobRow[]>(
      `SELECT id, task_instance_id, user_id, event_type, occurrence_key, attempts
         FROM notification_jobs
        WHERE scheduled_at <= ?
          AND (status = 'PENDING' OR (status = 'PROCESSING' AND locked_until < ?))
        ORDER BY scheduled_at, id
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED`,
      [now, now],
    );
    jobs = selected;
    for (const job of jobs) {
      await connection.execute(
        `UPDATE notification_jobs
            SET status = 'PROCESSING', locked_by = ?, locked_until = ?, attempts = attempts + 1
          WHERE id = ?`,
        [workerId, lockedUntil, job.id],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  for (const job of jobs) {
    try {
      const task = await findTask(dependencies.database, job.task_instance_id);
      if (!task || !['READY', 'IN_PROGRESS'].includes(task.status)) {
        await dependencies.database.pool.execute(
          `UPDATE notification_jobs SET status = 'CANCELLED', locked_by = NULL, locked_until = NULL
            WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
          [job.id, workerId],
        );
        continue;
      }
      if (job.event_type !== 'TASK_ESCALATION' && task.assigned_user_id !== job.user_id) {
        await dependencies.database.pool.execute(
          `UPDATE notification_jobs SET status = 'CANCELLED', locked_by = NULL, locked_until = NULL
            WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
          [job.id, workerId],
        );
        continue;
      }
      await createNotification(dependencies.database, {
        userId: job.user_id,
        trigger: job.event_type,
        workflowId: task.workflow_instance_id,
        taskId: task.id,
        taskName: task.name,
        occurrence: job.occurrence_key,
      });
      await dependencies.database.pool.execute(
        `UPDATE notification_jobs
            SET status = 'COMPLETED', completed_at = ?, locked_by = NULL, locked_until = NULL
          WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
        [now, job.id, workerId],
      );
    } catch (error) {
      const hasFailed = job.attempts + 1 >= MAX_ATTEMPTS;
      const retryAt = new Date(now.getTime() + 2 ** Math.min(job.attempts + 1, 6) * 60_000);
      await dependencies.database.pool.execute(
        `UPDATE notification_jobs
            SET status = ?, scheduled_at = ?,
                locked_by = NULL, locked_until = NULL, last_error = ?
          WHERE id = ? AND status = 'PROCESSING' AND locked_by = ?`,
        [
          hasFailed ? 'FAILED' : 'PENDING',
          retryAt,
          error instanceof Error ? error.name : 'UnknownError',
          job.id,
          workerId,
        ],
      );
    }
  }
  return jobs.length;
}
