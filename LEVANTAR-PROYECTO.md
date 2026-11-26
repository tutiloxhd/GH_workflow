# Cómo levantar el proyecto en local

Guía para poner a andar el MVP «Workflow de Remates» (API, frontend y sincronizador con `admin_new`) en un equipo de desarrollo.

Antes de modificar código, lee [AGENTS.md](./AGENTS.md); cada app tiene además su propio `AGENTS.md`.

## 1. Requisitos

| Herramienta | Versión |
| --- | --- |
| Node.js | 22.22.3 o superior (lo exige Angular 22) |
| npm | el que viene con Node |
| MySQL o MariaDB | compatible con el esquema MySQL 8; cliente `mysql` en el PATH |
| `admin_new` de pruebas | copia con `propiedad`, `dato_propiedad` y `datos_lremate` |

No se usa Docker.

## 2. Estructura

```text
apps/api/    API Express + TypeScript y el sincronizador (proceso aparte)
apps/web/    frontend Angular 22
sql/         workflow_mvp.sql (base lista), migrations/ y seeds/
docs/        modelo de datos, plan de la fase 1 y ADRs
references/  maqueta y prototipo de referencia (solo lectura)
```

## 3. Base de datos

Se usan tres bases:

| Base | Para qué | Acceso de la app |
| --- | --- | --- |
| `workflow` | la del MVP | lectura y escritura |
| `workflow_test` | pruebas automatizadas; se recrea durante las pruebas | lectura y escritura |
| `workflow_test_admin_new` | réplica mínima sintética creada por las pruebas | lectura y escritura |
| tu `admin_new` de pruebas | origen de las propiedades | **solo lectura** |

Las pruebas crean además `workflow_test_admin_new`, una réplica mínima de `admin_new`. Nunca leen tu `admin_new`.

### 3.1 Crear las bases y el usuario

Como root en MySQL (cambia la contraseña y el nombre de tu `admin_new` si es otro):

```sql
CREATE DATABASE workflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE workflow_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE workflow_test_admin_new CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'workflow_app'@'localhost' IDENTIFIED BY 'una-clave-local';
GRANT ALL PRIVILEGES ON workflow.* TO 'workflow_app'@'localhost';
GRANT ALL PRIVILEGES ON workflow_test.* TO 'workflow_app'@'localhost';
GRANT ALL PRIVILEGES ON workflow_test_admin_new.* TO 'workflow_app'@'localhost';
GRANT SELECT ON admin_new.* TO 'workflow_app'@'localhost';
```

También puedes usar root en local; el usuario dedicado evita escribir en `admin_new` por error.

### 3.2 Cargar la base del MVP

[sql/workflow_mvp.sql](sql/workflow_mvp.sql) contiene una foto antigua de la base: registra solo las migraciones `0000`–`0004`, incluye la plantilla v2 como activa y no incluye las migraciones ni funciones añadidas después. **No la uses para iniciar el código actual.** Las migraciones vigentes llegan hasta `0017`; para una instalación nueva, sigue la alternativa de migraciones y seeds de abajo. El dump debe regenerarse antes de volver a recomendarlo como instalación inicial.

Desde la raíz del repositorio (funciona igual en bash y PowerShell):

```bash
mysql -u workflow_app -p workflow -e "source sql/workflow_mvp.sql"
```

> Este archivo borra y recrea tablas. Al estar desactualizado, no lo cargues para levantar el proyecto actual.

`workflow_test` no se carga: las pruebas aplican las migraciones solas.

<details>
<summary>Alternativa: desde migraciones y seeds</summary>

Con las tres bases creadas y `apps/api/.env` configurado (paso 4), aplica migraciones y seeds desde la raíz. La migración trabaja sobre `DB_NAME` y registra las migraciones pendientes hasta `0017`:

```bash
cd apps/api
npm run db:migrate
mysql -u workflow_app -p workflow -e "source ../../sql/seeds/0001_roles.sql"
mysql -u workflow_app -p workflow -e "source ../../sql/seeds/0002_workflow_template_v1.sql"
mysql -u workflow_app -p workflow -e "source ../../sql/seeds/0004_workflow_template_v2.sql"
mysql -u workflow_app -p workflow -e "source ../../sql/seeds/0006_workflow_template_v3_linear.sql"
mysql -u workflow_app -p workflow -e "source ../../sql/seeds/0005_notification_rules.sql"
ADMIN_INITIAL_PASSWORD='<contraseña>' npm run users:create-admin -- --email <email> --name "<nombre>"
```

En PowerShell, ejecuta el comando de creación de usuario así y elimina la variable al terminar: `$env:ADMIN_INITIAL_PASSWORD='<contraseña>'; npm run users:create-admin -- --email <email> --name "<nombre>"`; después `Remove-Item Env:ADMIN_INITIAL_PASSWORD`. En Bash, antepone `ADMIN_INITIAL_PASSWORD='<contraseña>'` al comando como en el ejemplo.

</details>

### 3.3 Usuarios de desarrollo

Vienen en `workflow_mvp.sql`. Son cuentas de prueba locales: no las reutilices en ningún otro ambiente.

| Rol           | Correo                           | Contraseña          |
| ------------- | -------------------------------- | -------------------- |
| Administrador | `admin@grupohouse.local` | `Ghc20b64e8bafcA7` |
| Gestor | `gestor.demo@grupohouse.local` | `Gestor5001791` |
| Postor | `postor.demo@grupohouse.local` | `Postordc4a511` |
| Legal | `legal.demo@grupohouse.local` | `Legal720b6f1` |

El administrador crea más usuarios desde «Usuarios» en la aplicación (no hay registro abierto).

## 4. Configurar la API

```bash
cd apps/api
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm install
```

Edita `apps/api/.env` (nunca se versiona):

| Variable | Valor |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | conexión al motor local |
| `DB_NAME` | `workflow` |
| `DB_TEST_NAME` | `workflow_test`, distinta de las otras bases configuradas |
| `ADMIN_NEW_DB_NAME` | nombre de tu `admin_new` de pruebas |
| `ADMIN_NEW_DB_HOST/PORT/USER/PASSWORD` | opcionales si `admin_new` usa otro servidor o usuario; si faltan, se usan los valores `DB_*` |
| `SYNC_INTERVAL_SECONDS` | segundos entre sincronizaciones (60 por defecto) |
| `WEB_ORIGIN` | `http://localhost:4200` |
| `SESSION_TTL_HOURS` | `8` |

La API valida estas variables al arrancar y se detiene con un mensaje claro si falta alguna.

## 5. Configurar el frontend

```bash
cd apps/web
npm install
```

No necesita `.env`: en desarrollo reenvía `/api` a `localhost:3000` (`proxy.conf.json`).

## 6. Levantar todo

Con las dependencias ya instaladas en `apps/api` y `apps/web`, y `apps/api/.env`
configurado, ejecuta desde la raíz:

```bash
npm run dev
```

El comando inicia API, frontend, sincronizador, worker y scheduler en la misma
terminal. Presiona Ctrl+C para detenerlos. Si uno termina inesperadamente, el
lanzador detiene los demás. No ejecuta instalaciones ni migraciones; prepara la
base previamente según las secciones anteriores. No inicies una segunda copia
del comando mientras la primera siga activa.

En un servidor, la API, el sincronizador, el worker y el scheduler se ejecutan como procesos
independientes bajo el supervisor nativo del sistema operativo. Todos aceptan `SIGINT` y `SIGTERM`
para cierre ordenado. No se debe ejecutar más de una instancia del sincronizador; worker y scheduler
sí toleran concurrencia mediante bloqueos y leases en MariaDB.

Abre **`http://localhost:4200`** (no `127.0.0.1`: la API solo acepta escrituras desde `WEB_ORIGIN`) e inicia sesión con un usuario de la sección 3.3.

Para una sola sincronización: `npm run sync -- --once`.

### Probar la PWA en el emulador de Android

La PWA usa la misma interfaz adaptable del frontend. Para probar la instalación y el
service worker se necesita la configuración de producción; `npm start` solo sirve
para revisar la vista móvil durante el desarrollo.

1. Inicia la API desde `apps/api` con `npm run dev`.
2. Inicia el frontend desde `apps/web` con `npm start -- --configuration production`.
   El servidor conserva el proxy de `/api` hacia `localhost:3000`.
3. Con el emulador abierto, ejecuta `adb reverse tcp:4200 tcp:4200` en el equipo.
4. En Chrome del emulador, abre `http://localhost:4200` e instala la aplicación desde
   el menú del navegador.

Usa `localhost` en el emulador, no `10.0.2.2`: así el navegador reconoce un contexto
seguro para el service worker y la API recibe el origen configurado en `WEB_ORIGIN`.
La caché contiene archivos de la interfaz, no respuestas de `/api`. El inicio de
sesión y las operaciones del workflow requieren conexión con la API. Para comprobar
una actualización, recompila y vuelve a abrir la aplicación; puede requerir una
segunda apertura porque Angular activa la versión nueva después de descargarla.

### Qué esperar de la primera sincronización

- Copia todas las propiedades aceptadas (`id_clasif = 7`) de tu `admin_new`.
- Inicia un workflow solo si el remate es hoy o después, o si no tiene fecha. Las de remates ya pasados quedan en «Propiedades sin workflow» del Inicio, donde el administrador puede iniciarlas a mano.
- Los datos que no se pueden interpretar (por ejemplo, sin hora de remate) quedan como avisos en la pantalla «Sincronización» (solo administrador).
- Las siguientes ejecuciones solo procesan lo que cambió.

Reglas completas: [docs/adr/0007-sincronizacion-admin-new.md](docs/adr/0007-sincronizacion-admin-new.md).

Si tu `admin_new` no tiene remates futuros, puedes cargar propiedades sintéticas: `sql/seeds/0003_dev_synthetic_properties.sql`.

## 7. Verificar

Desde `apps/api` (la primera vez, asegúrate de tener `workflow_test` y `workflow_test_admin_new` creadas):

```bash
npm run typecheck
npm run lint
npm test          # usa workflow_test; MySQL debe estar arriba
npm run build
```

Desde `apps/web`:

```bash
npm test -- --watch=false
npm run build
```

## 8. Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| La API no arranca y lista variables | falta o es inválida una variable de `apps/api/.env` |
| `403` al guardar algo | entraste por `127.0.0.1:4200`; usa `localhost:4200` |
| `404` en `/api/...` recién agregadas | la API corre sin recarga; reinicia con `npm run dev` |
| El sincronizador queda `FAILED` | revisa `ADMIN_NEW_DB_*` y que el usuario tenga SELECT sobre `admin_new` |
| El sincronizador registra `sync.skipped` | otro proceso `npm run sync` está corriendo; el candado se libera solo a los 15 minutos si un proceso murió |
| Pruebas fallan con *Access denied* | el usuario no tiene permisos sobre `workflow_test` o `workflow_test_admin_new` |

## 9. Cambios de esquema

1. Editar el esquema Drizzle en `apps/api/src/platform/database/schema/`.
2. `npm run db:generate -- --name <descripcion>` y revisar el SQL en `sql/migrations/`.
3. `npm run db:migrate`.
4. Regenerar `sql/workflow_mvp.sql` con `mysqldump` (estructura y datos de referencia, sin propiedades, workflows, sesiones, notificaciones ni datos de `admin_new`) y actualizar esta guía y `apps/api/AGENTS.md` para reflejar el alcance y el estado real del dump. Revisa y elimina del dump cualquier dato sensible antes de versionarlo. Hasta entonces, usa el proceso de migraciones y seeds de la sección 3.2.

`sql/schema.sql` es el modelo completo futuro: es referencia y no se aplica a ninguna base.

## Más documentación

- [docs/roadmap.md](docs/roadmap.md): estado, camino al MVP definitivo y backlog de la semana.
- [docs/modelo-datos-mvp.md](docs/modelo-datos-mvp.md): tablas y relaciones.
- [docs/adr/](docs/adr/): decisiones técnicas.
- [apps/api/openapi.yaml](apps/api/openapi.yaml): contrato de la API.
