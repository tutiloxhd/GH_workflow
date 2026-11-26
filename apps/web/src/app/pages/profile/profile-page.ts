import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
import { PushService } from '../../core/notifications/push.service';
import { ROLE_LABELS } from '../../core/users/user.model';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  protected readonly push = inject(PushService);
  protected readonly isChangingPush = signal(false);
  protected readonly pushMessage = signal<string | null>(null);
  protected readonly user = this.auth.currentUser;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.user()?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    email: [this.user()?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(190)]],
  });

  constructor() {
    void this.push.refresh().catch(() => {
      this.pushMessage.set('No se pudo consultar el estado de las notificaciones del dispositivo.');
    });
  }

  protected async togglePush(): Promise<void> {
    this.isChangingPush.set(true);
    this.pushMessage.set(null);
    try {
      if (this.push.isSubscribed()) {
        await this.push.unsubscribe();
        this.pushMessage.set('Notificaciones del dispositivo desactivadas.');
      } else {
        await this.push.subscribe();
        this.pushMessage.set('Notificaciones del dispositivo activadas.');
      }
    } catch (error) {
      const problem = toApiProblem(error);
      this.pushMessage.set(
        problem.code === 'NETWORK_FAILURE' && problem.status === 0
          ? 'No se pudo activar push. Revisa el permiso del navegador y la conexión del dispositivo.'
          : problemMessage(problem),
      );
    } finally {
      this.isChangingPush.set(false);
    }
  }

  protected async save(): Promise<void> {
    this.saved.set(false);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    try {
      const user = await this.auth.updateProfile(this.form.getRawValue());
      this.form.patchValue({ name: user.name, email: user.email });
      this.form.markAsPristine();
      this.saved.set(true);
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
    } finally {
      this.isSaving.set(false);
    }
  }
}
