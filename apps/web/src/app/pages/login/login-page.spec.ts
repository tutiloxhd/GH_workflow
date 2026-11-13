import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(LoginPage);
    http = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
  });

  function fill(email: string, password: string): void {
    const [emailInput, passwordInput] = Array.from(element.querySelectorAll('input'));
    if (!emailInput || !passwordInput) throw new Error('Faltan los campos del formulario');
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('no llama a la API y marca los campos si el formulario es inválido', async () => {
    fill('no-es-email', '');
    await submit();

    http.expectNone('/api/auth/login');
    expect(element.textContent).toContain('Ingresa un email válido.');
    expect(element.textContent).toContain('Ingresa tu contraseña.');
    expect(element.querySelector('input[type="email"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('envía las credenciales y navega al inicio cuando el login es correcto', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill('gestor@example.test', 'Sintetica123');
    await submit();

    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'gestor@example.test',
      password: 'Sintetica123',
    });
    request.flush({
      user: {
        id: 7,
        name: 'Gabriel Gestor',
        email: 'gestor@example.test',
        status: 'ACTIVE',
        roles: ['MANAGER'],
        createdAt: '2026-11-12T12:00:00.000Z',
      },
    });
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/');
    });
    expect(TestBed.inject(AuthService).currentUser()?.id).toBe(7);
  });

  it('muestra el motivo en español y limpia la contraseña si la API rechaza el login', async () => {
    fill('gestor@example.test', 'Incorrecta123');
    await submit();

    http
      .expectOne('/api/auth/login')
      .flush(
        { code: 'LOGIN_TEMPORARILY_LOCKED', status: 429 },
        { status: 429, statusText: 'Too Many Requests' },
      );
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Demasiados intentos fallidos',
      );
    });
    expect(element.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
  });
});
