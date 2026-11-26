# ADR 0015: Reinicio de plantillas para HU-13

- **Estado:** aceptado para local y desarrollo (2026-11-25)
- **Ámbito:** seeds de plantillas `REMATE_JUDICIAL` y `sql/diagnostics/reset-workflow-templates.sql`

## Contexto

HU-13 propone sustituir las versiones publicadas v1, v2 y v3 por una plantilla base que
represente los pasos actuales. El ADR 0009 establece que las versiones publicadas son
inmutables y que se archivan en lugar de borrarse. Conservar las versiones permitiría
mantener su historial, pero no satisface el reinicio solicitado para las bases locales y
de desarrollo anteriores a QA.

## Decisión

- Para bases **locales y de desarrollo únicamente**, se permite una excepción puntual al
  ciclo de vida del ADR 0009: borrar físicamente las plantillas publicadas existentes y
  los workflows, tareas, evidencias, historial y notificaciones que dependen de ellas.
- El borrado se prepara en un script transaccional, en orden de dependencias y con una
  consulta de verificación. No se ejecuta en QA ni producción.
- `properties`, `users`, `roles`, `holidays` y datos de sincronización se conservan.
- En QA y producción, cuando existan datos, las versiones publicadas se conservan y la
  plantilla nueva se publicará como una versión posterior.
- Se confirma D2: «Asignar gestor y postor» se completará en la sincronización siguiente a
  completar «Aceptar propiedad», sin modificar el motor.
- Se confirma D3: «Aceptar propiedad» se mantiene como paso manual de ADMIN; la plantilla
  contiene 13 pasos.
- Se corrige D4: «Consignar garantía» corresponde a MANAGER y exige fecha, tribunal y número/
  folio del comprobante; «Alertas y preparar participación» corresponde a ADMIN.
- Se confirma D5: los seeds obsoletos `0002`, `0004` y `0006` se retiran del repositorio.

## Alternativas consideradas

- **Archivar v1–v3 y publicar v4:** conserva workflows e historial y respeta plenamente el
  ADR 0009, pero no deja una única plantilla base en los ambientes locales existentes.
- **Editar una versión publicada:** descartado porque cambiaría la definición asociada a
  workflows existentes y rompe la inmutabilidad.

## Consecuencias

- Los ambientes locales y de desarrollo pierden workflows e historial asociados a las
  plantillas borradas; deben sincronizar nuevamente para crear workflows elegibles.
- Las propiedades con remate pasado no se recrean automáticamente, según ADR 0007.
- El reinicio debe respaldarse antes de ejecutarse y no forma parte de la ejecución de
  seeds ni de pruebas automatizadas.
- Esta excepción no cambia el ciclo normal de versiones establecido por ADR 0009.
- Los seeds `0002`, `0004` y `0006` quedan retirados; las instalaciones nuevas usan el seed
  `0007_workflow_template_base.sql` y luego `0005_notification_rules.sql`.
- Al incluir «Aceptar propiedad» como primer paso (13 pasos en cadena lineal), al iniciar un
  workflow `ACCEPT_PROPERTY` queda `READY` y `ASSIGN_MANAGER_AND_BIDDER` inicia `BLOCKED`. Si
  `admin_new` informa gestor y postor, la asignación automática ocurre en la sincronización
  siguiente a completar «Aceptar propiedad», sin modificar el motor.
- El formulario de resultado usa el nuevo código combinado. Para respetar el alcance de HU-13,
  el motor no se modifica; por eso la validación condicional histórica que exigía monto al marcar
  «Adjudicado» no se aplica al nuevo código. La forma y el tipo de cada campo sí se validan.
