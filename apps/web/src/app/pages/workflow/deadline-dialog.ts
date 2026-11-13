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
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import {
  DUE_REFERENCE_LABELS,
  type DueReference,
  type WorkflowDetail,
  type WorkflowTask,
} from '../../core/workflow/workflow.model';
import { ModalDialog } from '../../shared/modal/modal-dialog';

const MAX_OFFSET_DAYS = 365;

// Cambia el plazo de una tarea solo en este remate; la plantilla no cambia.
@Component({
  selector: 'app-deadline-dialog',
  imports: [ModalDialog, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="deadline-title" (closed)="closed.emit()">
      <form class="modal-form" (ngSubmit)="save()">
        <h2 id="deadline-title">Plazo de «{{ task().name }}»</h2>
        <p class="muted">
          El cambio aplica solo a este remate. Los días se cuentan en calendario de Santiago; use
          números negativos para «antes de» una fecha.
        </p>
        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        <label class="field">
          Se mide
          <select name="dueReference" [(ngModel)]="dueReference">
            @for (reference of references; track reference) {
              <option [value]="reference">{{ referenceLabels[reference] }}</option>
            }
          </select>
        </label>
        <label class="field">
          Días
          <input
            type="number"
            name="dueOffsetDays"
            [(ngModel)]="dueOffsetDays"
            [min]="-maxDays"
            [max]="maxDays"
            step="1"
          />
        </label>
        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Cancelar</button>
          <button type="submit" class="button primary" [disabled]="isSaving()">
            Guardar plazo
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class DeadlineDialog implements OnInit {
  private readonly api = inject(WorkflowApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly task = input.required<WorkflowTask>();
  readonly saved = output<WorkflowDetail>();
  readonly closed = output();

  protected readonly references = Object.keys(DUE_REFERENCE_LABELS) as DueReference[];
  protected readonly referenceLabels = DUE_REFERENCE_LABELS;
  protected readonly maxDays = MAX_OFFSET_DAYS;
  protected dueReference: DueReference = 'TASK_ACTIVATED_AT';
  protected dueOffsetDays = 3;
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.dueReference = this.task().deadline.dueReference;
    this.dueOffsetDays = this.task().deadline.dueOffsetDays;
  }

  protected async save(): Promise<void> {
    if (!Number.isInteger(this.dueOffsetDays) || Math.abs(this.dueOffsetDays) > MAX_OFFSET_DAYS) {
      this.errorMessage.set(
        `Los días deben ser un entero entre -${MAX_OFFSET_DAYS} y ${MAX_OFFSET_DAYS}.`,
      );
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      this.saved.emit(
        await this.api.changeDeadline(this.task().id, {
          dueReference: this.dueReference,
          dueOffsetDays: this.dueOffsetDays,
          dueOffsetMinutes: this.task().deadline.dueOffsetMinutes,
        }),
      );
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
