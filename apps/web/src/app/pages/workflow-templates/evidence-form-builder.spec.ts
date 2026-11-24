import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { EvidenceForm } from '../../core/workflow/workflow.model';
import { EvidenceFormBuilder, parseOptions, toFieldName } from './evidence-form-builder';

describe('toFieldName', () => {
  it('genera un nombre de dato único a partir de la etiqueta', () => {
    expect(toFieldName('N° de Vale Vista', [])).toBe('nDeValeVista');
    expect(toFieldName('Fecha', ['fecha'])).toBe('fecha2');
    expect(toFieldName('2 firmas', [])).toBe('campo2Firmas');
  });
});

describe('parseOptions', () => {
  it('conserva el valor de las opciones existentes', () => {
    expect(
      parseOptions('Adjudicado\nNueva opción\n', [{ value: 'AWARDED', label: 'Adjudicado' }]),
    ).toEqual([
      { value: 'AWARDED', label: 'Adjudicado' },
      { value: 'NUEVA_OPCION', label: 'Nueva opción' },
    ]);
  });
});

@Component({
  imports: [EvidenceFormBuilder],
  template: `<app-evidence-form-builder [(form)]="form" />`,
})
class HostComponent {
  readonly form = signal<EvidenceForm | null>(null);
}

describe('EvidenceFormBuilder', () => {
  it('agrega, cambia a lista y quita campos', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    const element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    const button = (text: string) =>
      Array.from(element.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(text),
      );

    button('+ Agregar campo')?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.form()).toEqual({
      fields: [{ name: 'campo1', label: 'Campo 1', type: 'TEXT', isRequired: true }],
    });

    const typeSelect = element.querySelector('select');
    if (!typeSelect) throw new Error('Falta el selector de tipo');
    typeSelect.value = 'CHOICE';
    typeSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.form()?.fields[0]?.options).toEqual([
      { value: 'OPCION_1', label: 'Opción 1' },
    ]);

    button('Quitar campo')?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.form()).toBeNull();
  });
});
