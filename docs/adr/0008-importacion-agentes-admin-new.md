# ADR 0008: Importación de cuentas de agentes desde admin_new

- **Estado:** aceptado (2026-11-18)
- **Ámbito:** identidad y asignación de participantes en `apps/api` y `apps/web`

## Contexto

Los agentes asignables viven en `gh_agente_zona` y se relacionan con `user` mediante `id_user`.
Workflow necesita cuentas locales para asignarlos y validar su autorización. Los usuarios de esa
lista pueden desempeñar ambos roles del workflow: `MANAGER` y `BIDDER`.

## Decisión

- Se realiza una importación puntual e idempotente desde el proceso de administración; el
  sincronizador periódico de propiedades no crea cuentas.
- La fuente se lee con una sesión MySQL `READ ONLY`. Se importan usuarios distintos por `id_user`
  que estén en `gh_agente_zona`, con nombre y RUT del agente, correo y contraseña de `user`, e
  identificador y descripción del área de `gh_area`.
- Se importan solo correos con formato válido y únicos dentro de los usuarios de
  `gh_agente_zona`. Se omiten los correos inválidos y todos los usuarios que compartan un correo.
- Cada cuenta importada recibe los roles `MANAGER` y `BIDDER`.
- Si el Ã¡rea de origen es `legal` o `jefe legal` (sin distinguir mayÃºsculas ni espacios externos),
  tambiÃ©n recibe `LEGAL_REVIEWER` para aparecer en las asignaciones de revisiÃ³n legal.
- Los hashes bcrypt `$2y$` se normalizan a `$2b$` sin volver a calcularlos. Las contraseñas que el
  responsable del producto identificó como texto se procesan con bcrypt costo 12 antes de
  persistirse. Nunca se escriben ni registran en texto plano.
- El identificador de usuario de `admin_new` se conserva en `users` con unicidad para evitar
  duplicados. El comando muestra una vista previa por defecto; solo `--apply` permite escribir en
  la base workflow.
- Las cuentas locales existentes con el mismo correo, pero sin identificador de origen, se omiten
  y se informan como conflictos; la importación no las fusiona automáticamente.

## Alternativas consideradas

- Crear cuentas para todos los usuarios aunque tengan correo inválido o compartido: incompatible
  con el inicio de sesión actual, que identifica a cada cuenta mediante un correo único.
- Sincronizar usuarios en cada ciclo de propiedades: convertiría una importación de identidad en
  una actualización periódica de permisos y credenciales.
- Copiar contraseñas de origen sin transformación: expondría texto plano y no sería compatible con
  la autenticación del workflow.

## Consecuencias

- Los usuarios con correos inválidos o duplicados no aparecen en las opciones hasta que el origen
  tenga una dirección válida y única.
- El RUT y el área se conservan en la cuenta local y el RUT se muestra junto al nombre en los
  selectores de asignación.
- `admin_new` permanece de solo lectura; cualquier corrección de correo debe hacerse en el
  proceso autorizado del sistema de origen.
- La importación no ejecuta escrituras automáticamente. El comando `--apply` y la migración de
  esquema se ejecutan como acciones separadas contra la base workflow aprobada.
