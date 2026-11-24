import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  TemplateCatalog,
  TemplateDetail,
  TemplateTask,
} from '../../core/workflow-templates/workflow-template.model';
import { toCode } from './template-code';
import { TemplateEditorPage } from './template-editor-page';

const CATALOG: TemplateCatalog = {
  roles: ['ADMIN', 'MANAGER', 'BIDDER', 'LEGAL_REVIEWER'],
  dueReferences: ['TASK_ACTIVATED_AT', 'AUCTION_AT'] as TemplateCatalog['dueReferences'],
  evidenceFormTaskCodes: ['COLLECT_VALE_VISTA'],
  participantAssignmentTaskCode: 'ASSIGN_MANAGER_AND_BIDDER',
};

const task = (code: string, dependsOn: string[] = []): TemplateTask => ({
  code,
  name: `Tarea ${code}`,
  description: null,
  responsibleRole: 'ADMIN',
  requiresEvidence: false,
  dueReference: 'TASK_ACTIVATED_AT',
  dueOffsetDays: 3,
  dueOffsetMinutes: 0,
  dependsOn,
});

const templateWith = (overrides: Partial<TemplateDetail>): TemplateDetail => ({
  id: 9,
  code: 'REMATE_JUDICIAL',
  name: 'Remate judicial',
  version: 3,
  status: 'DRAFT',
  isActive: false,
  taskCount: 2,
  workflowCount: 0,
  createdAt: '2026-11-20T12:00:00.000Z',
  createdBy: null,
  publishedAt: null,
  publishedBy: null,
  archivedAt: null,
  tasks: [task('FIRST'), task('SECOND', ['FIRST'])],
  ...overrides,
});

describe('TemplateEditorPage', () => {
  let fixture: ComponentFixture<TemplateEditorPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  const button = (text: string) =>
    Array.from(element.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(text),
    );

  async function open(template: TemplateDetail): Promise<void> {
    TestBed.configureTestingModule({
      imports: [TemplateEditorPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TemplateEditorPage);
    fixture.componentRef.setInput('templateId', template.id);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne(`/api/workflow-templates/${template.id}`).flush({ template });
    http.expectOne('/api/workflow-templates/catalog').flush(CATALOG);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('.task-list')).not.toBeNull();
    });
  }

  afterEach(() => {
    http.verify();
  });

  it('muestra una versión publicada en modo lectura con opción de crear nueva versión', async () => {
    await open(templateWith({ status: 'PUBLISHED', isActive: true }));

    expect(element.querySelector<HTMLFieldSetElement>('fieldset.editor')?.disabled).toBe(true);
    expect(button('Guardar borrador')).toBeUndefined();
    expect(button('Crear nueva versión')).toBeDefined();
    expect(element.textContent).toContain('después de Tarea FIRST');
  });

  it('agrega una tarea dependiente de la última y guarda el borrador completo', async () => {
    await open(templateWith({}));
    expect(button('Guardar borrador')?.disabled).toBe(true);

    button('+ Agregar tarea')?.click();
    await fixture.whenStable();
    const inputs = element.querySelectorAll<HTMLInputElement>('.task-item:last-child input');
    const [nameInput, codeInput] = Array.from(inputs);
    if (!nameInput || !codeInput) throw new Error('Faltan los campos de la tarea nueva');
    nameInput.value = 'Cerrar expediente';
    nameInput.dispatchEvent(new Event('input'));
    codeInput.value = 'cerrar expediente';
    codeInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    button('Guardar borrador')?.click();
    const request = http.expectOne('/api/workflow-templates/9');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.tasks.at(-1)).toEqual({
      ...task('CERRAR_EXPEDIENTE', ['SECOND']),
      name: 'Cerrar expediente',
    });
    request.flush({ template: templateWith({ tasks: request.request.body.tasks }) });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.textContent).toContain('Borrador guardado.');
    });
  });

  it('muestra los problemas de estructura que informa la API al publicar', async () => {
    await open(templateWith({ tasks: [] }));

    button('Publicar')?.click();
    await fixture.whenStable();
    button('Confirmar: publicar y activar')?.click();
    http
      .expectOne('/api/workflow-templates/9/publish')
      .flush(
        { code: 'INVALID_TEMPLATE', issues: [{ kind: 'NO_TASKS' }] },
        { status: 400, statusText: 'Bad Request' },
      );
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.textContent).toContain('al menos una tarea para publicarse');
    });
  });
});

describe('toCode', () => {
  it('convierte texto libre al formato de código', () => {
    expect(toCode('Revisión legal final')).toBe('REVISION_LEGAL_FINAL');
    expect(toCode('1 paso')).toBe('PASO');
    expect(toCode('a'.repeat(80))).toHaveLength(50);
  });
});
