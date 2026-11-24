# ADR 0014: Formularios de evidencia configurables por tarea

- **Estado:** aceptado (2026-11-24)
- **Ámbito:** `apps/api/src/modules/workflow/domain/evidence-forms.ts`,
  `apps/web/src/app/pages/workflow-templates/evidence-form-builder.ts`

## Contexto

Los formularios de evidencia estaban definidos en código y asociados al código de la tarea
(ADR 0009), por lo que solo tres tareas podían exigir evidencia. Se pidió poder armar un
«formulario tipo» para cada tarea desde el editor de flujos.

## Decisión

Aprobada por el usuario que dirige el proyecto (guardar los formularios en la base):

- **Columna `task_definitions.evidence_form` (JSON, migración `0017`).** El formulario es parte
  de la definición de la tarea, así que se versiona con la plantilla y es inmutable una vez
  publicada. Se eligió JSON en vez de una tabla de campos porque el formulario se lee y se
  guarda siempre completo; se valida con zod al entrar por HTTP y al leerlo de la base
  (`evidenceFormSchema`).
- **Compatibilidad:** `null` significa «el formulario inicial del código de la tarea»
  (`DEFAULT_EVIDENCE_FORMS`, los tres que ya existían). Así la v1, la v2 y los seeds siguen
  igual sin migrar datos. Al copiar una versión, el formulario vigente queda guardado en la
  copia. Un formulario sin campos se guarda como `{"fields": []}` y equivale a no tener.
- **Tipos de campo:** texto corto, texto largo, fecha, monto en pesos y lista de opciones (hasta
  30 campos y 30 opciones por lista). El nombre del dato se genera desde la etiqueta al crear el
  campo y no cambia después, para no desconectar la evidencia ya registrada.
- **Exigir evidencia** solo es posible si la tarea tiene al menos un campo; el editor marca la
  exigencia al crear el primer campo y la quita al borrar el último.
- **Regla entre campos** de «Registrar resultado del remate» (monto obligatorio si el resultado
  es «Adjudicado») se mantiene en código y se aplica solo si el formulario conserva los campos
  `outcome` y `awardedAmountClp`.
- El catálogo del editor ya no expone `evidenceFormTaskCodes`; expone `evidenceFieldTypes`.

## Consecuencias

- Reglas condicionales entre campos configurables siguen fuera de alcance.
- Tras aplicar la migración `0017`, `sql/workflow_mvp.sql` debe regenerarse con `mysqldump`.
