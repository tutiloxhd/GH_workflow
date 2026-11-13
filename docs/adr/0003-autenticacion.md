# ADR 0003: Autenticación con sesiones opacas en cookie

- **Estado:** aceptado (2026-11-12); implementado en el sprint 1
- **Ámbito:** `apps/api`, `apps/web`

## Contexto

El MVP necesita inicio y cierre de sesión, roles múltiples por usuario y la posibilidad de revocar una sesión. Es una aplicación interna con un solo frontend y un solo backend.

## Decisión

- Al iniciar sesión se genera un token aleatorio opaco de 32 bytes. El navegador lo recibe en la cookie `gh_session`: `HttpOnly`, `SameSite=Lax`, `Path=/api` y `Secure` en producción.
- En `user_sessions` se guarda solo el SHA-256 del token, con `expires_at` y `revoked_at`. Cerrar sesión marca `revoked_at`.
- Las sesiones duran **8 horas fijas** (`SESSION_TTL_HOURS`, de 1 a 24); no se renuevan con el uso.
- Las contraseñas se guardan con `bcrypt` (costo 12) y deben tener **al menos 8 caracteres, una mayúscula y un número**, con un máximo de 72 bytes (límite de bcrypt). La regla vive en `modules/identity/domain/password-policy.ts`.
- **No hay registro público.** Solo un ADMIN crea cuentas y asigna roles (`user_roles.assigned_by`). El primer administrador se crea por consola con `npm run users:create-admin`.
- **Fuerza bruta:** 5 fallos en 15 minutos para un email bloquean nuevos intentos hasta que el fallo más antiguo sale de la ventana. Se guarda en `login_attempts`.
- Contraseña errónea, email inexistente y cuenta inactiva responden igual (`INVALID_CREDENTIALS`), y con email inexistente igualmente se ejecuta una comparación bcrypt, para no revelar qué cuentas existen.
- **CSRF:** toda solicitud que no sea `GET`, `HEAD` u `OPTIONS` exige el encabezado `Origin` igual a `WEB_ORIGIN`; si falta o difiere, 403 `ORIGIN_NOT_ALLOWED`. Se suma a `SameSite=Lax`.
- Desactivar un usuario revoca todas sus sesiones. Un admin no puede quitarse ADMIN ni desactivarse, y debe quedar al menos un admin activo (comprobado con bloqueo de filas).
- La autorización se verifica siempre en el backend (`requireSession`, `requireRole`). El frontend no guarda el token ni decide permisos; sus guards solo ordenan la navegación.

## Alternativas consideradas

- **JWT sin estado:** no requiere consultar la base por solicitud, pero no se puede revocar sin una lista de bloqueo, y suele terminar guardado en `localStorage`.
- **Proveedor de identidad externo (OIDC):** apropiado más adelante; es infraestructura adicional para el MVP.
- **Token CSRF sincronizado:** más robusto con navegadores antiguos; el control de `Origin` basta para navegadores actuales y no requiere estado extra.
- **`cookie-parser`:** se prefirió un lector mínimo propio porque la API maneja una sola cookie.

## Consecuencias

- Cada solicitud autenticada consulta `user_sessions` (índice único por `token_hash`).
- Clientes que no son navegador (curl, scripts) deben enviar `Origin` en operaciones de escritura.
- En desarrollo, el frontend y la API comparten origen gracias al proxy de Angular (`/api` → `localhost:3000`).
- Pendiente: cambio de contraseña propia, restablecimiento por un admin y una tabla de auditoría de identidad (hoy las acciones administrativas se registran en el log estructurado).
