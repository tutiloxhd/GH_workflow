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
    <dialog appModalDialog aria-labelledby="participants-title" (closed)="closed.emit()">
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
                @for (user of candidates()[type]; track user.id) {
                  <option [ngValue]="user.id">{{ user.name }}</option>
                }
              </select>
            </label>
            <label class="field">
              Suplente
              <select [name]="type + '-backup'" [(ngModel)]="selections[type].backupUserId">
                <option [ngValue]="null">Sin suplente</option>
                @for (user of candidates()[type]; track user.id) {
                  <option [ngValue]="user.id">{{ user.name }}</option>
                }
              </select>
            </label>
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

  protected isAuctionParticipant(type: ParticipantType): boolean {
    return type !== 'LEGAL_REVIEWER';
  }

  protected sourceName(type: ParticipantType): string | null {
    const property = this.workflow().property;
    if (type === 'MANAGER') return property?.auctionPayerName ?? null;
    if (type === 'BIDDER') return property?.auctionBidderName ?? null;
    return null;
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

  // Solo usuarios activos con el rol del puesto: la API rechaza cualquier otro.
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
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
