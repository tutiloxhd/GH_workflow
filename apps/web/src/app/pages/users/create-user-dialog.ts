import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { ROLE_CODES, ROLE_LABELS, type RoleCode, type User } from '../../core/users/user.model';
import { UsersApiService } from '../../core/users/users-api.service';
import { ModalDialog } from '../../shared/modal/modal-dialog';

// Textos de la política aprobada; la API es quien la valida.
const PASSWORD_VIOLATION_LABELS: Readonly<Record<string, string>> = {
  TOO_SHORT: 'al menos 8 caracteres',
  TOO_LONG: 'como máximo 72 bytes',
  MISSING_UPPERCASE: 'una mayúscula',
  MISSING_DIGIT: 'un número',
};

@Component({
  selector: 'app-create-user-dialog',
  imports: [ReactiveFormsModule, ModalDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog appModalDialog aria-labelledby="create-user-title" (closed)="closed.emit()">
      <form class="modal-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h2 id="create-user-title">Nuevo usuario</h2>

        @if (errorMessage(); as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }

        <label class="field">
          Nombre
          <input
            formControlName="name"
            autocomplete="off"
            [attr.aria-invalid]="showsError('name')"
          />
          @if (showsError('name')) {
            <span class="field-error">Ingresa el nombre.</span>
          }
        </label>

        <label class="field">
          Email
          <input
            type="email"
            formControlName="email"
            autocomplete="off"
            [attr.aria-invalid]="showsError('email')"
          />
          @if (showsError('email')) {
            <span class="field-error">Ingresa un email válido.</span>
          }
        </label>

        <label class="field">
          Contraseña inicial
          <input
            type="password"
            formControlName="password"
            autocomplete="new-password"
            aria-describedby="password-hint"
            [attr.aria-invalid]="showsError('password')"
          />
          <span id="password-hint" class="field-hint">
            Mínimo 8 caracteres, con al menos una mayúscula y un número.
          </span>
        </label>

        <fieldset class="checkbox-list">
          <legend>Roles</legend>
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
          <button type="submit" class="button primary" [disabled]="isSubmitting()">
            {{ isSubmitting() ? 'Creando…' : 'Crear usuario' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class CreateUserDialog {
  private readonly usersApi = inject(UsersApiService);
  protected readonly modal = viewChild.required(ModalDialog);

  readonly created = output<User>();
  readonly closed = output();

  protected readonly roleCodes = ROLE_CODES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(190)]],
    password: ['', Validators.required],
  });
  protected readonly selectedRoles = signal<readonly RoleCode[]>([]);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  private readonly wasSubmitted = signal(false);

  protected showsError(control: 'name' | 'email' | 'password'): boolean {
    return this.wasSubmitted() && this.form.controls[control].invalid;
  }

  protected toggleRole(role: RoleCode): void {
    this.selectedRoles.update((roles) =>
      roles.includes(role) ? roles.filter((selected) => selected !== role) : [...roles, role],
    );
  }

  protected async submit(): Promise<void> {
    this.wasSubmitted.set(true);
    this.errorMessage.set(null);
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    try {
      const user = await this.usersApi.create({
        ...this.form.getRawValue(),
        roles: this.selectedRoles(),
      });
      this.created.emit(user);
      this.modal().close();
    } catch (error) {
      const problem = toApiProblem(error);
      const missing = problem.violations?.map((violation) => PASSWORD_VIOLATION_LABELS[violation]);
      this.errorMessage.set(
        missing?.length ? `La contraseña necesita ${missing.join(', ')}.` : problemMessage(problem),
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
