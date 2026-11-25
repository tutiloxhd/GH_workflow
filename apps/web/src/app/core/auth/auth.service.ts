import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { RoleCode, User, UserEnvelope } from '../users/user.model';

const UNAUTHORIZED_STATUS = 401;

// Estado de la sesión en el navegador. Es solo para la interfaz: el backend autoriza cada acción
// y la sesión vive en una cookie HttpOnly que este código no puede leer.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly user = signal<User | null>(null);

  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);

  hasRole(role: RoleCode): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const { user } = await firstValueFrom(this.http.get<UserEnvelope>('/api/auth/me'));
      this.user.set(user);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === UNAUTHORIZED_STATUS) {
        this.user.set(null);
        return;
      }
      throw error;
    }
  }

  async logIn(email: string, password: string): Promise<User> {
    const { user } = await firstValueFrom(
      this.http.post<UserEnvelope>('/api/auth/login', { email, password }),
    );
    this.user.set(user);
    return user;
  }

  async logOut(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', null));
    } finally {
      this.user.set(null);
    }
  }

  async updateProfile(profile: { readonly name: string; readonly email: string }): Promise<User> {
    const { user } = await firstValueFrom(this.http.put<UserEnvelope>('/api/auth/me', profile));
    this.user.set(user);
    return user;
  }

  // La API rechazó la sesión (venció o fue revocada): se olvida el usuario local.
  forgetSession(): void {
    this.user.set(null);
  }
}
