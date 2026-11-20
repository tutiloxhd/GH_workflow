import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import {
  PARTICIPANT_LABELS,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type ParticipantType,
  type PropertyRow,
  type WorkflowDetail,
  type WorkflowSummary,
} from '../../core/workflow/workflow.model';

const SANTIAGO_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});
const DATE_LABEL = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});
const localDateKey = (value: Date): string => SANTIAGO_DATE_PARTS.format(value);
const dateFromKey = (key: string): Date => new Date(`${key}T00:00:00Z`);
const shiftDate = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);
const mondayFor = (dateKey: string): Date => {
  const date = dateFromKey(dateKey);
  return shiftDate(date, 1 - (date.getUTCDay() || 7));
};
const keyFromDate = (date: Date): string => date.toISOString().slice(0, 10);
const PARTICIPANT_ORDER: readonly ParticipantType[] = ['MANAGER', 'BIDDER', 'LEGAL_REVIEWER'];

// Tablero inicial: remates con workflow y, para ADMIN, propiedades que aún no lo tienen.
@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.currentUser;
  protected readonly isAdmin = this.auth.hasRole('ADMIN');
  protected readonly workflows = signal<readonly WorkflowSummary[]>([]);
  protected readonly properties = signal<readonly PropertyRow[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly startingPropertyId = signal<number | null>(null);
  protected readonly selectedWeekStart = signal(keyFromDate(mondayFor(localDateKey(new Date()))));
  protected readonly selectedWorkflow = signal<WorkflowDetail | null>(null);

  protected readonly visibleWorkflows = computed(() => {
    const start = dateFromKey(this.selectedWeekStart());
    const end = shiftDate(start, 7);
    return this.workflows().filter((workflow) => {
      if (!workflow.auctionAt) return false;
      const auctionDate = dateFromKey(localDateKey(new Date(workflow.auctionAt)));
      return auctionDate >= start && auctionDate < end;
    });
  });
  protected readonly weekLabel = computed(() => {
    const start = dateFromKey(this.selectedWeekStart());
    const end = shiftDate(start, 6);
    return `${DATE_LABEL.format(start)} – ${DATE_LABEL.format(end)} ${end.getUTCFullYear()}`;
  });

  protected readonly statusLabels = WORKFLOW_STATUS_LABELS;
  protected readonly statusTones = WORKFLOW_STATUS_TONES;
  protected readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const [workflowPage, properties] = await Promise.all([
        this.api.listWorkflows(),
        this.isAdmin ? this.api.listPropertiesWithoutWorkflow() : Promise.resolve([]),
      ]);
      this.workflows.set(workflowPage.workflows);
      this.properties.set(properties);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async startWorkflow(property: PropertyRow): Promise<void> {
    this.startingPropertyId.set(property.id);
    this.errorMessage.set(null);
    try {
      const workflow = await this.api.startWorkflow(property.id);
      await this.router.navigate(['/workflows', workflow.id]);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.startingPropertyId.set(null);
    }
  }

  protected changeWeek(offset: number): void {
    this.selectedWeekStart.set(keyFromDate(shiftDate(dateFromKey(this.selectedWeekStart()), offset * 7)));
    this.closeDetail();
  }

  protected async openDetail(workflowId: number): Promise<void> {
    this.errorMessage.set(null);
    try {
      this.selectedWorkflow.set(await this.api.getWorkflow(workflowId));
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  protected closeDetail(): void {
    this.selectedWorkflow.set(null);
  }

  protected completedTaskCount(workflow: WorkflowDetail): number {
    return workflow.tasks.filter((task) => task.status === 'COMPLETED').length;
  }

  protected participantRows(workflow: WorkflowDetail): readonly {
    readonly label: string;
    readonly primary: string;
    readonly backup: string | null;
  }[] {
    return PARTICIPANT_ORDER.map((participantType) => {
      const participantName = (assignmentType: 'PRIMARY' | 'BACKUP') =>
        workflow.participants.find(
          (participant) =>
            participant.participantType === participantType &&
            participant.assignmentType === assignmentType,
        )?.user?.name ?? null;
      const sourceName =
        participantType === 'MANAGER'
          ? workflow.property?.auctionPayerName
          : participantType === 'BIDDER'
            ? workflow.property?.auctionBidderName
            : null;

      return {
        label: PARTICIPANT_LABELS[participantType],
        primary: sourceName ?? participantName('PRIMARY') ?? 'Sin asignar',
        backup: participantName('BACKUP'),
      };
    });
  }
}
