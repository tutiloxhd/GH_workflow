import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { ROLE_CODES, ROLE_LABELS, type RoleCode, type User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import { ModalDialog } from '../../shared/modal/modal-dialog';

@Component({
  selector: 'app-edit-roles-dialog',
  imports: [ModalDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="edit-roles-title" (closed)="closed.emit()">
      <form class="modal-form" (submit)="$event.preventDefault(); save()">
        <h2 id="edit-roles-title">Roles de {{ user().name }}</h2>

        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }

        <fieldset class="checkbox-list">
          <legend>Roles asignados</legend>
          @for (role of roleCodes; track role) {
            <label>
              <input
                type="checkbox"
                [checked]="selectedRoles().includes(role)"
                (change)="toggleRole(role)"
              />
              {{ roleLabels[role] }}
            </label>
          }
        </fieldset>

        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Cancelar</button>
          <button type="submit" class="button primary" [disabled]="isSaving()">
            {{ isSaving() ? 'Guardando…' : 'Guardar roles' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class EditRolesDialog implements OnInit {
  private readonly usersApi = inject(UsersApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly user = input.required<User>();
  readonly saved = output<User>();
  readonly closed = output();

  protected readonly roleCodes = ROLE_CODES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly selectedRoles = signal<readonly RoleCode[]>([]);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.selectedRoles.set(this.user().roles);
  }

  protected toggleRole(role: RoleCode): void {
    this.selectedRoles.update((roles) =>
      roles.includes(role) ? roles.filter((selected) => selected !== role) : [...roles, role],
    );
  }

  protected async save(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      this.saved.emit(await this.usersApi.replaceRoles(this.user().id, this.selectedRoles()));
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
