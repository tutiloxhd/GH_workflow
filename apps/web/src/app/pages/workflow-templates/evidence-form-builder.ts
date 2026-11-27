import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type {
  EvidenceField,
  EvidenceFieldType,
  EvidenceForm,
} from '../../core/workflow/workflow.model';
import { toCode } from './template-code';

type FieldOption = NonNullable<EvidenceField['options']>[number];

export const MAX_EVIDENCE_FIELDS = 30;
const MAX_FIELD_NAME_LENGTH = 50;

export const FIELD_TYPE_LABELS: Readonly<Record<EvidenceFieldType, string>> = {
  TEXT: 'Texto corto',
  LONG_TEXT: 'Texto largo',
  DATE: 'Fecha',
  AMOUNT_CLP: 'Monto en pesos',
  INTEGER: 'Número entero',
  CHOICE: 'Lista de opciones',
};

// «N° de Vale Vista» → «nDeValeVista». El nombre identifica el dato guardado: se fija al crear
// el campo y no cambia al editar la etiqueta, para no desconectar la evidencia ya registrada.
export function toFieldName(label: string, taken: readonly string[]): string {
  const words = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const [first = 'campo', ...rest] = words;
  const base = (/^[a-z]/.test(first) ? first : `campo${first}`)
    .concat(rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(''))
    .slice(0, MAX_FIELD_NAME_LENGTH - 3);
  let name = base;
  for (let suffix = 2; taken.includes(name); suffix++) name = `${base}${String(suffix)}`;
  return name;
}

// Opciones escritas una por línea; conserva el valor de las que ya existían con la misma etiqueta.
export function parseOptions(text: string, previous: readonly FieldOption[]): FieldOption[] {
  const labels = [...new Set(text.split('\n').map((line) => line.trim()))].filter(Boolean);
  const used: string[] = [];
  return labels.map((label) => {
    const existing = previous.find((option) => option.label === label);
    let value = existing?.value ?? (toCode(label, MAX_FIELD_NAME_LENGTH) || 'OPCION');
    for (let suffix = 2; used.includes(value); suffix++) value = `${value}_${String(suffix)}`;
    used.push(value);
    return { value, label };
  });
}

// Editor de los campos del formulario de evidencia de una tarea.
@Component({
  selector: 'app-evidence-form-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="form-builder" [disabled]="disabled()">
      <legend>Formulario de evidencia</legend>
      <label class="builder-required">
        <input type="checkbox" [checked]="form()?.requiresPhoto === true"
          (change)="setPhotoRequirement($any($event.target).checked)" />
        Exigir al menos una foto (máximo cinco)
      </label>
      <label class="builder-required">
        <input type="checkbox" [checked]="form()?.notifyLegalOnSubmit === true"
          (change)="setLegalNotification($any($event.target).checked)" />
        Avisar a revisión legal al guardar evidencia
      </label>
      @if (fields().length === 0) {
        <p class="field-hint">
          Sin campos: la tarea no pide datos al completarse. Agrega campos para registrar, por
          ejemplo, un número de documento o una fecha.
        </p>
      }
      <ol class="builder-fields">
        @for (
          field of fields();
          track field.name;
          let index = $index, first = $first, last = $last
        ) {
          <li class="builder-field">
            <div class="builder-row">
              <label class="field">
                Etiqueta
                <input
                  [id]="idPrefix() + '-label-' + index"
                  maxlength="150"
                  [value]="field.label"
                  (input)="update(index, { label: $any($event.target).value })"
                />
              </label>
              <label class="field">
                Tipo
                <select
                  [value]="field.type"
                  (change)="changeType(index, $any($event.target).value)"
                >
                  @for (type of types(); track type) {
                    <option [value]="type" [selected]="type === field.type">
                      {{ typeLabels[type] }}
                    </option>
                  }
                </select>
              </label>
              <label class="builder-required">
                <input
                  type="checkbox"
                  [checked]="field.isRequired"
                  (change)="update(index, { isRequired: $any($event.target).checked })"
                />
                Obligatorio
              </label>
            </div>
            @if (field.type === 'CHOICE') {
              <label class="field">
                Opciones (una por línea)
                <textarea
                  rows="3"
                  [value]="optionsText(field)"
                  (change)="changeOptions(index, $any($event.target).value)"
                ></textarea>
              </label>
            }
            <div class="builder-actions">
              <span class="field-hint">Dato: {{ field.name }}</span>
              <button
                type="button"
                class="button link"
                [disabled]="first"
                (click)="move(index, -1)"
              >
                ↑
              </button>
              <button type="button" class="button link" [disabled]="last" (click)="move(index, 1)">
                ↓
              </button>
              <button type="button" class="button link danger-link" (click)="remove(index)">
                Quitar campo
              </button>
            </div>
          </li>
        }
      </ol>
      <button
        type="button"
        class="button"
        [disabled]="fields().length >= maxFields"
        (click)="add()"
      >
        + Agregar campo
      </button>
    </fieldset>
  `,
  styles: `
    .form-builder {
      display: grid;
      gap: 10px;
      min-width: 0;
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 12px;
    }
    legend {
      padding: 0 4px;
      font-size: 0.8125rem;
      font-weight: 650;
    }
    .builder-fields {
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .builder-field {
      display: grid;
      gap: 8px;
      padding: 10px;
      border-radius: 10px;
      background: var(--surface-muted, rgba(15, 23, 42, 0.03));
    }
    .builder-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      align-items: end;
      gap: 10px;
    }
    .builder-required {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 42px;
      font-size: 0.8125rem;
    }
    .builder-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .builder-actions .field-hint {
      margin-right: auto;
    }
    textarea {
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      font: inherit;
    }
  `,
})
export class EvidenceFormBuilder {
  readonly form = model.required<EvidenceForm | null>();
  readonly types = input<readonly EvidenceFieldType[]>(
    Object.keys(FIELD_TYPE_LABELS) as EvidenceFieldType[],
  );
  readonly disabled = input(false);
  readonly idPrefix = input('form-builder');

  protected readonly typeLabels = FIELD_TYPE_LABELS;
  protected readonly maxFields = MAX_EVIDENCE_FIELDS;
  protected readonly fields = computed(() => this.form()?.fields ?? []);

  protected optionsText(field: EvidenceField): string {
    return (field.options ?? []).map((option) => option.label).join('\n');
  }

  protected add(): void {
    const label = `Campo ${String(this.fields().length + 1)}`;
    const name = toFieldName(
      label,
      this.fields().map((field) => field.name),
    );
    this.setFields([...this.fields(), { name, label, type: 'TEXT', isRequired: true }]);
  }

  protected update(index: number, changes: Partial<Omit<EvidenceField, 'name'>>): void {
    this.setFields(
      this.fields().map((field, position) =>
        position === index ? { ...field, ...changes } : field,
      ),
    );
  }

  protected changeType(index: number, type: EvidenceFieldType): void {
    const field = this.fields()[index];
    if (!field) return;
    const { options, ...rest } = field;
    const nextOptions = options ?? [{ value: 'OPCION_1', label: 'Opción 1' }];
    this.setFields(
      this.fields().map((candidate, position) =>
        position === index
          ? type === 'CHOICE'
            ? { ...rest, type, options: nextOptions }
            : { ...rest, type }
          : candidate,
      ),
    );
  }

  protected changeOptions(index: number, text: string): void {
    const field = this.fields()[index];
    if (!field) return;
    this.update(index, { options: parseOptions(text, field.options ?? []) });
  }

  protected move(index: number, offset: -1 | 1): void {
    const fields = [...this.fields()];
    const [field] = fields.splice(index, 1);
    if (field) fields.splice(index + offset, 0, field);
    this.setFields(fields);
  }

  protected remove(index: number): void {
    this.setFields(this.fields().filter((_, position) => position !== index));
  }

  private setFields(fields: readonly EvidenceField[]): void {
    const previous = this.form();
    this.form.set(fields.length > 0 || previous?.requiresPhoto ? { ...previous, fields } : null);
  }

  protected setPhotoRequirement(requiresPhoto: boolean): void {
    const previous = this.form();
    this.form.set(previous || requiresPhoto ? { ...previous, fields: previous?.fields ?? [], requiresPhoto } : null);
  }

  protected setLegalNotification(notifyLegalOnSubmit: boolean): void {
    const previous = this.form();
    this.form.set(previous || notifyLegalOnSubmit ? { ...previous, fields: previous?.fields ?? [], notifyLegalOnSubmit } : null);
  }
}
