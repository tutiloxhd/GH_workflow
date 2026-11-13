# ADR 0001: Acceso a datos con Drizzle sobre mysql2

- **Estado:** aceptado (2026-11-12)
- **Ámbito:** `apps/api`

## Contexto

El backend es Express + TypeScript sobre MySQL 8. El motor del workflow necesita transacciones, bloqueo de filas (`FOR UPDATE`) y control fino del SQL, y AGENTS.md exige migraciones versionadas en SQL revisable dentro de `sql/`.

## Decisión

- Driver `mysql2` (pool de promesas) y `drizzle-orm` como constructor de consultas tipado.
- El esquema TypeScript en `apps/api/src/platform/database/schema/*.schema.ts` es la fuente del modelo de datos.
- `drizzle-kit generate` produce las migraciones en `sql/migrations/`; se revisan como cualquier otro cambio y se aplican con `npm run db:migrate` (migrador de Drizzle, que registra lo aplicado en `__drizzle_migrations`).
- Los seeds son archivos SQL idempotentes en `sql/seeds/`.
- Todas las fechas son `DATETIME(6)` en UTC; cada conexión fija `time_zone = '+00:00'`.
- Las claves foráneas, índices y restricciones llevan nombre explícito (`fk_`, `idx_`, `uq_`, `chk_`) para no superar el límite de 64 caracteres de MySQL y poder referirlas en errores.
- `updated_at` lo renueva la aplicación en cada `UPDATE` hecho con Drizzle.

## Alternativas consideradas

- **`mysql2` directo, sin capa de consultas:** mínimo de dependencias, pero sin tipos en los resultados y con las migraciones escritas a mano.
- **Kysely:** constructor de consultas tipado equivalente; no genera migraciones desde el esquema.
- **Prisma / Sequelize:** ORM completos; ocultan más el SQL y dificultan el bloqueo de filas y las consultas del motor.

## Consecuencias

- El modelo se define una sola vez y los tipos de las consultas se derivan de él.
- La carpeta `sql/migrations/meta/` (snapshots de Drizzle) se versiona junto con el SQL.
- Las tablas heredan juego de caracteres y motor de la base: debe crearse con `utf8mb4` / `utf8mb4_unicode_ci`.
- Un `UPDATE` hecho fuera de Drizzle (SQL manual) no renueva `updated_at`.
- `sql/schema.sql` queda como referencia del modelo completo futuro; no se aplica a ninguna base.
