# AGENTS.md — apps/api (backend Express)

Complementa el [AGENTS.md raíz](../../AGENTS.md); no reduce ninguna de sus restricciones.

## Librerías aprobadas

| Uso           | Librería                                                          |
| ------------- | ----------------------------------------------------------------- |
| HTTP          | `express` 5                                                       |
| Base de datos | `mysql2` + `drizzle-orm` (migraciones con `drizzle-kit`)          |
| Validación    | `zod`                                                             |
| Contraseñas   | `bcrypt` (aprobada; se instala en el Sprint 1)                    |
| Pruebas       | `vitest`                                                          |
| Calidad       | `typescript` 6, `eslint` + `typescript-eslint`, `prettier`, `tsx` |

Cualquier otra dependencia requiere aprobación explícita. Las decisiones están en [docs/adr/](../../docs/adr/).

## Estructura

```text
src/
  config/        variables de entorno validadas al iniciar
  platform/      capacidades técnicas compartidas: database (pool, esquema Drizzle, migrador), http, logging
  modules/       una carpeta por capacidad de negocio
    <módulo>/    http/ · application/ · domain/ · persistence/ (solo las capas que el módulo necesite)
  entrypoints/   un archivo por proceso: api.ts, migrate.ts, sync.ts (sincronizador), create-admin.ts
test/            pruebas de integración (HTTP y base de datos)
```

- Las pruebas unitarias viven junto al código (`*.test.ts`); las de integración en `test/`.
- Routers y controllers no contienen reglas de negocio ni SQL; los casos de uso no dependen de Express.
- El esquema Drizzle (`src/platform/database/schema/*.schema.ts`) es la fuente del modelo de datos.
- Los imports relativos llevan extensión `.js` (ESM con `NodeNext`).

## Base de datos

- Configuración en `.env` (ver `.env.example`); `.env` nunca se versiona.
- `DB_NAME` es la base de desarrollo y `DB_TEST_NAME` la de pruebas; deben ser distintas entre sí y de `ADMIN_NEW_DB_NAME`.
- Las bases se crean con `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`.
- `sql/workflow_mvp.sql` es una foto de la base del MVP (estructura, migraciones 0000–0004 registradas, roles, plantillas y usuarios de desarrollo) para levantar una base nueva sin correr migraciones ni seeds; guía en [LEVANTAR-PROYECTO.md](../../LEVANTAR-PROYECTO.md). Borra y recrea las tablas: solo en una base vacía y solo en desarrollo. Tras un cambio de esquema se regenera con `mysqldump`; la fuente de verdad sigue siendo el esquema Drizzle y `sql/migrations/`. `sql/schema.sql` es el modelo completo futuro y no se aplica.
- Cambios de esquema: editar el esquema Drizzle → `npm run db:generate -- --name <descripcion>` → revisar el SQL generado en `sql/migrations/` → `npm run db:migrate`. No se edita una migración ya aplicada en un ambiente compartido.
- Los seeds son SQL idempotente en `sql/seeds/`. Las plantillas publicadas son inmutables: v1 (`0002`), v2 (`0004`) y v3 lineal (`0006`, activa). En una instalación nueva, `0005_notification_rules` se ejecuta después de crear todas las plantillas. `0003_dev_synthetic_properties` es solo para desarrollo.
- Cuidado con `INSERT IGNORE`: convierte errores en advertencias (por ejemplo, un número negativo en una columna `UNSIGNED` se guarda como 0). Cada seed termina con una consulta de verificación; revisar su resultado.
- Las propiedades sintéticas usan `admin_new_id` desde 9000000001, por encima del máximo de `INT`, para no coincidir nunca con un id real de `admin_new`.
- `admin_new` es un sistema externo: la aplicación solo lo lee, detrás de un adaptador (`modules/admin-new-sync/persistence/admin-new-source.ts`, sesión `READ ONLY`). Reglas de la sincronización: [ADR 0007](../../docs/adr/0007-sincronizacion-admin-new.md).
- En `admin_new` los ids de las tablas hijas son TEXT: se comparan con listas de texto (`IN ('123', …)`); un JOIN de TEXT contra INT recorre la tabla completa y tarda minutos.
- Las pruebas del sincronizador usan una base de origen propia, `<DB_TEST_NAME>_admin_new`, con una réplica mínima de las tres tablas (`test/admin-new-source-fixture.ts`); nunca leen `admin_new`.
- Las fechas se guardan en UTC (`DATETIME(6)`); la sesión MySQL se fija en `+00:00`.

## Comandos de verificación

Ejecutar desde `apps/api` antes de dar un cambio por terminado:

```bash
npm run typecheck
npm run lint
npm test          # requiere MySQL local y la base DB_TEST_NAME creada
npm run build
```

Otros: `npm run dev` (API con recarga), `npm run sync` (sincronizador cada `SYNC_INTERVAL_SECONDS`; `-- --once` para una sola ejecución), `npm run format`, `npm run db:generate`, `npm run db:migrate`.

Primer administrador (la contraseña va solo en la variable de esa ejecución):

```bash
ADMIN_INITIAL_PASSWORD='<contraseña>' npm run users:create-admin -- --email <email> --name "<nombre>"
```

## Convenciones del módulo de identidad (referencia para los demás)

- Los casos de uso devuelven `Result` (`src/platform/result.ts`) para fallos esperados; las excepciones quedan para lo inesperado.
- Cada router valida con un esquema Zod `strictObject` y responde `sendValidationProblem` si falla.
- Los códigos de error de un módulo viven en un mapa `*_PROBLEMS` dentro de su carpeta `http/`.
- La hora siempre viene de `Clock` (`src/platform/clock/clock.ts`), nunca de `new Date()` en reglas.
- Las pruebas de integración usan `test/identity-test-harness.ts`: base `DB_TEST_NAME`, reloj fijo y bcrypt de costo 4.
