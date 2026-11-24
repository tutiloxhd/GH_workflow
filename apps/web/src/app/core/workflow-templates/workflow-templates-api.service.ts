import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type {
  TemplateCatalog,
  TemplateDetail,
  TemplateSummary,
  TemplateTask,
} from './workflow-template.model';

const BASE_URL = '/api/workflow-templates';

@Injectable({ providedIn: 'root' })
export class WorkflowTemplatesApiService {
  private readonly http = inject(HttpClient);

  // Los comandos responden con el detalle actualizado de la plantilla.
  private async command(
    request: Observable<{ template: TemplateDetail }>,
  ): Promise<TemplateDetail> {
    return (await firstValueFrom(request)).template;
  }

  async list(): Promise<readonly TemplateSummary[]> {
    return (await firstValueFrom(this.http.get<{ templates: TemplateSummary[] }>(BASE_URL)))
      .templates;
  }

  catalog(): Promise<TemplateCatalog> {
    return firstValueFrom(this.http.get<TemplateCatalog>(`${BASE_URL}/catalog`));
  }

  get(templateId: number): Promise<TemplateDetail> {
    return this.command(this.http.get<{ template: TemplateDetail }>(`${BASE_URL}/${templateId}`));
  }

  createVersion(sourceTemplateId: number): Promise<TemplateDetail> {
    return this.command(
      this.http.post<{ template: TemplateDetail }>(BASE_URL, { sourceTemplateId }),
    );
  }

  createFlow(code: string, name: string): Promise<TemplateDetail> {
    return this.command(this.http.post<{ template: TemplateDetail }>(BASE_URL, { code, name }));
  }

  saveDraft(
    templateId: number,
    name: string,
    tasks: readonly TemplateTask[],
  ): Promise<TemplateDetail> {
    return this.command(
      this.http.put<{ template: TemplateDetail }>(`${BASE_URL}/${templateId}`, { name, tasks }),
    );
  }

  publish(templateId: number): Promise<TemplateDetail> {
    return this.command(
      this.http.post<{ template: TemplateDetail }>(`${BASE_URL}/${templateId}/publish`, {}),
    );
  }

  archive(templateId: number): Promise<TemplateDetail> {
    return this.command(
      this.http.post<{ template: TemplateDetail }>(`${BASE_URL}/${templateId}/archive`, {}),
    );
  }

  async deleteDraft(templateId: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${BASE_URL}/${templateId}`));
  }
}
