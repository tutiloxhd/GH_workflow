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
  WorkflowSummary,
} from './workflow.model';

interface WorkflowEnvelope {
  readonly workflow: WorkflowDetail;
}

export interface ParticipantAssignment {
  readonly participantType: ParticipantType;
  readonly primaryUserId: number;
  readonly backupUserId: number | null;
}

const PAGE_SIZE = 100;

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  private readonly http = inject(HttpClient);

  // Todos los comandos responden con el detalle actualizado del workflow.
  private async command(request: ReturnType<HttpClient['post']>): Promise<WorkflowDetail> {
    const { workflow } = (await firstValueFrom(request)) as WorkflowEnvelope;
    return workflow;
  }

  async listWorkflows(): Promise<{ workflows: readonly WorkflowSummary[]; total: number }> {
    const params = new HttpParams().set('limit', PAGE_SIZE);
    return firstValueFrom(
      this.http.get<{ workflows: WorkflowSummary[]; total: number }>('/api/workflows', { params }),
    );
  }

  async listPropertiesWithoutWorkflow(): Promise<readonly PropertyRow[]> {
    const params = new HttpParams().set('limit', PAGE_SIZE).set('withoutWorkflow', 'true');
    const { properties } = await firstValueFrom(
      this.http.get<{ properties: PropertyRow[] }>('/api/properties', { params }),
    );
    return properties;
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

  async listMyTasks(): Promise<readonly MyTask[]> {
    const { tasks } = await firstValueFrom(this.http.get<{ tasks: MyTask[] }>('/api/tasks/mine'));
    return tasks;
  }

  assignParticipants(
    workflowId: number,
    assignments: readonly ParticipantAssignment[],
  ): Promise<WorkflowDetail> {
    return this.command(
      this.http.put(`/api/workflows/${workflowId}/participants`, { assignments }),
    );
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
