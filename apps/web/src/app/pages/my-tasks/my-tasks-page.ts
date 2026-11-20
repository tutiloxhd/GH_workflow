import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { formatDateTime, formatRelativeDue } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import { TASK_STATUS_LABELS, type MyTask } from '../../core/workflow/workflow.model';
import { ListPagination } from '../../shared/pagination/list-pagination';
import { TaskDialog } from '../workflow/task-dialog';
import { DUE_GROUP_LABELS, DUE_GROUP_ORDER, groupByDue, type DueGroup } from './task-groups';

@Component({
  selector: 'app-my-tasks-page',
  imports: [TaskDialog, ListPagination],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-tasks-page.html',
  styleUrl: './my-tasks-page.css',
})
export class MyTasksPage implements OnInit {
  private readonly api = inject(WorkflowApiService);

  protected readonly tasks = signal<readonly MyTask[]>([]);
  protected readonly totalTasks = signal(0);
  protected readonly taskMetrics = signal({ overdue: 0, today: 0, thisWeek: 0 });
  protected readonly pageSize = signal(10);
  protected readonly offset = signal(0);
  protected readonly now = signal(new Date());
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly collapsedGroups = signal<ReadonlySet<DueGroup>>(new Set());
  protected readonly openTask = signal<MyTask | null>(null);

  protected readonly groupOrder = DUE_GROUP_ORDER;
  protected readonly groupLabels = DUE_GROUP_LABELS;
  protected readonly statusLabels = TASK_STATUS_LABELS;
  protected readonly formatDateTime = formatDateTime;

  protected readonly groups = computed(() => groupByDue(this.tasks(), this.now()));
  protected readonly metrics = computed(() => {
    const metrics = this.taskMetrics();
    return [
      { label: 'Activas', value: this.totalTasks(), tone: 'neutral' },
      { label: 'Vencidas', value: metrics.overdue, tone: 'late' },
      { label: 'Vencen hoy', value: metrics.today, tone: 'alert' },
      { label: 'Esta semana', value: metrics.thisWeek, tone: 'good' },
    ];
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const page = await this.api.listMyTasks(this.pageSize(), this.offset());
      this.tasks.set(page.tasks);
      this.totalTasks.set(page.total);
      this.taskMetrics.set(page.metrics);
      this.now.set(new Date());
    } catch (error) {
      this.loadError.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected relativeDue(task: MyTask): string {
    return formatRelativeDue(task.dueAt, this.now());
  }

  protected isCollapsed(group: DueGroup): boolean {
    return this.collapsedGroups().has(group);
  }

  protected toggleGroup(group: DueGroup): void {
    this.collapsedGroups.update((collapsed) => {
      const next = new Set(collapsed);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  protected setPageSize(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.offset.set(0);
    void this.load();
  }

  protected setOffset(offset: number): void {
    this.offset.set(offset);
    void this.load();
  }

  // Al cerrar el modal se recarga la bandeja: completar o reasignar cambia lo que corresponde ver.
  protected onTaskDialogClosed(): void {
    this.openTask.set(null);
    void this.load();
  }
}
