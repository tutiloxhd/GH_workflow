import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { santiagoLocalToIso } from '../../core/time/santiago-time';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import type { WorkflowDetail } from '../../core/workflow/workflow.model';
import { ModalDialog } from '../../shared/modal/modal-dialog';

export type LifecycleAction = 'SUSPEND' | 'RESUME' | 'CANCEL';

const TITLES: Readonly<Record<LifecycleAction, string>> = {
  SUSPEND: 'Suspender remate',
  RESUME: 'Reanudar remate',
  CANCEL: 'Cancelar remate',
};

// Suspender, reanudar o cancelar, con las reglas aprobadas (ADR 0006) explicadas al usuario.
@Component({
  selector: 'app-lifecycle-dialog',
  imports: [ModalDialog, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="lifecycle-title" (closed)="closed.emit()">
      <form class="modal-form" (ngSubmit)="confirm()">
        <h2 id="lifecycle-title">{{ title() }}</h2>
        @switch (action()) {
          @case ('SUSPEND') {
            <p class="muted">
              Con nueva fecha, el remate sigue activo y se recalculan los vencimientos. Sin fecha,
              el remate y sus tareas abiertas quedan suspendidos hasta que alguien lo reanude
              indicando la nueva fecha.
            </p>
          }
          @case ('RESUME') {
            <p class="muted">
              Las tareas vuelven a su estado anterior y sus vencimientos se recalculan desde la
              nueva fecha.
            </p>
          }
          @case ('CANCEL') {
            <p class="muted">
              Cierra el remate y cancela todas sus tareas abiertas. No se puede reanudar.
            </p>
          }
        }
        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        <label class="field">
          Motivo{{ action() === 'RESUME' ? ' (opcional)' : '' }}
          <textarea name="reason" [(ngModel)]="reason" maxlength="1000"></textarea>
        </label>
        @if (action() !== 'CANCEL') {
          <label class="field">
            Nueva fecha y hora del remate{{ action() === 'SUSPEND' ? ' (opcional)' : '' }}
            <input type="datetime-local" name="newAuctionAt" [(ngModel)]="newAuctionAt" />
            <span class="field-hint">Hora de Santiago.</span>
          </label>
        }
        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Volver</button>
          <button
            type="submit"
            class="button"
            [class.danger]="action() === 'CANCEL'"
            [class.primary]="action() !== 'CANCEL'"
            [disabled]="isSaving()"
          >
            {{ title() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class LifecycleDialog {
  private readonly api = inject(WorkflowApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly workflow = input.required<WorkflowDetail>();
  readonly action = input.required<LifecycleAction>();
  readonly saved = output<WorkflowDetail>();
  readonly closed = output();

  protected readonly title = computed(() => TITLES[this.action()]);
  protected reason = '';
  protected newAuctionAt = '';
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private validationError(): string | null {
    const action = this.action();
    if (action !== 'RESUME' && this.reason.trim() === '') return 'Indica el motivo.';
    if (action === 'RESUME' && this.newAuctionAt === '') {
      return 'Para reanudar indica la nueva fecha del remate.';
    }
    return null;
  }

  private request(): Promise<WorkflowDetail> {
    const workflowId = this.workflow().id;
    const reason = this.reason.trim();
    const newAuctionAt = this.newAuctionAt ? santiagoLocalToIso(this.newAuctionAt) : null;
    switch (this.action()) {
      case 'SUSPEND':
        return this.api.suspend(workflowId, reason, newAuctionAt);
      case 'RESUME':
        return this.api.resume(workflowId, newAuctionAt ?? '', reason || null);
      case 'CANCEL':
        return this.api.cancel(workflowId, reason);
    }
  }

  protected async confirm(): Promise<void> {
    const invalid = this.validationError();
    this.errorMessage.set(invalid);
    if (invalid) return;

    this.isSaving.set(true);
    try {
      this.saved.emit(await this.request());
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
