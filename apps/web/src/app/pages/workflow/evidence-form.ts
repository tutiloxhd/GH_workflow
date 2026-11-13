import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  type OnInit,
} from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormGroup,
} from '@angular/forms';
import type { EvidenceData, EvidenceField, EvidenceForm } from '../../core/workflow/workflow.model';

// Dibuja el formulario de evidencia que define la API para la tarea. La API vuelve a validarlo.
@Component({
  selector: 'app-evidence-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="modal-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @for (field of definition().fields; track field.name) {
        <label class="field">
          {{ field.label }}{{ field.isRequired ? '' : ' (opcional)' }}
          @switch (field.type) {
            @case ('LONG_TEXT') {
              <textarea
                [formControlName]="field.name"
                [attr.aria-invalid]="showsError(field)"
              ></textarea>
            }
            @case ('CHOICE') {
              <select [formControlName]="field.name" [attr.aria-invalid]="showsError(field)">
                <option value="">Selecciona…</option>
                @for (option of field.options ?? []; track option.value) {
                  <option [value]="option.value">{{ option.label }}</option>
                }
              </select>
            }
            @default {
              <input
                [type]="inputType(field)"
                [formControlName]="field.name"
                [attr.inputmode]="field.type === 'AMOUNT_CLP' ? 'numeric' : null"
                [attr.aria-invalid]="showsError(field)"
              />
            }
          }
          @if (showsError(field)) {
            <span class="field-error">{{ errorText(field) }}</span>
          }
        </label>
      }
      @if (serverInvalidFields().length > 0) {
        <p class="form-error" role="alert">Revisa los campos marcados.</p>
      }
      <div class="modal-actions">
        <button type="submit" class="button" [disabled]="isDisabled()">
          {{ hasSavedEvidence() ? 'Actualizar evidencia' : 'Guardar evidencia' }}
        </button>
      </div>
    </form>
  `,
})
export class EvidenceFormComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly definition = input.required<EvidenceForm>();
  readonly savedData = input<EvidenceData | null>(null);
  readonly isDisabled = input(false);
  // Campos que la API rechazó en el último envío.
  readonly serverInvalidFields = input<readonly string[]>([]);
  readonly submitted = output<EvidenceData>();

  protected form: FormGroup<Record<string, FormControl<string>>> = this.formBuilder.group({});
  protected readonly hasSavedEvidence = computed(() => this.savedData() !== null);
  private wasSubmitted = false;

  ngOnInit(): void {
    const saved = this.savedData() ?? {};
    const controls = Object.fromEntries(
      this.definition().fields.map((field) => [
        field.name,
        this.formBuilder.control(
          saved[field.name] === undefined ? '' : String(saved[field.name]),
          this.validatorsFor(field),
        ),
      ]),
    );
    this.form = this.formBuilder.group(controls);
  }

  private validatorsFor(field: EvidenceField) {
    const validators = field.isRequired ? [Validators.required] : [];
    if (field.type === 'AMOUNT_CLP') validators.push(Validators.pattern(/^\d+$/));
    return validators;
  }

  protected inputType(field: EvidenceField): string {
    return field.type === 'DATE' ? 'date' : 'text';
  }

  protected showsError(field: EvidenceField): boolean {
    const control = this.form.controls[field.name];
    return (
      (this.wasSubmitted && control?.invalid === true) ||
      this.serverInvalidFields().includes(field.name)
    );
  }

  protected errorText(field: EvidenceField): string {
    if (field.type === 'AMOUNT_CLP') return 'Ingresa un monto en pesos, sin puntos ni decimales.';
    return field.isRequired ? 'Este campo es obligatorio.' : 'Revisa este campo.';
  }

  protected submit(): void {
    this.wasSubmitted = true;
    if (this.form.invalid) return;

    // Los campos opcionales vacíos no se envían; los montos viajan como número.
    const values = this.form.getRawValue();
    const data = Object.fromEntries(
      this.definition()
        .fields.filter((field) => (values[field.name] ?? '').trim() !== '')
        .map((field) => {
          const value = (values[field.name] ?? '').trim();
          return [field.name, field.type === 'AMOUNT_CLP' ? Number(value) : value];
        }),
    );
    this.submitted.emit(data);
  }
}
