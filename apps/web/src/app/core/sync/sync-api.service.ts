import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SourceChange, SourceChangeStatus, SyncIssue, SyncStatus } from './sync.model';

const CHANGES_PAGE_SIZE = 50;

// Consultas al estado del sincronizador (solo ADMIN). La sincronización corre en su propio
// proceso; la interfaz no la dispara.
@Injectable({ providedIn: 'root' })
export class SyncApiService {
  private readonly http = inject(HttpClient);

  getStatus(): Promise<SyncStatus> {
    return firstValueFrom(this.http.get<SyncStatus>('/api/sync/status'));
  }

  async listIssues(executionId: number): Promise<readonly SyncIssue[]> {
    const { issues } = await firstValueFrom(
      this.http.get<{ issues: SyncIssue[] }>(`/api/sync/executions/${executionId}/issues`),
    );
    return issues;
  }

  async listChanges(status: SourceChangeStatus | null): Promise<readonly SourceChange[]> {
    let params = new HttpParams().set('limit', CHANGES_PAGE_SIZE);
    if (status) params = params.set('status', status);
    const { changes } = await firstValueFrom(
      this.http.get<{ changes: SourceChange[] }>('/api/sync/changes', { params }),
    );
    return changes;
  }

  async reviewChange(changeId: number): Promise<void> {
    await firstValueFrom(this.http.post(`/api/sync/changes/${changeId}/review`, null));
  }
}
