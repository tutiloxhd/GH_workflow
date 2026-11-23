# Guía de migración de usuarios desde admin_new

Esta guía describe cómo actualizar el esquema local y traer a Workflow las cuentas asociadas a
`gh_agente_zona`. La conexión a `admin_new` es de solo lectura. Los cambios de esquema y las cuentas
importadas se escriben únicamente en la base local indicada por `DB_NAME`.

## Qué importa

- Crea una cuenta por cada `id_user` distinto de `gh_agente_zona`, aunque el agente tenga varias
  filas de zona. Para los datos del agente usa la fila más reciente por `creado` y, si empatan, el
  mayor `id_gh_agente_zona`.
- No filtra por estado activo.
- Conserva el correo si es válido, único y no está ocupado en Workflow. Si falta, es inválido,
  repetido o ya pertenece a otra cuenta, usa un correo dummy único con formato
  `test+admin-new-<id_user>@grupohouse.cl`.
- Recorta el nombre y compacta espacios. Si no hay nombre, usa `Agente admin_new <id_user>`.
- Asigna `MANAGER` y `BIDDER`. También asigna `LEGAL_REVIEWER` solo cuando
  `user.id_gh_area` es `1` o `4`. El área no se almacena en Workflow.
- Guarda `region_id` relacionado con el catálogo fijo `regions(id, name)` de 16 regiones. Cuando
  el origen no informa región, asigna la Región Metropolitana. Una región de origen fuera del
  catálogo detiene la importación para revisión.
- Convierte las contraseñas en texto a bcrypt costo 12. Los hashes bcrypt `$2y$` se normalizan a
  `$2b$`; nunca se imprimen las contraseñas.
- Conserva `admin_new_user_id` para que la importación sea idempotente.

La sincronización periódica de propiedades no importa ni crea cuentas.

## Requisitos

1. Completar `apps/api/.env` con `DB_*` para Workflow y `ADMIN_NEW_DB_*` para el origen. Las bases
   deben ser distintas.
2. Confirmar que `DB_NAME` apunta a la base local de Workflow que se desea modificar.
3. El usuario de conexión a `admin_new` debe tener permisos de lectura; el adaptador además inicia
   la sesión en modo `READ ONLY`.
4. Ejecutar desde `apps/api`.

## Procedimiento

1. Aplicar las migraciones pendientes de Workflow:

   ```bash
   npm run db:migrate
   ```

   La migración `0012_normalize_agent_regions` crea `regions(id, name)`, copia las regiones
   existentes a ese catálogo, llena `users.region_id` y elimina `admin_new_area_id`,
   `admin_new_area_name` y `admin_new_region`.
   La migración `0013_canonical_regions` fija los IDs 1–16, incorpora las regiones faltantes y
   asigna la Región Metropolitana a las cuentas sincronizadas que estaban sin región.

2. Ejecutar una vista previa. Este comando no escribe en Workflow:

   ```bash
   npm run users:import-admin-new-agents
   ```

   Revisar `eligibleUsers`, `alreadyImported`, `assignedDummyEmails`,
   `skippedIncompleteRecords` y `imported`. `sourceUsersWithoutRegion` cuenta filas sin región en
   `admin_new`, aunque ya tengan la Región Metropolitana asignada en Workflow. En modo `DRY_RUN`,
   `imported` siempre es cero.

3. Si el resumen es correcto, aplicar la importación:

   ```bash
   npm run users:import-admin-new-agents -- --apply
   ```

4. Verificar que `imported` corresponda a los usuarios pendientes y que una nueva vista previa
   informe que ya están asociados por `admin_new_user_id`.

Si un script `tsx` falla antes de arrancar con `uv_os_get_passwd ... ENOMEM`, compilar y usar los
puntos de entrada JavaScript:

```bash
npm run build
node --env-file=.env dist/entrypoints/migrate.js
node --env-file=.env dist/entrypoints/import-admin-new-agents.js
node --env-file=.env dist/entrypoints/import-admin-new-agents.js --apply
```

## Resultado de la ejecución local del 23 nov 2026

- La fuente tenía 24 filas de zona y 21 `id_user` distintos; no había filas sin usuario asociado.
- Antes de importar, Workflow tenía 18 cuentas vinculadas por `admin_new_user_id`.
- Las filas de zona `id_gh_agente_zona` 6, 11 y 12 eran los tres usuarios faltantes. Sus
  `id_user` son 362, 330 y 332, y el correo de origen era inválido (`.`).
- La vista previa reportó 21 elegibles, 18 ya importados, 3 correos dummy y 0 registros incompletos.
- La aplicación reportó 3 importados. Workflow quedó con 21 cuentas de origen.
- Se verificaron los tres correos dummy, los roles `MANAGER` y `BIDDER`, hashes bcrypt y referencias
  de región válidas. La consulta de verificación fue de solo lectura.
- El 23 nov se aplicó `0013_canonical_regions`: quedaron 16 regiones (IDs 1–16), 21 cuentas
  sincronizadas con región y ninguna referencia de región inválida. Seis cuentas sin región se
  vincularon a la Región Metropolitana.

## Si la ejecución se interrumpe

- Las migraciones se registran en `__drizzle_migrations`; volver a ejecutar `db:migrate` aplica solo
  las pendientes.
- La importación identifica cuentas existentes por `admin_new_user_id`; volver a ejecutar el
  comando no duplica las cuentas.
- No editar ni ejecutar SQL manual sobre `admin_new`. Las correcciones de origen se realizan en el
  procedimiento autorizado de ese sistema.
