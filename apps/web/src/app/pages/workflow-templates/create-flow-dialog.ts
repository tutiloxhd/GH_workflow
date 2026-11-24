import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import type { TemplateDetail } from '../../core/workflow-templates/workflow-template.model';
import { WorkflowTemplatesApiService } from '../../core/workflow-templates/workflow-templates-api.service';
import { ModalDialog } from '../../shared/modal/modal-dialog';
import { toCode } from './template-code';

const MAX_FLOW_CODE_LENGTH = 100;

// Crea un flujo nuevo (versión 1) como borrador vacío.
@Component({
  selector: 'app-create-flow-dialog',
  imports: [ReactiveFormsModule, ModalDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="create-flow-title" (closed)="closed.emit()">
      <form class="modal-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h2 id="create-flow-title">Nuevo flujo</h2>
        <p class="muted">
          Se crea como borrador vacío. Mientras otro flujo esté activo, los remates nuevos siguen
          usando ese hasta que publiques este.
        </p>
        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }
        <label class="field">
          Nombre
          <input
            formControlName="name"
            autocomplete="off"
            [attr.aria-invalid]="showsError('name')"
            (input)="suggestCode()"
          />
          @if (showsError('name')) {
            <span class="field-error">Ingresa el nombre del flujo.</span>
          }
        </label>
        <label class="field">
          Código
          <input
            formControlName="code"
            autocomplete="off"
            [attr.aria-invalid]="showsError('code')"
            (input)="normalizeCode()"
          />
          <span class="field-hint">Mayúsculas, números y guion bajo. No se puede cambiar.</span>
          @if (showsError('code')) {
            <span class="field-error">Ingresa un código que empiece con una letra.</span>
          }
        </label>
        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Cancelar</button>
          <button type="submit" class="button primary" [disabled]="isSaving()">
            {{ isSaving() ? 'Creando…' : 'Crear borrador' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class CreateFlowDialog {
  private readonly api = inject(WorkflowTemplatesApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly created = output<TemplateDetail>();
  readonly closed = output();

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    code: [
      '',
      [Validators.required, Validators.maxLength(100), Validators.pattern(/^[A-Z][A-Z0-9_]*$/)],
    ],
  });
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private isCodeEdited = false;

  protected showsError(field: 'name' | 'code'): boolean {
    const control = this.form.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  // Propone un código a partir del nombre hasta que el usuario lo edite a mano.
  protected suggestCode(): void {
    if (this.isCodeEdited) return;
    this.form.controls.code.setValue(toCode(this.form.controls.name.value, MAX_FLOW_CODE_LENGTH));
  }

  protected normalizeCode(): void {
    this.isCodeEdited = true;
    this.form.controls.code.setValue(toCode(this.form.controls.code.value, MAX_FLOW_CODE_LENGTH));
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const { code, name } = this.form.getRawValue();
      this.created.emit(await this.api.createFlow(code, name.trim()));
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
