# ADR 0002: Validación en runtime con Zod

- **Estado:** aceptado (2026-11-12)
- **Ámbito:** `apps/api`

## Contexto

Los tipos de TypeScript no protegen frente a datos que llegan por HTTP, variables de entorno, la base de datos o `admin_new`. AGENTS.md exige validar toda entrada externa en el servidor y validar la configuración al iniciar.

## Decisión

- `zod` valida las variables de entorno al arrancar cada proceso (`src/config/env.ts`). Si falta o es inválida alguna, el proceso no inicia e informa solo los nombres de las variables, nunca sus valores.
- Cada endpoint define un esquema Zod para parámetros, query y cuerpo; los campos desconocidos se rechazan cuando corresponda.
- Los formularios de evidencia (`form_data`) se validan con un esquema Zod por código de tarea.
- Las filas leídas de `admin_new` se validan con Zod en el adaptador antes de entrar al dominio.
- La validación de formato no sustituye las invariantes del dominio.

## Alternativas consideradas

- **Valibot:** enfoque similar y más liviano, con menos integraciones.
- **Validación manual:** sin dependencias, pero repetitiva y propensa a omisiones.

## Consecuencias

- Los tipos de entrada se infieren del esquema: una sola definición para validar y tipar.
- Los errores de validación se devuelven como Problem Details con código estable.
- Queda pendiente decidir si el contrato OpenAPI se genera desde los esquemas Zod o se mantiene a mano; por ahora `apps/api/openapi.yaml` se escribe a mano.
