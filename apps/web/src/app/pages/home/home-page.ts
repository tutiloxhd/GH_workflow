import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime, santiagoLocalToIso } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import { ListPagination } from '../../shared/pagination/list-pagination';
import { Icon } from '../../shared/icon/icon';
import {
  PARTICIPANT_LABELS,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  type ParticipantType,
  type PropertyRow,
  type WorkflowDetail,
  type WorkflowFilterOptions,
  type WorkflowStatus,
  type WorkflowSummary,
} from '../../core/workflow/workflow.model';

const SANTIAGO_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const DATE_LABEL = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
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
const EMPTY_FILTER_OPTIONS: WorkflowFilterOptions = { communes: [], regions: [], responsibles: [] };

// Tablero inicial: remates con workflow y, para ADMIN, propiedades que aún no lo tienen.
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ListPagination, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.html',
  styleUrl: './home-page.css',
})
export class HomePage implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly detailPanel = viewChild<ElementRef<HTMLElement>>('detailPanel');
  private detailTrigger: HTMLElement | null = null;

  protected readonly user = this.auth.currentUser;
  protected readonly isAdmin = this.auth.hasRole('ADMIN');
  protected readonly workflows = signal<readonly WorkflowSummary[]>([]);
  protected readonly totalWorkflows = signal(0);
  protected readonly filterOptions = signal<WorkflowFilterOptions>(EMPTY_FILTER_OPTIONS);
  protected readonly properties = signal<readonly PropertyRow[]>([]);
  protected readonly totalProperties = signal(0);
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly startingPropertyId = signal<number | null>(null);
  protected readonly selectedWeekStart = signal(keyFromDate(mondayFor(localDateKey(new Date()))));
  protected readonly selectedWorkflow = signal<WorkflowDetail | null>(null);
  protected readonly isFiltersOpen = signal(false);
  protected readonly statusFilter = signal<WorkflowStatus | ''>('');
  protected readonly responsibleFilter = signal<number | null>(null);
  protected readonly communeFilter = signal('');
  protected readonly regionFilter = signal('');
  protected readonly pageSize = signal(10);
  protected readonly offset = signal(0);
  protected readonly propertyPageSize = signal(10);
  protected readonly propertyOffset = signal(0);
  protected readonly hasFilters = computed(
    () =>
      Boolean(this.statusFilter()) ||
      this.responsibleFilter() !== null ||
      Boolean(this.communeFilter().trim()) ||
      Boolean(this.regionFilter().trim()),
  );
  protected readonly emptyWorkflowMessage = computed(() => {
    if (this.isLoading()) return 'Cargando…';
    if (this.hasFilters()) return 'No hay remates que coincidan con los filtros en esta semana.';
    return 'No hay remates programados para esta semana.';
  });

  protected readonly visibleWorkflows = this.workflows;
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
        this.api.listWorkflows({
          status: this.statusFilter() || undefined,
          responsibleUserId: this.responsibleFilter() ?? undefined,
          commune: this.communeFilter().trim() || undefined,
          region: this.regionFilter().trim() || undefined,
          auctionFrom: santiagoLocalToIso(`${this.selectedWeekStart()}T00:00`),
          auctionTo: santiagoLocalToIso(
            `${keyFromDate(shiftDate(dateFromKey(this.selectedWeekStart()), 7))}T00:00`,
          ),
          limit: this.pageSize(),
          offset: this.offset(),
        }),
        this.isAdmin
          ? this.api.listPropertiesWithoutWorkflow(this.propertyPageSize(), this.propertyOffset())
          : Promise.resolve({ properties: [], total: 0 }),
      ]);
      this.workflows.set(workflowPage.workflows);
      this.totalWorkflows.set(workflowPage.total);
      this.filterOptions.set(workflowPage.filterOptions);
      this.properties.set(properties.properties);
      this.totalProperties.set(properties.total);
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
    this.selectedWeekStart.set(
      keyFromDate(shiftDate(dateFromKey(this.selectedWeekStart()), offset * 7)),
    );
    this.offset.set(0);
    this.closeDetail();
    void this.load();
  }

  protected applyFilters(): void {
    this.offset.set(0);
    this.closeDetail();
    void this.load();
  }

  protected toggleFilters(): void {
    this.isFiltersOpen.update((isOpen) => !isOpen);
  }

  protected clearFilters(): void {
    this.statusFilter.set('');
    this.responsibleFilter.set(null);
    this.communeFilter.set('');
    this.regionFilter.set('');
    this.applyFilters();
  }

  protected setStatusFilter(value: string): void {
    this.statusFilter.set(value as WorkflowStatus | '');
    this.applyFilters();
  }

  protected setResponsibleFilter(value: string): void {
    this.responsibleFilter.set(value === '' ? null : Number(value));
  }

  protected setPageSize(value: number): void {
    this.pageSize.set(value);
    this.offset.set(0);
    void this.load();
  }

  protected setWorkflowOffset(offset: number): void {
    this.offset.set(offset);
    this.closeDetail();
    void this.load();
  }

  protected setPropertyPageSize(pageSize: number): void {
    this.propertyPageSize.set(pageSize);
    this.propertyOffset.set(0);
    void this.load();
  }

  protected setPropertyOffset(offset: number): void {
    this.propertyOffset.set(offset);
    void this.load();
  }

  protected async openDetail(workflowId: number, trigger?: EventTarget | null): Promise<void> {
    this.errorMessage.set(null);
    this.detailTrigger = trigger instanceof HTMLElement ? trigger : null;
    try {
      this.selectedWorkflow.set(await this.api.getWorkflow(workflowId));
      queueMicrotask(() => this.detailPanel()?.nativeElement.focus());
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  protected closeDetail(): void {
    this.selectedWorkflow.set(null);
    queueMicrotask(() => this.detailTrigger?.focus());
  }

  @HostListener('document:keydown.escape')
  protected closeDetailWithEscape(): void {
    if (this.selectedWorkflow()) this.closeDetail();
  }

  protected currentTask(workflow: WorkflowDetail) {
    return (
      workflow.tasks.find((task) => task.status === 'IN_PROGRESS') ??
      workflow.tasks.find((task) => task.status === 'READY') ??
      null
    );
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
