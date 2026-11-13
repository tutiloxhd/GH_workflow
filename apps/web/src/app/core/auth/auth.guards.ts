import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const LOGIN_PATH = '/login';

// Los guards solo ordenan la navegación; la autorización real ocurre en la API.
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || inject(Router).parseUrl(LOGIN_PATH);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.isAuthenticated() || inject(Router).parseUrl('/');
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.hasRole('ADMIN') || inject(Router).parseUrl('/');
};
