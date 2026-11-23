import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import type { User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import {
  WorkflowApiService,
  type ParticipantAssignment,
} from '../../core/workflow/workflow-api.service';
import {
  PARTICIPANT_LABELS,
  type ParticipantType,
  type WorkflowDetail,
} from '../../core/workflow/workflow.model';

const PARTICIPANT_TYPES: readonly ParticipantType[] = ['MANAGER', 'BIDDER', 'LEGAL_REVIEWER'];
const MAX_CANDIDATES = 100;

interface Selection {
  primaryUserId: number | null;
  backupUserId: number | null;
}

// Formulario de titular y suplente por rol. Solo se envían los roles con titular elegido.
// Lo usan el modal de participantes y el modal de la tarea «Asignar gestor y postor».
@Component({
  selector: 'app-participants-form',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="modal-form" (ngSubmit)="save()">
      @if (errorMessage(); as message) {
        <p class="form-error" role="alert">{{ message }}</p>
      }
      @for (type of participantTypes; track type) {
        <fieldset class="checkbox-list">
          <legend>{{ labels[type] }}</legend>
          <label class="field">
            Titular
            <select [name]="type + '-primary'" [(ngModel)]="selections[type].primaryUserId">
              <option [ngValue]="null">Sin cambios</option>
              @for (user of candidatesFor(type); track user.id) {
                <option [ngValue]="user.id">{{ user.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            Suplente
            <select [name]="type + '-backup'" [(ngModel)]="selections[type].backupUserId">
              <option [ngValue]="null">Sin suplente</option>
              @for (user of candidatesFor(type); track user.id) {
                <option [ngValue]="user.id">{{ user.name }}</option>
              }
            </select>
          </label>
        </fieldset>
      }
      <div class="modal-actions">
        @if (showCancel()) {
          <button type="button" class="button" (click)="cancelled.emit()">Cancelar</button>
        }
        <button type="submit" class="button primary" [disabled]="isSaving() || isDisabled()">
          {{ isSaving() ? 'Guardando…' : 'Guardar participantes' }}
        </button>
      </div>
    </form>
  `,
})
export class ParticipantsForm implements OnInit {
  private readonly usersApi = inject(UsersApiService);
  private readonly workflowApi = inject(WorkflowApiService);

  readonly workflow = input.required<WorkflowDetail>();
  readonly showCancel = input(false);
  readonly isDisabled = input(false);
  readonly saved = output<WorkflowDetail>();
  readonly cancelled = output();

  protected readonly participantTypes = PARTICIPANT_TYPES;
  protected readonly labels = PARTICIPANT_LABELS;
  protected readonly candidates = signal<Record<ParticipantType, readonly User[]>>({
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
  protected readonly errorMessage = signal<string | null>(null);

  protected candidatesFor(type: ParticipantType): readonly User[] {
    const candidates = this.candidates()[type];
    if (type === 'LEGAL_REVIEWER') return candidates;

    const property = this.workflow().property;
    if (type === 'BIDDER' && isVideoCall(property?.auctionMode ?? null)) return candidates;
    const assignmentRegion = property?.assignmentRegion;
    if (!assignmentRegion) return [];
    return candidates.filter((user) => sameRegion(user.regionName, assignmentRegion));
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
    try {
      const pages = await Promise.all(
        PARTICIPANT_TYPES.map((role) =>
          this.usersApi.list({ search: '', limit: MAX_CANDIDATES, offset: 0, role }),
        ),
      );
      const [managers, bidders, legalReviewers] = pages.map((page) =>
        page.users.filter((user) => user.status === 'ACTIVE'),
      );
      this.candidates.set({
        MANAGER: managers ?? [],
        BIDDER: bidders ?? [],
        LEGAL_REVIEWER: legalReviewers ?? [],
      });
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    }
  }

  protected async save(): Promise<void> {
    const assignments: ParticipantAssignment[] = PARTICIPANT_TYPES.flatMap((participantType) => {
      const { primaryUserId, backupUserId } = this.selections[participantType];
      return primaryUserId === null ? [] : [{ participantType, primaryUserId, backupUserId }];
    });
    if (assignments.some((assignment) => assignment.primaryUserId === assignment.backupUserId)) {
      this.errorMessage.set('El titular y el suplente deben ser personas distintas.');
      return;
    }
    if (assignments.length === 0) {
      this.errorMessage.set('Elige al menos un titular.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      this.saved.emit(await this.workflowApi.assignParticipants(this.workflow().id, assignments));
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('es-CL');
}

function sameRegion(userRegion: string | null, propertyRegion: string): boolean {
  return userRegion !== null && normalizeLabel(userRegion) === normalizeLabel(propertyRegion);
}

function isVideoCall(mode: string | null): boolean {
  return mode !== null && normalizeLabel(mode) === 'videollamada';
}
