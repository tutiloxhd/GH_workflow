import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import type { WorkflowDetail, WorkflowTask } from '../../core/workflow/workflow.model';
import { TaskDialog } from './task-dialog';

const MANAGER_ID = 7;

const collectValeVista: WorkflowTask = {
  id: 31,
  code: 'COLLECT_VALE_VISTA',
  name: 'Retirar Vale Vista',
  description: 'Retirar el Vale Vista en el banco.',
  responsibleRole: 'MANAGER',
  displayOrder: 8,
  status: 'READY',
  assignee: { id: MANAGER_ID, name: 'Gestor Sintético' },
  backup: null,
  dependsOn: ['SEND_LETTER_TO_BANK'],
  deadline: { dueReference: 'TASK_ACTIVATED_AT', dueOffsetDays: 3, dueOffsetMinutes: 0 },
  dueAt: '2026-11-15T12:00:00.000Z',
  isOverdue: false,
  activatedAt: '2026-11-12T12:00:00.000Z',
  completedAt: null,
  requiresEvidence: true,
  evidenceForm: {
    fields: [
      { name: 'bank', label: 'Banco', type: 'TEXT', isRequired: true },
      { name: 'valeVistaNumber', label: 'N° de Vale Vista', type: 'TEXT', isRequired: true },
      { name: 'amountClp', label: 'Monto (pesos)', type: 'AMOUNT_CLP', isRequired: true },
    ],
  },
  evidence: null,
};

const workflowWith = (task: WorkflowTask): WorkflowDetail => ({
  id: 5,
  status: 'ACTIVE',
  propertyId: 10,
  property: {
    title: 'Casa Sintética',
    address: null,
    commune: 'Ñuñoa',
    caseReference: null,
    tribunal: null,
  },
  auctionAt: '2026-12-07T13:00:00.000Z',
  participants: [],
  tasks: [task],
});

describe('TaskDialog', () => {
  let fixture: ComponentFixture<TaskDialog>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    // jsdom no implementa <dialog>.showModal.
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();

    TestBed.configureTestingModule({
      imports: [TaskDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);

    const loading = TestBed.inject(AuthService).loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      user: {
        id: MANAGER_ID,
        name: 'Gestor Sintético',
        email: 'gestor@example.test',
        status: 'ACTIVE',
        roles: ['MANAGER'],
        createdAt: '2026-11-12T12:00:00.000Z',
      },
    });
    await loading;

    fixture = TestBed.createComponent(TaskDialog);
    fixture.componentRef.setInput('workflowId', 5);
    fixture.componentRef.setInput('taskId', collectValeVista.id);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/workflows/5').flush({ workflow: workflowWith(collectValeVista) });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('app-evidence-form')).not.toBeNull();
    });
  });

  afterEach(() => {
    http.verify();
  });

  const button = (text: string) =>
    Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );

  function fillEvidence(values: Record<string, string>): void {
    const inputs = Array.from(
      element.querySelectorAll<HTMLInputElement>('app-evidence-form input'),
    );
    Object.values(values).forEach((value, index) => {
      const input = inputs[index];
      if (!input) throw new Error('Falta un campo del formulario de evidencia');
      input.value = value;
      input.dispatchEvent(new Event('input'));
    });
  }

  it('dibuja el formulario de la API y no permite completar sin evidencia', () => {
    expect(element.querySelectorAll('app-evidence-form input')).toHaveLength(3);
    expect(button('Completar')?.disabled).toBe(true);
    expect(element.textContent).toContain('primero guarda su evidencia');
  });

  it('valida en el navegador antes de enviar y manda los montos como número', async () => {
    fillEvidence({ bank: 'Banco Sintético', valeVistaNumber: '', amountClp: '12.5' });
    element.querySelector('app-evidence-form form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    http.expectNone('/api/tasks/31/evidence');
    expect(element.textContent).toContain('Este campo es obligatorio.');

    fillEvidence({ bank: 'Banco Sintético', valeVistaNumber: 'VV-1', amountClp: '4200000' });
    element.querySelector('app-evidence-form form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const request = http.expectOne('/api/tasks/31/evidence');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      formData: { bank: 'Banco Sintético', valeVistaNumber: 'VV-1', amountClp: 4200000 },
    });
    request.flush({
      workflow: workflowWith({
        ...collectValeVista,
        evidence: {
          formData: request.request.body.formData,
          updatedAt: '2026-11-12T13:00:00.000Z',
        },
      }),
    });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(button('Completar')?.disabled).toBe(false);
    });
  });

  it('completar pide confirmación antes de llamar a la API', async () => {
    fixture.componentRef.setInput('taskId', collectValeVista.id);
    // Con evidencia guardada el botón queda disponible.
    (
      fixture.componentInstance as unknown as { workflow: { set(value: WorkflowDetail): void } }
    ).workflow.set(
      workflowWith({
        ...collectValeVista,
        evidence: { formData: { bank: 'B' }, updatedAt: '2026-11-12T13:00:00.000Z' },
      }),
    );
    await fixture.whenStable();

    button('Completar')?.click();
    await fixture.whenStable();
    http.expectNone('/api/tasks/31/complete');

    button('Confirmar: completar')?.click();
    http.expectOne('/api/tasks/31/complete').flush({
      workflow: workflowWith({ ...collectValeVista, status: 'COMPLETED' }),
    });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.textContent).toContain('Tarea completada.');
    });
  });
});
