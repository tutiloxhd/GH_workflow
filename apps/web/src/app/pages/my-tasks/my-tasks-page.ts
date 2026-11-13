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
import { TaskDialog } from '../workflow/task-dialog';
import { DUE_GROUP_LABELS, DUE_GROUP_ORDER, groupByDue, type DueGroup } from './task-groups';

@Component({
  selector: 'app-my-tasks-page',
  imports: [TaskDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-tasks-page.html',
  styleUrl: './my-tasks-page.css',
})
export class MyTasksPage implements OnInit {
  private readonly api = inject(WorkflowApiService);

  protected readonly tasks = signal<readonly MyTask[]>([]);
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
    const groups = this.groups();
    return [
      { label: 'Activas', value: this.tasks().length, tone: 'neutral' },
      { label: 'Vencidas', value: groups.get('OVERDUE')?.length ?? 0, tone: 'late' },
      { label: 'Vencen hoy', value: groups.get('TODAY')?.length ?? 0, tone: 'alert' },
      { label: 'Esta semana', value: groups.get('THIS_WEEK')?.length ?? 0, tone: 'good' },
    ];
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      this.tasks.set(await this.api.listMyTasks());
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

  // Al cerrar el modal se recarga la bandeja: completar o reasignar cambia lo que corresponde ver.
  protected onTaskDialogClosed(): void {
    this.openTask.set(null);
    void this.load();
  }
}
