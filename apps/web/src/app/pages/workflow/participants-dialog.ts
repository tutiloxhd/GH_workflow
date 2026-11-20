import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import type { User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import {
  WorkflowApiService,
  type ParticipantCandidate,
  type ParticipantAssignment,
} from '../../core/workflow/workflow-api.service';
import {
  PARTICIPANT_LABELS,
  type ParticipantType,
  type WorkflowDetail,
} from '../../core/workflow/workflow.model';
import { ModalDialog } from '../../shared/modal/modal-dialog';

const PARTICIPANT_TYPES: readonly ParticipantType[] = ['MANAGER', 'BIDDER', 'LEGAL_REVIEWER'];
const MAX_CANDIDATES = 100;

interface Selection {
  primaryUserId: number | null;
  backupUserId: number | null;
}

// Asigna titular y suplente por rol. Solo se envían los roles con titular elegido.
@Component({
  selector: 'app-participants-dialog',
  imports: [ModalDialog, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      appModalDialog
      class="participants-dialog"
      aria-labelledby="participants-title"
      (closed)="closed.emit()"
    >
      <form class="modal-form" (ngSubmit)="save()">
        <h2 id="participants-title">Participantes del remate</h2>
        <p class="muted">
          Las tareas abiertas de cada rol pasan a los participantes elegidos. El suplente ve las
          tareas del titular y, si actúa en una, lo reemplaza.
        </p>
        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        @for (type of participantTypes; track type) {
          <fieldset class="checkbox-list">
            <legend>{{ labels[type] }}</legend>
            @if (isAuctionParticipant(type)) {
              @if (sourceName(type); as name) {
                <p class="muted">{{ name }}</p>
              }
            }
            <label class="field">
              Titular
              <select [name]="type + '-primary'" [(ngModel)]="selections[type].primaryUserId">
                <option [ngValue]="null">Sin cambios</option>
                @for (user of candidatesFor(type); track user.id) {
                  <option [ngValue]="user.id" [disabled]="!isCandidateEligible(type, user)">
                    {{ candidateLabel(type, user) }}
                  </option>
                }
              </select>
            </label>
            <label class="field">
              Suplente
              <select [name]="type + '-backup'" [(ngModel)]="selections[type].backupUserId">
                <option [ngValue]="null">Sin suplente</option>
                @for (user of candidatesFor(type); track user.id) {
                  <option [ngValue]="user.id" [disabled]="!isCandidateEligible(type, user)">
                    {{ candidateLabel(type, user) }}
                  </option>
                }
              </select>
            </label>
            @if (participantEligibilityMessage(type); as message) {
              <p class="muted" role="status">{{ message }}</p>
            }
            @if (emptyCandidatesMessage(type); as message) {
              <p class="muted" role="status">{{ message }}</p>
            }
          </fieldset>
        }
        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Cancelar</button>
          <button type="submit" class="button primary" [disabled]="isSaving()">
            {{ isSaving() ? 'Guardando…' : 'Guardar participantes' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class ParticipantsDialog implements OnInit {
  private readonly usersApi = inject(UsersApiService);
  private readonly workflowApi = inject(WorkflowApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly workflow = input.required<WorkflowDetail>();
  readonly saved = output<WorkflowDetail>();
  readonly closed = output();

  protected readonly participantTypes = PARTICIPANT_TYPES;
  protected readonly labels = PARTICIPANT_LABELS;
  protected readonly candidates = signal<
    Record<ParticipantType, readonly (User | ParticipantCandidate)[]>
  >({
    MANAGER: [],
    BIDDER: [],
    LEGAL_REVIEWER: [],
  });
  protected readonly selections: Record<ParticipantType, Selection> = {
    MANAGER: { primaryUserId: null, backupUserId: null },
    BIDDER: { primaryUserId: null, backupUserId: null },
    LEGAL_REVIEWER: { primaryUserId: null, backupUserId: null },
  };
  protected readonly isSaving = signal(false);
  protected readonly isLoadingCandidates = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected isAuctionParticipant(type: ParticipantType): boolean {
    return type !== 'LEGAL_REVIEWER';
  }

  protected sourceName(type: ParticipantType): string | null {
    const property = this.workflow().property;
    if (type === 'MANAGER') return property?.auctionPayerName ?? null;
    if (type === 'BIDDER') return property?.auctionBidderName ?? null;
    return null;
  }

  protected candidatesFor(type: ParticipantType): readonly (User | ParticipantCandidate)[] {
    return this.candidates()[type];
  }

  protected isCandidateEligible(type: ParticipantType, user: User | ParticipantCandidate): boolean {
    if (type === 'LEGAL_REVIEWER') return true;
    if (!('agentTypes' in user)) return false;
    if (type === 'MANAGER') {
      return (
        user.agentTypes.includes('region') &&
        (!isInPersonAuction(this.workflow().property?.auctionMode ?? null) ||
          (user.agentTypes.includes('oficina') && user.roles.includes('BIDDER')))
      );
    }
    return user.agentTypes.includes('oficina');
  }

  protected candidateLabel(type: ParticipantType, user: User | ParticipantCandidate): string {
    const name = `${user.name}${user.rut ? ' · ' + user.rut : ''}`;
    if (this.isCandidateEligible(type, user) || type === 'LEGAL_REVIEWER') return name;
    return `${name} · Tipo no elegible`;
  }

  protected participantEligibilityMessage(type: ParticipantType): string | null {
    if (type === 'LEGAL_REVIEWER') return null;
    if (type === 'MANAGER') {
      return isInPersonAuction(this.workflow().property?.auctionMode ?? null)
        ? 'En modalidad presencial, el gestor también será postor y debe ser agente de tipo oficina y tener el rol Postor.'
        : 'Solo puedes asignar agentes de tipo región.';
    }
    return 'El postor debe ser un agente de tipo oficina.';
  }

  protected emptyCandidatesMessage(type: ParticipantType): string | null {
    if (this.isLoadingCandidates() || this.errorMessage() || this.candidatesFor(type).length > 0) {
      return null;
    }
    return `No hay usuarios activos disponibles para ${this.labels[type]}.`;
  }

  ngOnInit(): void {
    for (const participant of this.workflow().participants) {
      const selection = this.selections[participant.participantType];
      const userId = participant.user?.id ?? null;
      if (participant.assignmentType === 'PRIMARY') selection.primaryUserId = userId;
      else selection.backupUserId = userId;
    }
    void this.loadCandidates();
  }

  // El servidor valida además la regla de región y modalidad antes de guardar la selección.
  private async loadCandidates(): Promise<void> {
    this.isLoadingCandidates.set(true);
    this.errorMessage.set(null);
    const results = await Promise.allSettled([
      this.workflowApi.listParticipantCandidates(this.workflow().id),
      this.usersApi.list({ search: '', limit: MAX_CANDIDATES, offset: 0, role: 'LEGAL_REVIEWER' }),
    ]);
    const candidates = { ...this.candidates() };
    const [agentResult, legalResult] = results;
    const failedRoles: ParticipantType[] = [];
    if (agentResult?.status === 'fulfilled') {
      const sorted = [...agentResult.value].sort(
        (first, second) =>
          first.name.localeCompare(second.name, 'es-CL', { sensitivity: 'base' }) ||
          first.id - second.id,
      );
      candidates.MANAGER = sorted.filter((candidate) => candidate.roles.includes('MANAGER'));
      candidates.BIDDER = sorted.filter((candidate) => candidate.roles.includes('BIDDER'));
    } else {
      failedRoles.push('MANAGER', 'BIDDER');
    }
    if (legalResult?.status === 'fulfilled') {
      candidates.LEGAL_REVIEWER = legalResult.value.users
        .filter((user) => user.status === 'ACTIVE')
        .sort(
          (first, second) =>
            first.name.localeCompare(second.name, 'es-CL', { sensitivity: 'base' }) ||
            first.id - second.id,
        );
    } else {
      failedRoles.push('LEGAL_REVIEWER');
    }
    this.candidates.set(candidates);
    this.isLoadingCandidates.set(false);
    if (failedRoles.length > 0) {
      this.errorMessage.set(
        `No se pudo cargar la lista de: ${failedRoles.map((role) => this.labels[role]).join(', ')}.`,
      );
    }
  }

  protected async save(): Promise<void> {
    const assignments: ParticipantAssignment[] = PARTICIPANT_TYPES.flatMap((participantType) => {
      const { primaryUserId, backupUserId } = this.selections[participantType];
      const currentPrimary =
        this.workflow().participants.find(
          (participant) =>
            participant.participantType === participantType &&
            participant.assignmentType === 'PRIMARY',
        )?.user?.id ?? null;
      const currentBackup =
        this.workflow().participants.find(
          (participant) =>
            participant.participantType === participantType &&
            participant.assignmentType === 'BACKUP',
        )?.user?.id ?? null;
      if (primaryUserId === currentPrimary && backupUserId === currentBackup) return [];
      return primaryUserId === null ? [] : [{ participantType, primaryUserId, backupUserId }];
    });
    const hasCurrentBidder = this.workflow().participants.some(
      (participant) =>
        participant.participantType === 'BIDDER' && participant.assignmentType === 'PRIMARY',
    );
    const managerAssignment = assignments.find(
      (assignment) => assignment.participantType === 'MANAGER',
    );
    const managerUserId = managerAssignment?.primaryUserId ?? this.selections.MANAGER.primaryUserId;
    if (
      isInPersonAuction(this.workflow().property?.auctionMode ?? null) &&
      !hasCurrentBidder &&
      managerUserId !== null
    ) {
      assignments.push({
        participantType: 'BIDDER',
        primaryUserId: managerUserId,
        backupUserId: null,
      });
    }
    if (assignments.some((assignment) => assignment.primaryUserId === assignment.backupUserId)) {
      this.errorMessage.set('El titular y el suplente deben ser personas distintas.');
      return;
    }
    if (assignments.length === 0) {
      this.errorMessage.set('No hay cambios para guardar.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      this.saved.emit(await this.workflowApi.assignParticipants(this.workflow().id, assignments));
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-CL');
}

function isVideoCall(mode: string | null): boolean {
  return mode !== null && normalizeLabel(mode) === 'videollamada';
}

function isInPersonAuction(mode: string | null): boolean {
  return mode !== null && normalizeLabel(mode) === 'presencial';
}
