import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describeDeadline, type DeadlineRule } from '../../core/workflow/deadline-rule';
import { DeadlineRuleEditor } from './deadline-rule-editor';

describe('describeDeadline', () => {
  it('describe el plazo en lenguaje natural', () => {
    expect(
      describeDeadline(
        { dueReference: 'AUCTION_AT', dueOffsetDays: -3, dueOffsetMinutes: 0 },
        'BUSINESS',
      ),
    ).toBe('Vence 3 días hábiles antes de la fecha del remate');
    expect(
      describeDeadline(
        { dueReference: 'GUARANTEE_PAYMENT_AT', dueOffsetDays: 1, dueOffsetMinutes: 90 },
        'CALENDAR',
      ),
    ).toBe('Vence 1 día corrido después del pago de la garantía, más 1,5 h');
    expect(
      describeDeadline(
        { dueReference: 'TASK_ACTIVATED_AT', dueOffsetDays: 0, dueOffsetMinutes: 0 },
        'BUSINESS',
      ),
    ).toBe('Vence el mismo día en que se activa la tarea');
  });
});

@Component({
  imports: [DeadlineRuleEditor],
  template: `<app-deadline-rule-editor [(rule)]="rule" dayKind="BUSINESS" />`,
})
class HostComponent {
  readonly rule = signal<DeadlineRule>({
    dueReference: 'AUCTION_AT',
    dueOffsetDays: 2,
    dueOffsetMinutes: 0,
  });
}

describe('DeadlineRuleEditor', () => {
  it('cambia la dirección sin números negativos y fuerza «después» para la activación', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    const element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    const [direction, reference] = Array.from(element.querySelectorAll('select'));
    if (!direction || !reference) throw new Error('Faltan los selectores del plazo');

    direction.value = 'before';
    direction.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.rule().dueOffsetDays).toBe(-2);
    expect(element.textContent).toContain('Vence 2 días hábiles antes de la fecha del remate');

    reference.value = 'TASK_ACTIVATED_AT';
    reference.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.rule()).toEqual({
      dueReference: 'TASK_ACTIVATED_AT',
      dueOffsetDays: 2,
      dueOffsetMinutes: 0,
    });
    expect(direction.disabled).toBe(true);
  });
});
