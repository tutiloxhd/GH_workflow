import type { DatabaseExecutor } from '../../../platform/database/database.js';
import type { RoleCode } from '../../identity/domain/role-code.js';
import { findFirstActiveUserIdWithRole } from '../../identity/persistence/users-repository.js';
import { computeDeadline, type BusinessDates } from '../domain/due-date.js';
import {
  currentHolder,
  participantTypeForRole,
  type CurrentParticipant,
} from '../domain/participants.js';
import { isTaskWorkable } from '../domain/statuses.js';
import { areAllTasksCompleted, findTasksReadyToActivate } from '../domain/task-graph.js';
import {
  findCurrentParticipants,
  findPropertyDates,
  findTaskRequirements,
  findWorkflowTasks,
  insertEvents,
  lockWorkflow,
  updateTask,
  updateWorkflow,
  type NewWorkflowEvent,
  type TaskChanges,
  type TaskRecord,
  type WorkflowRecord,
} from '../persistence/workflow-repository.js';

// Estado de un workflow cargado dentro de una transacción, con la instancia bloqueada.
// Los cambios se escriben en la base y se reflejan aquí para los pasos siguientes del comando.
export class WorkflowContext {
  private taskList: TaskRecord[];
  private readonly pendingEvents: NewWorkflowEvent[] = [];

  private constructor(
    readonly executor: DatabaseExecutor,
    readonly workflow: WorkflowRecord,
    private dates: BusinessDates,
    tasks: TaskRecord[],
    private readonly requirements: ReadonlyMap<number, readonly number[]>,
    private participantList: CurrentParticipant[],
    readonly now: Date,
    readonly actorUserId: number | null,
    private readonly eventSource?: 'USER' | 'SYSTEM' | 'SYNC',
  ) {
    this.taskList = tasks;
  }

  static async load(
    executor: DatabaseExecutor,
    workflowId: number,
    now: Date,
    actorUserId: number | null,
    eventSource?: 'USER' | 'SYSTEM' | 'SYNC',
  ): Promise<WorkflowContext | undefined> {
    const workflow = await lockWorkflow(executor, workflowId);
    if (!workflow) return undefined;
    const dates = await findPropertyDates(executor, workflow.propertyId);
    if (!dates) throw new Error('El workflow apunta a una propiedad inexistente');

    return new WorkflowContext(
      executor,
      workflow,
      dates,
      await findWorkflowTasks(executor, workflowId),
      await findTaskRequirements(executor, workflow.templateId),
      await findCurrentParticipants(executor, workflowId),
      now,
      actorUserId,
      eventSource,
    );
  }

  get tasks(): readonly TaskRecord[] {
    return this.taskList;
  }

  get participants(): readonly CurrentParticipant[] {
    return this.participantList;
  }

  get businessDates(): BusinessDates {
    return this.dates;
  }

  findTask(taskId: number): TaskRecord | undefined {
    return this.taskList.find((task) => task.id === taskId);
  }

  record(event: Omit<NewWorkflowEvent, 'workflowId' | 'actorUserId'>): void {
    this.pendingEvents.push({
      ...event,
      workflowId: this.workflow.id,
      actorUserId: this.actorUserId,
      ...(this.eventSource ? { eventSource: this.eventSource } : {}),
    });
  }

  async changeTask(taskId: number, changes: TaskChanges): Promise<void> {
    await updateTask(this.executor, taskId, changes);
    this.taskList = this.taskList.map((task) =>
      task.id === taskId ? { ...task, ...changes } : task,
    );
  }

  async changeWorkflow(changes: Parameters<typeof updateWorkflow>[2]): Promise<void> {
    await updateWorkflow(this.executor, this.workflow.id, changes);
  }

  async reloadParticipants(): Promise<void> {
    this.participantList = await findCurrentParticipants(this.executor, this.workflow.id);
  }

  setBusinessDates(dates: Partial<BusinessDates>): void {
    this.dates = { ...this.dates, ...dates };
  }

  setAuctionAt(auctionAt: Date): void {
    this.setBusinessDates({ auctionAt });
  }

  // Responsable efectivo de una tarea del rol: titular vigente del workflow → primer usuario
  // activo con el rol → primer administrador activo.
  async resolveAssignment(
    role: RoleCode,
  ): Promise<{ assignedUserId: number | null; backupUserId: number | null }> {
    const participantType = participantTypeForRole(role);
    if (participantType) {
      const primary = currentHolder(this.participantList, participantType, 'PRIMARY');
      if (primary !== null) {
        return {
          assignedUserId: primary,
          backupUserId: currentHolder(this.participantList, participantType, 'BACKUP'),
        };
      }
    }
    const fallback =
      (await findFirstActiveUserIdWithRole(this.executor, role)) ??
      (await findFirstActiveUserIdWithRole(this.executor, 'ADMIN'));
    return { assignedUserId: fallback, backupUserId: null };
  }

  async activateReadyTasks(): Promise<void> {
    for (const task of findTasksReadyToActivate(this.taskList, this.requirements)) {
      const assignment = await this.resolveAssignment(task.responsibleRole);
      const deadline = computeDeadline(task, this.now, this.dates);
      await this.changeTask(task.id, {
        status: 'READY',
        activatedAt: this.now,
        ...assignment,
        ...deadline,
      });
      this.record({
        taskId: task.id,
        eventType: 'TASK_ACTIVATED',
        details: { code: task.code, ...assignment, dueAt: deadline.dueAt?.toISOString() ?? null },
      });
    }
  }

  async completeWorkflowIfFinished(): Promise<boolean> {
    if (!areAllTasksCompleted(this.taskList)) return false;
    await this.changeWorkflow({ status: 'COMPLETED', completedAt: this.now });
    this.record({ eventType: 'WORKFLOW_COMPLETED' });
    return true;
  }

  // Recalcula el vencimiento de las tareas abiertas. Un plazo medido desde la activación vuelve
  // a correr desde `clockStart`; uno medido desde una fecha de negocio usa la fecha vigente.
  async recalculateOpenDeadlines(clockStart: Date): Promise<void> {
    for (const task of this.taskList.filter(
      (candidate) => isTaskWorkable(candidate.status) || candidate.status === 'SUSPENDED',
    )) {
      const deadline = computeDeadline(task, clockStart, this.dates);
      await this.changeTask(task.id, deadline);
      if (deadline.dueAt?.getTime() !== task.dueAt?.getTime()) {
        this.record({
          taskId: task.id,
          eventType: 'TASK_DUE_DATE_RECALCULATED',
          details: {
            code: task.code,
            previousDueAt: task.dueAt?.toISOString() ?? null,
            newDueAt: deadline.dueAt?.toISOString() ?? null,
          },
        });
      }
    }
  }

  async flushEvents(): Promise<void> {
    await insertEvents(this.executor, this.pendingEvents, this.now);
    this.pendingEvents.length = 0;
  }
}
