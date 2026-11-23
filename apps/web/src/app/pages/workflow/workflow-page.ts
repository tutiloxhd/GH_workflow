import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  numberAttribute,
  signal,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NotificationService } from '../../core/notifications/notification.service';
import { Subscription } from 'rxjs';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime } from '../../core/time/santiago-time';
import { ROLE_LABELS } from '../../core/users/user.model';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import {
  EVENT_LABELS,
  PARTICIPANT_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type ParticipantType,
  type WorkflowDetail,
  type WorkflowEvent,
  type WorkflowTask,
} from '../../core/workflow/workflow.model';
import { DeadlineDialog } from './deadline-dialog';
import { LifecycleDialog, type LifecycleAction } from './lifecycle-dialog';
import { ParticipantsDialog } from './participants-dialog';
import { TaskDialog } from './task-dialog';

const PARTICIPANT_ORDER: readonly ParticipantType[] = ['MANAGER', 'BIDDER', 'LEGAL_REVIEWER'];

@Component({
  selector: 'app-workflow-page',
  imports: [RouterLink, TaskDialog, ParticipantsDialog, LifecycleDialog, DeadlineDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workflow-page.html',
  styleUrl: './workflow-page.css',
})
export class WorkflowPage implements OnInit, OnDestroy {
  private readonly api = inject(WorkflowApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly notificationService = inject(NotificationService);
  private workflowChangesSubscription: Subscription | null = null;
  private isRefreshingFromStream = false;

  // Parámetro de ruta (withComponentInputBinding).
  readonly workflowId = input.required({ transform: numberAttribute });
  readonly isDialog = input(false);

  protected readonly workflow = signal<WorkflowDetail | null>(null);
  protected readonly events = signal<readonly WorkflowEvent[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly openTaskId = signal<number | null>(null);
  protected readonly isEditingParticipants = signal(false);
  protected readonly lifecycleAction = signal<LifecycleAction | null>(null);
  protected readonly taskEditingDeadline = signal<WorkflowTask | null>(null);

  protected readonly isAdmin = this.auth.hasRole('ADMIN');
  protected readonly canChangeLifecycle = this.isAdmin || this.auth.hasRole('LEGAL_REVIEWER');

  protected readonly workflowStatusLabels = WORKFLOW_STATUS_LABELS;
  protected readonly workflowStatusTones = WORKFLOW_STATUS_TONES;
  protected readonly taskStatusLabels = TASK_STATUS_LABELS;
  protected readonly taskStatusTones = TASK_STATUS_TONES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly eventLabels = EVENT_LABELS;
  protected readonly formatDateTime = formatDateTime;

  protected readonly participantRows = computed(() => {
    const participants = this.workflow()?.participants ?? [];
    const holder = (type: ParticipantType, assignment: 'PRIMARY' | 'BACKUP') =>
      participants.find(
        (participant) =>
          participant.participantType === type && participant.assignmentType === assignment,
      )?.user?.name ?? null;
    return PARTICIPANT_ORDER.map((type) => ({
      label: PARTICIPANT_LABELS[type],
      primary: holder(type, 'PRIMARY'),
      backup: holder(type, 'BACKUP'),
    }));
  });

  protected readonly completedCount = computed(
    () => this.workflow()?.tasks.filter((task) => task.status === 'COMPLETED').length ?? 0,
  );

  ngOnInit(): void {
    void this.load();
    this.notificationService.watchWorkflow(this.workflowId());
    this.workflowChangesSubscription = this.notificationService.workflowChanged.subscribe(
      (workflowId) => {
        if (workflowId !== this.workflowId()) return;
        if (!this.isRefreshingFromStream) {
          this.isRefreshingFromStream = true;
          void this.load().finally(() => {
            this.isRefreshingFromStream = false;
          });
        }
      },
    );
    this.notificationService.refreshNotifications();
  }

  ngOnDestroy(): void {
    this.workflowChangesSubscription?.unsubscribe();
    this.notificationService.stopWatchingWorkflow();
  }

  protected async load(): Promise<void> {
    this.errorMessage.set(null);
    try {
      const [workflow, events] = await Promise.all([
        this.api.getWorkflow(this.workflowId()),
        this.api.getEvents(this.workflowId()),
      ]);
      this.workflow.set(workflow);
      this.events.set([...events].reverse());
      const requestedTaskId = this.isDialog()
        ? 0
        : Number(this.route.snapshot.queryParamMap.get('task'));
      if (requestedTaskId > 0 && workflow.tasks.some((task) => task.id === requestedTaskId)) {
        this.openTaskId.set(requestedTaskId);
      }
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  // Tras cualquier cambio se recarga también el historial.
  protected onChanged(workflow: WorkflowDetail): void {
    this.workflow.set(workflow);
    void this.api.getEvents(workflow.id).then((events) => {
      this.events.set([...events].reverse());
    });
  }

  protected taskName(taskId: number | null): string | null {
    if (taskId === null) return null;
    return this.workflow()?.tasks.find((task) => task.id === taskId)?.name ?? null;
  }
}
