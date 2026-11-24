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
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { formatDateTime } from '../../core/time/santiago-time';
import type { DeadlineDayKind, DeadlineRule } from '../../core/workflow/deadline-rule';
import { WorkflowApiService } from '../../core/workflow/workflow-api.service';
import type { WorkflowDetail, WorkflowTask } from '../../core/workflow/workflow.model';
import { DeadlineRuleEditor } from '../../shared/deadline/deadline-rule-editor';
import { ModalDialog } from '../../shared/modal/modal-dialog';

// Cambia el plazo de una tarea solo en este remate; la plantilla no cambia.
@Component({
  selector: 'app-deadline-dialog',
  imports: [ModalDialog, DeadlineRuleEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="deadline-title" (closed)="closed.emit()">
      <form class="modal-form" (submit)="$event.preventDefault(); save()">
        <h2 id="deadline-title">Plazo de «{{ task().name }}»</h2>
        <p class="muted">
          El cambio aplica solo a este remate.
          {{
            dayKind() === 'BUSINESS'
              ? 'Se cuentan días hábiles: sin fines de semana ni feriados.'
              : 'Este remate usa una versión del flujo que cuenta días corridos.'
          }}
        </p>
        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        <app-deadline-rule-editor
          idPrefix="deadline-dialog"
          legend="Nuevo plazo"
          [dayKind]="dayKind()"
          [(rule)]="rule"
        />
        @if (task().dueAt) {
          <p class="field-hint">
            Vencimiento actual: {{ formatDateTime(task().dueAt) }}. La nueva fecha se calcula al
            guardar.
          </p>
        }
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
  readonly dayKind = input<DeadlineDayKind>('CALENDAR');
  readonly saved = output<WorkflowDetail>();
  readonly closed = output();

  protected readonly rule = signal<DeadlineRule>({
    dueReference: 'TASK_ACTIVATED_AT',
    dueOffsetDays: 3,
    dueOffsetMinutes: 0,
  });
  protected readonly formatDateTime = formatDateTime;
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.rule.set({ ...this.task().deadline });
  }

  protected async save(): Promise<void> {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      this.saved.emit(await this.api.changeDeadline(this.task().id, this.rule()));
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
