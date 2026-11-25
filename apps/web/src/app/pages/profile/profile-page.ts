import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';
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
  protected readonly user = this.auth.currentUser;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.user()?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    email: [this.user()?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(190)]],
  });

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
