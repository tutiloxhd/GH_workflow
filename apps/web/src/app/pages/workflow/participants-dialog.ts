import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import type { WorkflowDetail } from '../../core/workflow/workflow.model';
import { ModalDialog } from '../../shared/modal/modal-dialog';
import { ParticipantsForm } from './participants-form';

// Modal para asignar titular y suplente por rol desde la página del remate.
@Component({
  selector: 'app-participants-dialog',
  imports: [ModalDialog, ParticipantsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="participants-title" (closed)="closed.emit()">
      <div class="modal-form">
        <h2 id="participants-title">Participantes del remate</h2>
        <p class="muted">
          Las tareas abiertas de cada rol pasan a los participantes elegidos. El suplente ve las
          tareas del titular y, si actúa en una, lo reemplaza.
        </p>
        <app-participants-form
          [workflow]="workflow()"
          [showCancel]="true"
          (saved)="onSaved($event)"
          (cancelled)="modal().close()"
        />
      </div>
    </dialog>
  `,
})
export class ParticipantsDialog {
  protected readonly modal = viewChild.required(ModalDialog);

  readonly workflow = input.required<WorkflowDetail>();
  readonly saved = output<WorkflowDetail>();
  readonly closed = output();

  protected onSaved(updated: WorkflowDetail): void {
    this.saved.emit(updated);
    this.modal().close();
  }
}
