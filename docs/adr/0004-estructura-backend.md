# ADR 0004: Estructura del repositorio y del backend

- **Estado:** aceptado (2026-11-12)
- **Ámbito:** repositorio, `apps/api`

## Contexto

AGENTS.md pide un monolito modular organizado por capacidades de negocio, con transporte HTTP, aplicación, dominio e infraestructura separados, y puntos de entrada distintos para API, worker y scheduler. La estructura concreta debía proponerse y aprobarse antes de inicializar el backend.

## Decisión

Repositorio:

```text
apps/api/        backend Express + TypeScript
apps/web/        frontend Angular
sql/migrations/  SQL generado y revisable
sql/seeds/       SQL idempotente de datos base
docs/            documentación y ADRs
references/      material de referencia, solo lectura
```

Cada aplicación tiene su propio `package.json`; no se usan workspaces ni herramientas de monorepo.

Backend:

```text
apps/api/src/
  config/        variables de entorno validadas
  platform/      capacidades técnicas compartidas (database, http, logging)
  modules/       una carpeta por capacidad de negocio
    <módulo>/    http/ · application/ · domain/ · persistence/
  entrypoints/   un archivo por proceso
apps/api/test/   pruebas de integración
```

- Módulos previstos para la fase 1: `identity`, `properties`, `workflow`, `tasks`, `admin-new-sync`. Un módulo solo crea las capas que necesita.
- `http/` lee la solicitud validada, invoca un caso de uso y arma la respuesta; no contiene reglas ni SQL.
- `application/` contiene los casos de uso: coordinan transacciones, autorización contextual, historial y persistencia; no conocen Express.
- `domain/` contiene estados, transiciones e invariantes; no depende de Express ni de la base.
- `persistence/` contiene las consultas Drizzle del módulo.
- El esquema Drizzle vive en `platform/database/schema/`, porque las claves foráneas cruzan módulos y `drizzle-kit` necesita verlo completo.
- Procesos: `entrypoints/api.ts` (HTTP) y `entrypoints/migrate.ts`. El sincronizador tendrá su propio punto de entrada; no corre dentro del servidor HTTP.
- TypeScript estricto, módulos ES (`NodeNext`), Node.js 22.

## Alternativas consideradas

- **Organización por capa técnica** (`routes/`, `services/`, `models/`): dispersa cada capacidad de negocio en varias carpetas.
- **Esquema de tablas dentro de cada módulo:** más encapsulado, pero obliga a importaciones cruzadas entre módulos para las claves foráneas.
- **Workspaces de npm:** útiles si aparece código compartido entre aplicaciones; hoy no existe.

## Consecuencias

- Un módulo puede leer tablas de otro solo a través de lo que ese módulo exporte; el esquema compartido no autoriza a saltarse sus casos de uso.
- Si aparece un worker de automatizaciones, se agrega como otro punto de entrada sin reorganizar los módulos.
