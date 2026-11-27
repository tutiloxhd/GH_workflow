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
      @if (definition().requiresPhoto) {
        <label class="field">
          Fotos de evidencia (1 a 5, hasta 5 MB cada una)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple
            [disabled]="isDisabled() || photos().length >= 5"
            (change)="selectPhotos($event)" />
        </label>
        <ul>
          @for (photo of photos(); track photo.id) {
            <li>
              <a [href]="photoUrl(photo.id)" target="_blank" rel="noopener">Foto {{ $index + 1 }}</a>
              <button type="button" class="button link" [disabled]="isDisabled()"
                (click)="photoRemoved.emit(photo.id)">Quitar</button>
            </li>
          }
        </ul>
        @if (photos().length === 0) {
          <p class="field-hint">Adjunta al menos una foto antes de guardar la evidencia.</p>
        }
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
  readonly photos = input<readonly { readonly id: number }[]>([]);
  readonly taskId = input.required<number>();
  readonly photoSelected = output<readonly File[]>();
  readonly photoRemoved = output<number>();

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
    if (field.type === 'AMOUNT_CLP' || field.type === 'INTEGER') validators.push(Validators.pattern(/^\d+$/));
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
    if (field.type === 'INTEGER') return 'Ingresa un número entero no negativo.';
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
          return [field.name, field.type === 'AMOUNT_CLP' || field.type === 'INTEGER' ? Number(value) : value];
        }),
    );
    this.submitted.emit(data);
  }

  protected photoUrl(photoId: number): string {
    return `/api/tasks/${this.taskId()}/evidence/photos/${photoId}`;
  }

  protected selectPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.photoSelected.emit(Array.from(input.files ?? []));
    input.value = '';
  }
}
