# Pruebas del backlog de la semana (16–20 nov 2026)

Casos para aceptar las historias HU-06, HU-07, HU-08, HU-09 y HU-12 del [backlog de la semana](./backlog-semana.md). Una historia se da por terminada cuando todos sus casos están aprobados o tienen una justificación explícita, y sus pruebas automáticas están en verde.

Las reglas generales de ejecución son las de [plan-de-pruebas.md](./plan-de-pruebas.md#1-reglas-de-ejecución). Las más importantes:

- Solo bases locales o de QA; nunca producción.
- `admin_new` es de solo lectura para la aplicación. Modificar una **copia local** de `admin_new` para preparar un caso requiere autorización previa, anotar el valor original y restaurarlo al terminar.
- No usar datos personales reales en capturas, issues ni evidencias: anonimizar RUT, nombres y correos.
- Registrar cada ejecución en la [sección 8](#7-registro-de-ejecuciones).

Donde dice **«según la regla de A1/A2»**, el resultado esperado depende de la regla de `admin_new` que documente quien implementa. Esa regla no se inventa en el workflow: si no está escrita, el caso queda bloqueado y se pregunta.

## 1. Preparación común

1. Base `workflow` cargada según [LEVANTAR-PROYECTO.md](../LEVANTAR-PROYECTO.md) y migraciones al día (`npm run db:migrate` no informa pendientes).
2. Copia local de `admin_new` configurada en `ADMIN_NEW_DB_NAME`.
3. API (`npm run dev`), web (`npm start`) y, cuando el caso lo pida, `npm run sync -- --once`.
4. Verificación automática previa, desde `apps/api` y `apps/web`:

```bash
npm run typecheck && npm run lint && npm test && npm run build   # apps/api
npm test -- --watch=false && npm run build                         # apps/web
```

Referencia de la copia local (18 nov 2026): `gh_agente_zona` tiene 27 filas para 23 usuarios distintos (un agente puede tener varias zonas), todas activas; tipos `region`, `oficina` y `cupon`.

## 2. HU-06 · Usuarios desde admin_new (A2)

| ID      | Caso                    | Preparación y acción                                                       | Resultado esperado                                                                                          |
| ------- | ----------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| HU06-01 | Primera migración      | Base `workflow` sin agentes migrados; ejecutar la migración.              | Un usuario por agente activo distinto (23 en la copia de referencia), con el rol según la regla de A2.     |
| HU06-02 | Agente con varias zonas | Agente con más de una fila en `gh_agente_zona`.                           | Un solo usuario; sin duplicados por correo ni por id de origen.                                             |
| HU06-03 | Idempotencia            | Ejecutar la migración dos veces sin cambios en el origen.                   | No se crean, modifican ni duplican usuarios; ningún evento nuevo.                                          |
| HU06-04 | Datos incompletos       | Agente sin correo o sin nombre en el origen.                                 | No se crea con datos inventados; queda un aviso que lo identifica (sin datos personales en el log).         |
| HU06-05 | Usuario ya existente    | Ya existe en el workflow un usuario con el mismo correo.                     | Se vincula o se informa según la regla de A2; nunca se crea un segundo usuario.                            |
| HU06-06 | Inicio de sesión       | Un agente migrado intenta entrar.                                            | Entra según el mecanismo definido (contraseña inicial o restablecimiento); ve solo lo que su rol permite. |
| HU06-07 | Usuarios locales        | Los usuarios de desarrollo (`*@grupohouse.local`) existen antes de migrar. | No cambian.                                                                                                 |
| HU06-08 | Solo lectura            | Revisar el código y la conexión usados por la migración.                  | Solo `SELECT` sobre `admin_new`; sesión `READ ONLY`.                                                 |

## 3. HU-07 · Usuario dado de baja (A3)

Requiere marcar `activo = 0` en la copia local (con autorización y restaurando después).

| ID      | Caso                   | Preparación y acción                                                            | Resultado esperado                                                                   |
| ------- | ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| HU07-01 | Baja                   | Agente migrado con sesión abierta; pasarlo a inactivo en el origen; sincronizar. | Usuario `INACTIVE`; su siguiente petición responde 401 y vuelve al login.         |
| HU07-02 | Login bloqueado        | El usuario dado de baja intenta entrar.                                           | Login rechazado con el mismo mensaje genérico que una credencial inválida.         |
| HU07-03 | Tareas abiertas        | El usuario tenía tareas `READY` o `IN_PROGRESS`.                             | Las tareas no se pierden ni se completan; el administrador las ve para reasignarlas. |
| HU07-04 | Suplente               | El usuario era suplente de una tarea.                                             | La tarea sigue con su titular; el administrador ve que falta suplente.               |
| HU07-05 | Historial              | Revisar el historial tras HU07-01.                                                | Queda registrada la baja con origen `SYNC` y fecha.                                |
| HU07-06 | Una sola zona inactiva | Agente con dos zonas; desactivar solo una.                                        | El usuario sigue activo (según la regla de A2).                                     |
| HU07-07 | Reactivación          | Restaurar `activo = 1` y sincronizar.                                           | El usuario vuelve a `ACTIVE`; no se crea otro.                                     |
| HU07-08 | Idempotencia           | Sincronizar otra vez sin cambios.                                                 | Sin eventos nuevos.                                                                  |

## 4. HU-08 · Cambio de gestor o postor (A4)

Requiere cambiar en la copia local el gestor o el postor asignado a una propiedad con workflow abierto, en la tabla que usa A1.

| ID      | Caso                    | Preparación y acción                                                     | Resultado esperado                                                                     |
| ------- | ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| HU08-01 | Cambio de gestor        | Anotar responsables actuales; cambiar el gestor en el origen; sincronizar. | Las tareas abiertas del gestor pasan al nuevo; `workflow_participants` se actualiza. |
| HU08-02 | Cambio de postor        | Igual que HU08-01 con el postor.                                           | Solo cambian las tareas del postor.                                                    |
| HU08-03 | Tareas cerradas         | Tener una tarea completada del gestor antes del cambio.                    | Su responsable, estado y evidencia no cambian.                                         |
| HU08-04 | Historial               | Revisar el historial.                                                      | Responsable anterior, nuevo y origen `SYNC`.                                         |
| HU08-05 | Mis tareas              | Entrar como el gestor anterior y como el nuevo.                            | El anterior ya no ve las tareas abiertas; el nuevo sí.                                |
| HU08-06 | Responsable inexistente | El nuevo gestor no existe como usuario en el workflow.                     | No se reasigna; aviso en «Sincronización».                                          |
| HU08-07 | Workflow suspendido     | Cambiar el gestor de un workflow `SUSPENDED`.                            | Se reasigna sin reactivar tareas; el workflow sigue suspendido.                        |
| HU08-08 | Workflow cerrado        | Cambiar el gestor de un workflow completado o cancelado.                   | No cambia nada en el workflow.                                                         |
| HU08-09 | Idempotencia            | Sincronizar otra vez sin cambios.                                          | Sin reasignaciones ni eventos nuevos.                                                  |
| HU08-10 | Concurrencia            | Completar una tarea mientras la sincronización la reasigna.               | Ninguna acción queda a medias; el historial refleja el orden real.                    |

## 5. HU-09 · Centro de notificaciones (A5)

Usar el reloj fijo de las pruebas automáticas para los vencimientos; en la interfaz, editar plazos como administrador para crear los casos. La anticipación de «por vencer» se toma de la configuración (N8).

**Motor**

| ID | Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- | --- |
| HU09-01 | Tarea asignada | Se activa una tarea con titular y suplente. | Solo el titular recibe una notificación «tarea asignada» con enlace a la tarea. |
| HU09-02 | Por vencer | Tarea que entra en la ventana de anticipación configurada. | Solo el titular vigente recibe una notificación «por vencer». Si se confirma su reemplazo por el suplente, las notificaciones siguientes se dirigen al nuevo titular. |
| HU09-03 | Vencida | Tarea que pasa su `due_at`. | Una notificación «vencida». |
| HU09-04 | Borde de día | Vencimientos a las 23:59 y a las 00:00 del día siguiente, hora de Santiago, incluida una fecha de cambio de horario (prueba automática). | Cada una se notifica en el momento correcto según Santiago. |
| HU09-05 | Eventos del workflow | Suspender, reanudar, cancelar y reprogramar un workflow. | Los participantes reciben una notificación por cada hecho. |
| HU09-06 | Sin duplicados | Ejecutar la evaluación periódica dos veces sobre el mismo estado. | No se crean notificaciones repetidas. |
| HU09-07 | Tareas no abiertas | Tareas completadas, bloqueadas o suspendidas. | No generan «por vencer» ni «vencida» (una suspendida no vence). |
| HU09-08 | Proceso caído | Detener el proceso periódico y volver a iniciarlo. | Retoma lo pendiente sin duplicar ni perder notificaciones. |
| HU09-09 | Sin canales externos | Revisar logs y salidas del proceso. | No se envía ningún correo ni mensaje externo. |

**Centro**

| ID | Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- | --- |
| HU09-10 | Contador | Usuario con 3 notificaciones no leídas. | El ícono de la barra muestra 3. |
| HU09-11 | Lista | Abrir el centro. | La más reciente primero; se distinguen leídas y no leídas. |
| HU09-12 | Marcar leída | Marcar una, y luego «Marcar todas». | El contador baja en cada paso y se mantiene al recargar. |
| HU09-13 | Navegación | Hacer clic en una notificación. | Abre la tarea o el workflow correspondiente y la marca como leída. |
| HU09-14 | Privacidad | Consultar por API las notificaciones de otro usuario. | 404 o 403; nunca datos ajenos. |
| HU09-15 | Accesibilidad | Abrir y recorrer el centro con teclado y en teléfono. | Foco visible, contador anunciado, controles de al menos 44 px. |

**Configuración general**

| ID | Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- | --- |
| HU09-16 | Solo ADMIN | Entrar a la configuración como gestor (interfaz y API). | Sin acceso; la API responde 403. |
| HU09-17 | Desactivar un tipo | Desactivar «tarea asignada» y activar una tarea. | No se genera esa notificación; los demás tipos siguen. |
| HU09-18 | Cambiar anticipación | Cambiar la anticipación de «por vencer». | Las evaluaciones siguientes usan el valor nuevo; las notificaciones ya creadas no cambian. |
| HU09-19 | Validación | Guardar una anticipación negativa o vacía. | 400 con el campo inválido; la configuración no cambia. |
| HU09-20 | Trazabilidad | Revisar tras HU09-17 y HU09-18. | Queda registrado quién cambió qué y cuándo. |

## 6. HU-12 · Ver flujo (A11)

Comparar contra la maqueta abriendo `references/demoweb/index.html` en el navegador.

| ID | Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- | --- |
| HU12-01 | Solo propiedades en flujo | Tener workflows activos, suspendidos, completados y cancelados, y propiedades sin workflow. | Solo aparecen los activos y suspendidos. |
| HU12-02 | Datos de la fila | Revisar una fila. | Título, comuna, fecha y hora del remate en Santiago, estado con su color y etapa actual. |
| HU12-03 | Sin fotografías | Revisar varias propiedades. | El listado no reserva espacio ni intenta cargar fotografías inexistentes. |
| HU12-04 | Resumen | Hacer clic en una propiedad. | Se abre el panel: estado, ubicación, fecha, tareas completadas sobre el total (sin porcentaje), tarea actual, responsable, próxima acción y fecha límite. |
| HU12-05 | Coincide con el detalle | Comparar el resumen con el detalle del workflow. | Los mismos estados, responsable y vencimiento. |
| HU12-06 | Workflow suspendido | Abrir el resumen de uno suspendido. | Se ve como suspendido y la tarea actual aparece detenida. |
| HU12-07 | Vista aérea | «Ver flujo completo →». | Diagrama con todas las tareas de la plantilla en orden, estado y responsable de cada una. |
| HU12-08 | Estados en el diagrama | Workflow con tareas completadas, en curso, pendientes y bloqueadas. | Cada estado se distingue también sin color (ícono o texto). |
| HU12-09 | Detalle desde el diagrama | Abrir un nodo del diagrama. | Muestra el detalle de la tarea en modo solo lectura y no permite cambiar su estado ni evidencia. |
| HU12-10 | Responsive | 375 px, 768 px y 1280 px. | Lista y panel se adaptan; el diagrama es horizontal en escritorio y vertical hasta 1000 px; sin scroll horizontal de la página. |
| HU12-11 | Teclado | Recorrer lista, panel y diagrama solo con teclado. | Foco visible, orden lógico, Escape cierra la vista aérea y devuelve el foco. |
| HU12-12 | Permisos | Entrar como gestor, postor y legal. | No ven esta pantalla como principal; la API de la vista no les entrega datos ajenos. |
| HU12-13 | Sin propiedades | Base sin workflows en curso. | Mensaje claro en lugar de una lista vacía. |
| HU12-14 | Datos desde la API | Revisar el código del componente. | Estados, etapas y conteos vienen de la API; el frontend no los calcula. |

## 7. Registro de ejecuciones

Agregar una fila por sesión de prueba.

| Fecha | Ambiente | Responsable | Casos | Resultado | Evidencia o incidencia |
| ----- | -------- | ----------- | ----- | --------- | ---------------------- |
|       |          |             |       |           |                        |
