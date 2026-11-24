# ADR 0010: Plazos en días hábiles y feriados

- **Estado:** aceptado (2026-11-24)
- **Ámbito:** `apps/api/src/modules/workflow/domain/due-date.ts`, `apps/api/src/modules/holidays`,
  `apps/web/src/app/shared/deadline`, `apps/web/src/app/pages/holidays`

## Contexto

Los plazos se contaban en días corridos del calendario de Santiago. Se pidió contarlos en días
hábiles y una forma más clara de editarlos (sin números negativos).

## Decisión

Aprobada por el usuario que dirige el proyecto:

- **Días hábiles para todos los plazos de las versiones nuevas.** `workflow_templates` tiene
  `deadline_day_kind` (`CALENDAR` | `BUSINESS`, migración `0015`). Las filas existentes y las de
  seed quedan `CALENDAR` (valor por omisión); todo borrador creado desde la administración es
  `BUSINESS`. Así los remates en curso no cambian: cada workflow usa el calendario de su versión.
- **Día hábil:** lunes a viernes que no es feriado, en el calendario de America/Santiago. Sumar
  N días hábiles avanza (o retrocede si N < 0) hasta contar N días hábiles conservando la hora
  local; con 0 días la fecha no se mueve. Los minutos de ajuste se suman después.
- **Feriados en la base** (`holidays`, un día por fila, origen `BOOSTR` o `MANUAL`). Un
  administrador sincroniza un año desde la API de Boostr (`GET /holidays/{year}.json`, gratuita
  y sin clave; límite publicado de 5 consultas cada 10 segundos). La sincronización reemplaza solo los feriados `BOOSTR` del año;
  los manuales se conservan y tienen prioridad. También se pueden ingresar a mano.
  El cálculo nunca consulta la API externa: solo lee la tabla.
- **Editor de plazo en lenguaje natural** reutilizado en el editor de flujos y en el cambio de
  plazo por remate: «Vence [3] días hábiles [antes ▾] de [la fecha del remate ▾]», con la frase
  resultante. «Antes» no se ofrece para plazos medidos desde la activación de la tarea.

## Consecuencias

- Si un año no tiene feriados cargados, los plazos de ese año solo saltan fines de semana. La
  pantalla de feriados lo advierte.
- Para que los remates nuevos usen días hábiles hay que publicar una nueva versión del flujo.
- Tras aplicar la migración `0015`, `sql/workflow_mvp.sql` debe regenerarse con `mysqldump`.
