import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import type { RoleCode } from '../users/user.model';
import { adminGuard, authGuard } from './auth.guards';
import { AuthService } from './auth.service';

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

describe('guards de navegación', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function signInWithRoles(roles: RoleCode[]): Promise<void> {
    const loading = TestBed.inject(AuthService).loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      user: {
        id: 1,
        name: 'Usuario Sintético',
        email: 'usuario@example.test',
        status: 'ACTIVE',
        roles,
        createdAt: '2026-11-12T12:00:00.000Z',
      },
    });
    await loading;
  }

  const runGuard = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(route, state));

  it('sin sesión, authGuard redirige a /login', () => {
    const result = runGuard(authGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/login');
  });

  it('con sesión, authGuard deja pasar', async () => {
    await signInWithRoles(['MANAGER']);

    expect(runGuard(authGuard)).toBe(true);
  });

  it('adminGuard envía al inicio a quien no es ADMIN y deja pasar al ADMIN', async () => {
    await signInWithRoles(['MANAGER']);
    expect(String(runGuard(adminGuard))).toBe('/');

    TestBed.inject(AuthService).forgetSession();
    await signInWithRoles(['ADMIN']);
    expect(runGuard(adminGuard)).toBe(true);
  });

  it('una respuesta 401 de /api/auth/me deja la sesión vacía sin fallar', async () => {
    const loading = TestBed.inject(AuthService).loadCurrentUser();
    http
      .expectOne('/api/auth/me')
      .flush({ code: 'AUTHENTICATION_REQUIRED' }, { status: 401, statusText: 'Unauthorized' });

    await expect(loading).resolves.toBeUndefined();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });
});
