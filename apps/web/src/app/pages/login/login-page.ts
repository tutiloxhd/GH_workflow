import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { problemMessage, toApiProblem } from '../../core/api/api-problem';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly errorBox = viewChild<ElementRef<HTMLElement>>('errorBox');

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly wasSubmitted = signal(false);

  protected showsError(control: 'email' | 'password'): boolean {
    return this.wasSubmitted() && this.form.controls[control].invalid;
  }

  protected async submit(): Promise<void> {
    this.wasSubmitted.set(true);
    this.errorMessage.set(null);
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.logIn(email, password);
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.errorMessage.set(problemMessage(toApiProblem(error)));
      this.form.controls.password.reset();
      // El mensaje recibe el foco para que los lectores de pantalla lo anuncien.
      queueMicrotask(() => this.errorBox()?.nativeElement.focus());
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
