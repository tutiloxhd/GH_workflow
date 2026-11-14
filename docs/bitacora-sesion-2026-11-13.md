# Bitácora de sesión — 13 nov 2026

Registro de lo hecho en la sesión de trabajo con Claude Code sobre el MVP «Workflow de Remates». Todo quedó **sin commit**: no se crearon ramas, commits ni tags, ni se hizo push.

## Antecedentes (sesiones anteriores)

| Sprint | Resultado |
| --- | --- |
| 0. Fundaciones | ADRs, estructura `apps/api` (Express 5 + TypeScript) y `apps/web` (Angular 22), migración inicial, seed de roles, esqueleto OpenAPI. |
| 1. Identidad | Login/logout, sesiones de 8 h fijas, bloqueo por fuerza bruta en base, roles y autorización; solo un admin crea cuentas. |
| 2. Motor | Plantilla de 15 tareas manuales, inicio idempotente, dependencias, responsables y suplentes, plazos de 3 días editables, suspender/reanudar/cancelar, historial (ADR 0006). |
| 3. Pantallas de trabajo | Inicio, Mis tareas, modal de tarea con evidencia básica, detalle del workflow; se eliminó el porcentaje de avance (migración 0003, plantilla v2). |

Decisiones vigentes: librerías mysql2, Drizzle, bcrypt, Vitest y Zod; sin Docker (MySQL local); tareas automáticas tratadas como manuales.

## Esta sesión: Sprint 4 — Sincronización con `admin_new`

Autorización del usuario: «continua, tienes autorizacion para todo». Las prohibiciones de Git de `CLAUDE.md` se mantuvieron. `admin_new` (copia local) solo se leyó, en sesión `READ ONLY`.

### 1. Análisis de la copia local de `admin_new`

- 77 propiedades aceptadas (`id_clasif = 7`) de 13 452.
- `r1`, `r3`, `r4`, `r5`: fechas `AAAA-MM-DD`; `r2`: monto con puntos de miles (`8.100.000`).
- `hora_remate`: casi siempre `HH:MM`; también `9:00`, `11.30`, 6 vacíos y 1 nulo.
- Una sola propiedad con filas duplicadas en `dato_propiedad` (id_p 10743), ambas con la misma fecha.
- Casi todos los remates ya ocurrieron; solo uno es el 13 nov 2026.
- Los ids de las tablas hijas son TEXT: una consulta con JOIN TEXT/INT tardó más de 120 s y se reescribió comparando ids como texto (`IN ('123', …)`).

### 2. Base de datos

- Esquema Drizzle (`admin-new-sync.schema.ts`):
  - Tabla nueva `sync_issues` (avisos por ejecución: severidad WARNING/ERROR, código, mensaje).
  - `sync_executions.workflows_started`.
  - `property_source_changes.processed_by` (quién revisó el cambio).
- Migración `sql/migrations/0004_sync_issues.sql`, aplicada en `workflow` y en la base de pruebas.

### 3. Backend (`apps/api`)

**Configuración**
- Variables opcionales `ADMIN_NEW_DB_HOST/PORT/USER/PASSWORD` (si faltan, usan las `DB_*`) y `SYNC_INTERVAL_SECONDS` (60 por defecto, entre 10 y 3600). Documentadas en `.env.example`.
- `due-date.ts` exporta `businessLocalToInstant` y `businessDayKey` (calendario de Santiago).

**Módulo nuevo `src/modules/admin-new-sync/`**
- `domain/source-property.ts`: tipos, parsers de fecha, hora (`:` o `.`) y monto CLP; normalización a un snapshot con avisos y hash SHA-256 de los valores de origen.
- `persistence/admin-new-source.ts`: adaptador de solo lectura (pool de 2 conexiones, `dateStrings`, sesión `READ ONLY`, lotes de 500, fila de mayor id ante duplicados).
- `persistence/sync-repository.ts`: cursor que también sirve de candado (UPDATE condicional, abandono a los 15 min), ejecuciones, avisos, propiedades y cambios de origen.
- `application/run-sync.ts`: una ejecución completa:
  - Propiedad nueva → se copia; si corresponde, se inicia su workflow.
  - Hash distinto → se aplican los datos; las fechas quedan `AUCTION_DATE_CHANGED PENDING` si el workflow está abierto.
  - Propiedad que deja de estar aceptada o desaparece → `NO_LONGER_ACCEPTED` una sola vez (`PENDING` si el workflow está abierto).
  - Propiedad aceptada de nuevo → `PROPERTY_ACCEPTED`.
  - Propiedades sintéticas (`admin_new_id` ≥ 9 000 000 000) se ignoran.
  - Estado final `COMPLETED`, `PARTIAL` (error en algún registro) o `FAILED` (no se pudo leer el origen).
- `application/sync-administration.ts` y `http/sync.router.ts`: endpoints solo para ADMIN:
  - `GET /api/sync/status`
  - `GET /api/sync/executions/:executionId/issues`
  - `GET /api/sync/changes?status&limit`
  - `POST /api/sync/changes/:changeId/review`

**Proceso separado**
- `src/entrypoints/sync.ts`: `npm run sync` (ciclo sin solapamiento) y `npm run sync -- --once`; cierre limpio con SIGINT/SIGTERM. La API no dispara sincronizaciones.

**Pruebas**
- Unitarias de normalización y parsers.
- Integración (`test/admin-new-sync.test.ts`) contra una base de origen propia `<DB_TEST_NAME>_admin_new` (`test/admin-new-source-fixture.ts`), nunca contra `admin_new`: creación, idempotencia, concurrencia, no aceptadas, remates pasados/hoy/futuros, duplicados, valores inválidos, origen caído, cambios de fecha y de datos, dejar de estar aceptada y volver, filas borradas, sintéticas, permisos y revisión.

### 4. Frontend (`apps/web`)

- `core/sync/`: modelo con textos en español, funciones `describeChange` e `isReviewable` (con pruebas) y `SyncApiService`.
- Pantalla `/sincronizacion` (solo ADMIN, entrada «Sincronización» en el menú): estado del cursor, cambios de origen con filtro Pendientes/Últimos 50 y botón «Marcar revisado», ejecuciones recientes con «Ver avisos».
- Ícono `sync` y tres mensajes de error nuevos.

### 5. Documentación

- `docs/adr/0007-sincronizacion-admin-new.md` (nuevo).
- `docs/plan-fase-1.md`: Sprint 4 terminado; decisiones provisorias en la tabla.
- `docs/modelo-datos-mvp.md`: 19 tablas, diagrama y secciones de sincronización actualizados.
- `apps/api/openapi.yaml` 0.5.0 (26 rutas).
- `apps/api/AGENTS.md` y `apps/web/AGENTS.md`.

### 6. Verificación

| Comprobación | Resultado |
| --- | --- |
| API: typecheck, lint, build | Sin errores |
| API: pruebas | 138 en 13 archivos, en verde |
| Web: pruebas | 20 en 5 archivos, en verde |
| Web: build | Sin advertencias |
| Endpoints `/api/sync/*` por el proxy | 200 |
| Revisión en el navegador | No realizada: la extensión de Chrome no se conectó |

Ejecución real contra la copia local de `admin_new`:

| | 1.ª ejecución | 2.ª ejecución |
| --- | --- | --- |
| Leídas | 77 | 77 |
| Creadas | 77 | 0 |
| Workflows iniciados | 1 (propiedad 13404, remate hoy 11:15) | 0 |
| Avisos | 8 (7 sin hora de remate, 1 filas duplicadas) | 0 |
| Duración | 0,7 s | 0,2 s |

Las otras 76 propiedades quedaron en «Propiedades sin workflow» porque su remate ya pasó.

### 7. Incidencias resueltas

- Consulta de duplicados que excedía 120 s → reescrita con GROUP BY y comparación de ids como texto.
- Migración 0004 regenerada para incluir `processed_by` (antes de aplicarse en un ambiente compartido).
- Errores de lint (aserción no nula, `no-base-to-string`, retorno `any[]`) corregidos.
- La API de desarrollo corría sin recarga y no veía las rutas nuevas → reiniciada con `npm run dev`.

## Decisiones provisorias por confirmar con negocio (ADR 0007)

1. Frecuencia de 60 s (`SYNC_INTERVAL_SECONDS`).
2. Ante filas duplicadas se usa la de mayor id y se registra un aviso.
3. No se inicia el workflow de un remate ya ocurrido; un admin puede iniciarlo a mano, y se inicia solo si la fecha pasa a ser futura.
4. Sin `hora_remate` se usa 00:00 de Santiago.
5. Un cambio de fecha con workflow abierto queda pendiente para el Sprint 5.

## Estado al cerrar

- API en `localhost:3000` con `npm run dev`; Angular en `127.0.0.1:4200`.
- El sincronizador continuo no quedó corriendo (solo se usó `--once`).
- Todo sin commit.

## Siguiente paso propuesto: Sprint 5 — Reprogramación

Aplicar los `AUCTION_DATE_CHANGED` pendientes, recalcular los vencimientos de las tareas abiertas y registrarlo en el historial. Para la prueba de punta a punta se cambiaría una fecha en la copia local de `admin_new` y se restauraría al terminar.
