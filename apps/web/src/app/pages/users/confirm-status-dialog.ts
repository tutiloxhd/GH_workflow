import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import type { User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import { ModalDialog } from '../../shared/modal/modal-dialog';

// Confirma activar o desactivar una cuenta. Desactivar cierra de inmediato sus sesiones.
@Component({
  selector: 'app-confirm-status-dialog',
  imports: [ModalDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="status-title" (closed)="closed.emit()">
      <div class="modal-form">
        <h2 id="status-title">
          {{ isDeactivation() ? 'Desactivar' : 'Activar' }} a {{ user().name }}
        </h2>
        <p>
          @if (isDeactivation()) {
            La cuenta no podrá iniciar sesión y sus sesiones abiertas se cerrarán ahora.
          } @else {
            La cuenta podrá volver a iniciar sesión con su contraseña actual.
          }
        </p>

        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }

        <div class="modal-actions">
          <button type="button" class="button" (click)="modal().close()">Cancelar</button>
          <button
            type="button"
            class="button"
            [class.danger]="isDeactivation()"
            [class.primary]="!isDeactivation()"
            [disabled]="isSaving()"
            (click)="confirm()"
          >
            {{ isDeactivation() ? 'Desactivar' : 'Activar' }}
          </button>
        </div>
      </div>
    </dialog>
  `,
})
export class ConfirmStatusDialog {
  private readonly usersApi = inject(UsersApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly user = input.required<User>();
  readonly saved = output<User>();
  readonly closed = output();

  protected readonly isDeactivation = computed(() => this.user().status === 'ACTIVE');
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async confirm(): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      const { id } = this.user();
      this.saved.emit(
        await (this.isDeactivation() ? this.usersApi.deactivate(id) : this.usersApi.activate(id)),
      );
      this.modal().close();
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
