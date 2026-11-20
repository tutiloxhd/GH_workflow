import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  DeadlineRule,
  EvidenceData,
  MyTask,
  ParticipantType,
  PropertyRow,
  WorkflowDetail,
  WorkflowEvent,
  WorkflowFilterOptions,
  WorkflowSummary,
  WorkflowStatus,
} from './workflow.model';

interface WorkflowEnvelope {
  readonly workflow: WorkflowDetail;
}

export interface ParticipantAssignment {
  readonly participantType: ParticipantType;
  readonly primaryUserId: number;
  readonly backupUserId: number | null;
}

export interface ParticipantCandidate {
  readonly id: number;
  readonly name: string;
  readonly rut: string | null;
  readonly roles: readonly string[];
  readonly agentTypes: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);

  // Todos los comandos responden con el detalle actualizado del workflow.
  private async command(request: ReturnType<HttpClient['post']>): Promise<WorkflowDetail> {
    const { workflow } = (await firstValueFrom(request)) as WorkflowEnvelope;
    return workflow;
  }

  async listWorkflows(filters: {
    readonly status?: WorkflowStatus;
    readonly responsibleUserId?: number;
    readonly commune?: string;
    readonly region?: string;
    readonly auctionFrom?: string;
    readonly auctionTo?: string;
    readonly limit: number;
    readonly offset: number;
  }): Promise<{
    workflows: readonly WorkflowSummary[];
    total: number;
    filterOptions: WorkflowFilterOptions;
  }> {
    let params = new HttpParams().set('limit', filters.limit).set('offset', filters.offset);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.responsibleUserId)
      params = params.set('responsibleUserId', filters.responsibleUserId);
    if (filters.commune) params = params.set('commune', filters.commune);
    if (filters.region) params = params.set('region', filters.region);
    if (filters.auctionFrom) params = params.set('auctionFrom', filters.auctionFrom);
    if (filters.auctionTo) params = params.set('auctionTo', filters.auctionTo);
    return firstValueFrom(
      this.http.get<{
        workflows: WorkflowSummary[];
        total: number;
        filterOptions: WorkflowFilterOptions;
      }>('/api/workflows', { params }),
    );
  }

  listPropertiesWithoutWorkflow(
    limit: number,
    offset: number,
  ): Promise<{
    properties: readonly PropertyRow[];
    total: number;
  }> {
    const params = new HttpParams()
      .set('limit', limit)
      .set('offset', offset)
      .set('withoutWorkflow', 'true');
    return firstValueFrom(
      this.http.get<{ properties: PropertyRow[]; total: number }>('/api/properties', { params }),
    );
  }

  startWorkflow(propertyId: number): Promise<WorkflowDetail> {
    return this.command(this.http.post(`/api/properties/${propertyId}/workflow`, null));
  }

  async getWorkflow(workflowId: number): Promise<WorkflowDetail> {
    const { workflow } = await firstValueFrom(
      this.http.get<WorkflowEnvelope>(`/api/workflows/${workflowId}`),
    );
    return workflow;
  }

  async getEvents(workflowId: number): Promise<readonly WorkflowEvent[]> {
    const { events } = await firstValueFrom(
      this.http.get<{ events: WorkflowEvent[] }>(`/api/workflows/${workflowId}/events`),
    );
    return events;
  }

  listMyTasks(
    limit: number,
    offset: number,
  ): Promise<{
    tasks: readonly MyTask[];
    total: number;
    metrics: { overdue: number; today: number; thisWeek: number };
  }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return firstValueFrom(
      this.http.get<{
        tasks: MyTask[];
        total: number;
        metrics: { overdue: number; today: number; thisWeek: number };
      }>('/api/tasks/mine', { params }),
    );
  }

  assignParticipants(
    workflowId: number,
    assignments: readonly ParticipantAssignment[],
  ): Promise<WorkflowDetail> {
    return this.command(
      this.http.put(`/api/workflows/${workflowId}/participants`, { assignments }),
    );
  }

  async listParticipantCandidates(workflowId: number): Promise<readonly ParticipantCandidate[]> {
    const { candidates } = await firstValueFrom(
      this.http.get<{ candidates: ParticipantCandidate[] }>(
        `/api/workflows/${workflowId}/participant-candidates`,
      ),
    );
    return candidates;
  }

  suspend(
    workflowId: number,
    reason: string,
    newAuctionAt: string | null,
  ): Promise<WorkflowDetail> {
    return this.command(
      this.http.post(`/api/workflows/${workflowId}/suspend`, {
        reason,
        ...(newAuctionAt ? { newAuctionAt } : {}),
      }),
    );
  }

  resume(workflowId: number, newAuctionAt: string, reason: string | null): Promise<WorkflowDetail> {
    return this.command(
      this.http.post(`/api/workflows/${workflowId}/resume`, {
        newAuctionAt,
        ...(reason ? { reason } : {}),
      }),
    );
  }

  cancel(workflowId: number, reason: string): Promise<WorkflowDetail> {
    return this.command(this.http.post(`/api/workflows/${workflowId}/cancel`, { reason }));
  }

  startTask(taskId: number): Promise<WorkflowDetail> {
    return this.command(this.http.post(`/api/tasks/${taskId}/start`, null));
  }

  completeTask(taskId: number): Promise<WorkflowDetail> {
    return this.command(this.http.post(`/api/tasks/${taskId}/complete`, null));
  }

  submitEvidence(taskId: number, formData: EvidenceData): Promise<WorkflowDetail> {
    return this.command(this.http.put(`/api/tasks/${taskId}/evidence`, { formData }));
  }

  changeDeadline(taskId: number, rule: DeadlineRule): Promise<WorkflowDetail> {
    return this.command(this.http.put(`/api/tasks/${taskId}/deadline`, rule));
  }
}
