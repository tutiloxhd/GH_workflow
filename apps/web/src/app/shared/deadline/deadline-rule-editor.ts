import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  describeDeadline,
  dayUnit,
  DUE_REFERENCE_SHORT_LABELS,
  MAX_OFFSET_DAYS,
  type DeadlineDayKind,
  type DeadlineRule,
} from '../../core/workflow/deadline-rule';
import type { DueReference } from '../../core/workflow/workflow.model';

type Direction = 'after' | 'before';

const MINUTES_PER_HOUR = 60;
const ALL_REFERENCES = Object.keys(DUE_REFERENCE_SHORT_LABELS) as DueReference[];

// Plazo en lenguaje natural: «[3] días hábiles [antes ▾] de [la fecha del remate ▾]».
// Reemplaza el número negativo por una dirección explícita y muestra el resultado en una frase.
@Component({
  selector: 'app-deadline-rule-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="deadline-editor" [disabled]="disabled()">
      <legend>{{ legend() }}</legend>
      <div class="deadline-sentence">
        <span>Vence</span>
        <input
          type="number"
          class="deadline-days"
          [id]="idPrefix() + '-days'"
          min="0"
          [max]="maxDays"
          step="1"
          inputmode="numeric"
          [attr.aria-label]="'Cantidad de ' + dayUnit(2, dayKind())"
          [value]="absoluteDays()"
          (input)="setDays($any($event.target).valueAsNumber)"
        />
        <span>{{ dayUnit(absoluteDays(), dayKind()) }}</span>
        <select
          aria-label="Antes o después"
          [value]="direction()"
          [disabled]="isActivation() || absoluteDays() === 0"
          (change)="setDirection($any($event.target).value)"
        >
          <option value="after">después</option>
          <option value="before">antes</option>
        </select>
        <span>de</span>
        <select
          aria-label="Fecha de referencia"
          [value]="rule().dueReference"
          (change)="setReference($any($event.target).value)"
        >
          @for (reference of availableReferences(); track reference) {
            <option [value]="reference" [selected]="reference === rule().dueReference">
              {{ referenceLabels[reference] }}
            </option>
          }
        </select>
      </div>
      <label class="deadline-hours field">
        Ajuste en horas (opcional)
        <input
          type="number"
          step="0.5"
          [value]="hours()"
          (input)="setHours($any($event.target).valueAsNumber)"
        />
        <span class="field-hint">Positivo para más tarde, negativo para más temprano.</span>
      </label>
      <p class="deadline-summary" aria-live="polite">{{ summary() }}</p>
    </fieldset>
  `,
  styles: `
    .deadline-editor {
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
    .deadline-sentence {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
    }
    .deadline-sentence input,
    .deadline-sentence select {
      min-height: 40px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--surface);
      font: inherit;
    }
    .deadline-days {
      width: 5.5em;
    }
    .deadline-hours {
      max-width: 260px;
    }
    .deadline-summary {
      margin: 0;
      color: var(--muted);
      font-size: 0.8125rem;
    }
  `,
})
export class DeadlineRuleEditor {
  readonly rule = model.required<DeadlineRule>();
  readonly dayKind = input<DeadlineDayKind>('BUSINESS');
  readonly references = input<readonly DueReference[]>(ALL_REFERENCES);
  readonly disabled = input(false);
  readonly legend = input('Plazo');
  readonly idPrefix = input('deadline');

  protected readonly maxDays = MAX_OFFSET_DAYS;
  protected readonly referenceLabels = DUE_REFERENCE_SHORT_LABELS;
  protected readonly dayUnit = dayUnit;

  protected readonly absoluteDays = computed(() => Math.abs(this.rule().dueOffsetDays));
  protected readonly direction = computed<Direction>(() =>
    this.rule().dueOffsetDays < 0 ? 'before' : 'after',
  );
  protected readonly isActivation = computed(
    () => this.rule().dueReference === 'TASK_ACTIVATED_AT',
  );
  protected readonly hours = computed(() => this.rule().dueOffsetMinutes / MINUTES_PER_HOUR);
  protected readonly summary = computed(() => describeDeadline(this.rule(), this.dayKind()));
  // Conserva la referencia actual aunque el catálogo no la incluya.
  protected readonly availableReferences = computed(() => {
    const current = this.rule().dueReference;
    const listed = this.references();
    return listed.includes(current) ? listed : [current, ...listed];
  });

  protected setDays(value: number): void {
    if (!Number.isFinite(value)) return;
    const days = Math.min(Math.max(Math.trunc(Math.abs(value)), 0), MAX_OFFSET_DAYS);
    this.update({ dueOffsetDays: this.direction() === 'before' ? -days : days });
  }

  protected setDirection(direction: Direction): void {
    const days = this.absoluteDays();
    this.update({ dueOffsetDays: direction === 'before' ? -days : days });
  }

  protected setReference(reference: DueReference): void {
    // «Antes de que se active» no tiene sentido: la activación solo admite «después».
    const days =
      reference === 'TASK_ACTIVATED_AT' ? this.absoluteDays() : this.rule().dueOffsetDays;
    this.update({ dueReference: reference, dueOffsetDays: days });
  }

  protected setHours(value: number): void {
    this.update({
      dueOffsetMinutes: Number.isFinite(value) ? Math.round(value * MINUTES_PER_HOUR) : 0,
    });
  }

  private update(changes: Partial<DeadlineRule>): void {
    this.rule.set({ ...this.rule(), ...changes });
  }
}
