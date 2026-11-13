import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { LOGIN_PATH } from './auth.guards';
import { AuthService } from './auth.service';

const UNAUTHORIZED_STATUS = 401;
// En estas rutas un 401 es una respuesta esperada que maneja quien llama.
const AUTH_ENDPOINTS_HANDLING_401 = ['/api/auth/login', '/api/auth/me'];

// Si una sesión vence mientras se usa la aplicación, se vuelve al login.
export const sessionExpiredInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const isSessionRejected =
        error instanceof HttpErrorResponse &&
        error.status === UNAUTHORIZED_STATUS &&
        !AUTH_ENDPOINTS_HANDLING_401.includes(request.url);
      if (isSessionRejected) {
        auth.forgetSession();
        void router.navigateByUrl(LOGIN_PATH);
      }
      return throwError(() => error);
    }),
  );
};
