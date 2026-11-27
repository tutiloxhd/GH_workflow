import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime } from '../../core/time/santiago-time';
import { ROLE_LABELS } from '../../core/users/user.model';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import {
  isTaskWorkable,
  PARTICIPANT_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  type EvidenceData,
  type WorkflowDetail,
} from '../../core/workflow/workflow.model';
import { ModalDialog } from '../../shared/modal/modal-dialog';
import { EvidenceFormComponent } from './evidence-form';
import { ParticipantsForm } from './participants-form';

// La tarea «Asignar gestor y postor» se trabaja asignando participantes, no con evidencia.
const ASSIGN_PARTICIPANTS_TASK_CODE = 'ASSIGN_MANAGER_AND_BIDDER';

// Detalle de una tarea con sus acciones: en curso, evidencia y completar.
@Component({
  selector: 'app-task-dialog',
  imports: [ModalDialog, EvidenceFormComponent, ParticipantsForm, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-dialog.html',
})
export class TaskDialog implements OnInit {
  private readonly api = inject(WorkflowApiService);
  private readonly auth = inject(AuthService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly workflowId = input.required<number>();
  readonly taskId = input.required<number>();
  readonly isReadOnly = input(false);
  readonly fullscreenOnMobile = input(false);
  readonly changed = output<WorkflowDetail>();
  readonly closed = output();

  protected readonly workflow = signal<WorkflowDetail | null>(null);
  protected readonly task = computed(
    () => this.workflow()?.tasks.find((candidate) => candidate.id === this.taskId()) ?? null,
  );
  protected readonly isBusy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly invalidEvidenceFields = signal<readonly string[]>([]);
  protected readonly isConfirmingCompletion = signal(false);

  protected readonly statusLabels = TASK_STATUS_LABELS;
  protected readonly statusTones = TASK_STATUS_TONES;
  protected readonly participantLabels = PARTICIPANT_LABELS;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly formatDateTime = formatDateTime;

  // Quién es el usuario respecto de la tarea; decide qué acciones ve (la API vuelve a validarlo).
  protected readonly relation = computed(() => {
    const task = this.task();
    const userId = this.auth.currentUser()?.id;
    if (!task || userId === undefined) return 'NONE';
    if (task.assignee?.id === userId) return 'ASSIGNEE';
    if (task.backup?.id === userId) return 'BACKUP';
    return this.auth.hasRole('ADMIN') ? 'ADMIN' : 'NONE';
  });

  protected readonly canWork = computed(() => {
    const task = this.task();
    return (
      !this.isReadOnly() &&
      task !== null &&
      this.workflow()?.status === 'ACTIVE' &&
      isTaskWorkable(task.status) &&
      this.relation() !== 'NONE'
    );
  });

  protected readonly isMissingEvidence = computed(() => {
    const task = this.task();
    return task !== null && task.requiresEvidence &&
      (task.evidence === null || (task.evidenceForm?.requiresPhoto === true && task.evidencePhotos.length === 0));
  });

  protected readonly isAssignParticipantsTask = computed(
    () => this.task()?.code === ASSIGN_PARTICIPANTS_TASK_CODE,
  );

  // Solo administración puede asignar participantes (la API lo vuelve a validar).
  protected readonly canAssignParticipants = computed(
    () => this.isAssignParticipantsTask() && this.canWork() && this.auth.hasRole('ADMIN'),
  );

  // Igual que la API: hacen falta los titulares de gestor y postor para completar.
  protected readonly isMissingParticipants = computed(() => {
    if (!this.isAssignParticipantsTask()) return false;
    const participants = this.workflow()?.participants ?? [];
    const hasPrimary = (type: 'MANAGER' | 'BIDDER') =>
      participants.some(
        (participant) =>
          participant.participantType === type &&
          participant.assignmentType === 'PRIMARY' &&
          participant.user !== null,
      );
    return !hasPrimary('MANAGER') || !hasPrimary('BIDDER');
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.workflow.set(await this.api.getWorkflow(this.workflowId()));
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  private async run(action: () => Promise<WorkflowDetail>, successNotice: string): Promise<void> {
    this.isBusy.set(true);
    this.errorMessage.set(null);
    this.notice.set(null);
    try {
      const updated = await action();
      this.workflow.set(updated);
      this.changed.emit(updated);
      this.notice.set(successNotice);
    } catch (error) {
      const problem = toApiProblem(error);
      this.errorMessage.set(problemMessage(problem));
    } finally {
      this.isBusy.set(false);
    }
  }

  protected startTask(): void {
    void this.run(() => this.api.startTask(this.taskId()), 'La tarea quedó en curso.');
  }

  protected async saveEvidence(data: EvidenceData): Promise<void> {
    this.invalidEvidenceFields.set([]);
    this.isBusy.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await this.api.submitEvidence(this.taskId(), data);
      this.workflow.set(updated);
      this.changed.emit(updated);
      this.notice.set('Evidencia guardada.');
    } catch (error) {
      const problem = toApiProblem(error);
      this.invalidEvidenceFields.set(problem.invalidFields ?? []);
      this.errorMessage.set(
        problem.code === 'INVALID_EVIDENCE'
          ? 'La evidencia tiene campos inválidos.'
          : problemMessage(problem),
      );
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async uploadPhotos(files: readonly File[]): Promise<void> {
    if (files.length + (this.task()?.evidencePhotos.length ?? 0) > 5 || files.some((file) => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      this.errorMessage.set('La foto debe ser JPEG, PNG o WebP y medir hasta 5 MB.');
      return;
    }
    this.isBusy.set(true);
    this.errorMessage.set(null);
    try {
      for (const file of files) {
        const updated = await this.api.uploadEvidencePhoto(this.taskId(), file);
        this.workflow.set(updated);
        this.changed.emit(updated);
      }
      this.notice.set('Fotos guardadas.');
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isBusy.set(false);
    }
  }

  protected async removePhoto(photoId: number): Promise<void> {
    await this.run(() => this.api.deleteEvidencePhoto(this.taskId(), photoId), 'Foto eliminada.');
  }

  protected onParticipantsSaved(updated: WorkflowDetail): void {
    this.workflow.set(updated);
    this.changed.emit(updated);
    this.errorMessage.set(null);
    this.notice.set('Participantes guardados.');
  }

  protected async completeTask(): Promise<void> {
    this.isConfirmingCompletion.set(false);
    await this.run(() => this.api.completeTask(this.taskId()), 'Tarea completada.');
  }
}
