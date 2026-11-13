import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { SyncApiService } from '../../core/sync/sync-api.service';
import {
  CHANGE_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  ISSUE_SEVERITY_LABELS,
  SYNC_STATUS_LABELS,
  SYNC_STATUS_TONES,
  describeChange,
  isReviewable,
  type SourceChange,
  type SyncExecution,
  type SyncIssue,
  type SyncStatus,
} from '../../core/sync/sync.model';
import { formatDateTime } from '../../core/time/santiago-time';

type ChangeFilter = 'PENDING' | 'ALL';

// Estado del sincronizador con admin_new: ejecuciones, incidencias y cambios que requieren atención.
@Component({
  selector: 'app-sync-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sync-page.html',
})
export class SyncPage implements OnInit {
  private readonly api = inject(SyncApiService);

  protected readonly status = signal<SyncStatus | null>(null);
  protected readonly changes = signal<readonly SourceChange[]>([]);
  protected readonly changeFilter = signal<ChangeFilter>('PENDING');
  protected readonly selectedExecution = signal<SyncExecution | null>(null);
  protected readonly issues = signal<readonly SyncIssue[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly reviewingChangeId = signal<number | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly statusLabels = SYNC_STATUS_LABELS;
  protected readonly statusTones = SYNC_STATUS_TONES;
  protected readonly changeTypeLabels = CHANGE_TYPE_LABELS;
  protected readonly changeStatusLabels = CHANGE_STATUS_LABELS;
  protected readonly severityLabels = ISSUE_SEVERITY_LABELS;
  protected readonly formatDateTime = formatDateTime;
  protected readonly describeChange = describeChange;
  protected readonly isReviewable = isReviewable;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const [status, changes] = await Promise.all([
        this.api.getStatus(),
        this.api.listChanges(this.changeFilter() === 'PENDING' ? 'PENDING' : null),
      ]);
      this.status.set(status);
      this.changes.set(changes);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async setChangeFilter(filter: string): Promise<void> {
    this.changeFilter.set(filter === 'ALL' ? 'ALL' : 'PENDING');
    await this.load();
  }

  protected async showIssues(execution: SyncExecution): Promise<void> {
    if (this.selectedExecution()?.id === execution.id) {
      this.selectedExecution.set(null);
      return;
    }
    this.errorMessage.set(null);
    try {
      this.issues.set(await this.api.listIssues(execution.id));
      this.selectedExecution.set(execution);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  protected async review(change: SourceChange): Promise<void> {
    this.reviewingChangeId.set(change.id);
    this.errorMessage.set(null);
    try {
      await this.api.reviewChange(change.id);
      await this.load();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.reviewingChangeId.set(null);
    }
  }
}
