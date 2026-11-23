# ADR 0012: Importación completa de agentes y catálogo de regiones

- **Estado:** aceptado (2026-11-23)
- **Ámbito:** importación de cuentas desde `admin_new` y asignación regional de agentes.

## Contexto

`gh_agente_zona` puede tener varias filas por persona. El correo identifica de forma única las
cuentas de Workflow, pero en el origen hay correos inválidos, repetidos o que ya están ocupados por
cuentas locales. Las áreas del sistema de origen solo son relevantes para reconocer revisores
legales. La región sí participa en la elegibilidad de asignaciones.

## Decisión

- Se importa una cuenta por `id_user` distinto presente en `gh_agente_zona`, independientemente de
  que su correo de origen falte, sea inválido o esté repetido. Se conserva la fila de zona más
  reciente por `creado` y `id_gh_agente_zona`.
- Un correo válido y único se conserva. Para correos ausentes, inválidos, repetidos o en conflicto
  con otra cuenta Workflow se genera un correo dummy único `test+admin-new-<id>@grupohouse.cl`.
- Todas las cuentas importadas reciben `MANAGER` y `BIDDER`. Solo `id_gh_area` 1 o 4 agrega
  `LEGAL_REVIEWER`; el área no se persiste en Workflow.
- El catálogo local `regions(id, name)` normaliza las regiones de los agentes. `users.region_id`
  referencia ese catálogo; los valores sin región quedan nulos.
- El nombre se recorta y se compactan espacios repetidos. Si falta, se usa `Agente admin_new <id>`.
- Se conserva el mecanismo de contraseña existente: bcrypt `$2y$` se normaliza y las contraseñas
  no bcrypt se hashean con el costo de producción. La contraseña no se imprime.
- La importación puntual sigue siendo idempotente. La conexión a `admin_new` es `READ ONLY` y solo
  `--apply` escribe en Workflow.

## Consecuencias

- Los correos dummy son identificadores técnicos únicos; el agente deberá usar el correo real o un
  mecanismo de recuperación autorizado para iniciar sesión con su identidad habitual.
- El catálogo conserva solo id y nombre de región. Las propiedades siguen guardando los datos de
  ubicación necesarios para el workflow.
- Usuarios locales que ocupan un correo de origen no se fusionan: el agente importado recibe un
  dummy único y la cuenta local permanece intacta.
