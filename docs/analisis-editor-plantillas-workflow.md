# Análisis: edición de plantillas desde el panel de control

## Estado

Propuesta para evaluación. No implementada ni aprobada como decisión de arquitectura.

## Objetivo

Permitir que un administrador prepare y publique nuevas versiones de una plantilla de workflow sin modificar versiones publicadas ni alterar workflows ya iniciados.

## Alcance recomendado para una primera versión

- Listar las versiones de cada plantilla y distinguir `BORRADOR`, `PUBLICADA`, `ACTIVA` e `INACTIVA`.
- Crear un borrador copiando una versión existente.
- Editar en el borrador nombre, descripción, responsable, orden, evidencia y plazo de cada tarea.
- Reordenar tareas mediante controles accesibles de subir/bajar; el arrastre puede ser complementario, no el único mecanismo.
- Generar automáticamente dependencias lineales a partir del orden.
- Validar y mostrar una vista previa antes de publicar.
- Publicar una nueva versión inmutable y, mediante una acción separada y confirmada, activarla para workflows nuevos.
- Mantener intactos los workflows existentes y registrar autor, fecha y resumen de cambios.

La primera versión debería limitarse a secuencias lineales. Un editor de grafos, paralelismo o ramas agrega validaciones y experiencia de usuario sustancialmente más complejas y no es necesario para resolver la regla aprobada actualmente.

## Modelo y reglas necesarias

La tabla actual `workflow_templates` representa versiones publicadas, pero no tiene ciclo de vida de borrador ni autoría. La implementación necesitaría una decisión de esquema revisable, por ejemplo:

- estado explícito de la versión (`DRAFT`, `PUBLISHED`, `RETIRED`) en lugar de depender únicamente de `is_active`;
- `created_by`, `published_by`, `published_at` y, opcionalmente, una referencia a la versión copiada;
- garantía de una sola versión activa por código de plantilla;
- bloqueo de edición para versiones publicadas;
- control de concurrencia del borrador mediante versión o `updated_at`;
- auditoría de creación, edición, publicación y activación.

Las tareas del borrador pueden reutilizar conceptualmente `task_definitions`, pero debe decidirse si esas tablas aceptarán registros editables o si habrá entidades de borrador separadas. Reutilizar tablas reduce duplicación; separar borradores reduce el riesgo de que datos incompletos sean consumidos por el motor. Esta decisión requiere ADR y aprobación antes de implementar.

## API sugerida

Los comandos deberían expresar intención y no permitir actualizaciones genéricas sobre versiones publicadas:

- `POST /workflow-templates/{templateId}/drafts` para copiar una versión;
- `PUT /workflow-template-drafts/{draftId}` para metadatos;
- `PUT /workflow-template-drafts/{draftId}/tasks` para reemplazar la secuencia validada;
- `POST /workflow-template-drafts/{draftId}/publish` para crear la versión inmutable;
- `POST /workflow-templates/{templateId}/versions/{versionId}/activate` para activarla.

Publicar y activar deben ser operaciones transaccionales, autorizadas para `ADMIN`, con respuestas de conflicto cuando el borrador cambió o la versión ya fue publicada.

## Validaciones mínimas

- Al menos una tarea y códigos únicos dentro de la versión.
- Orden único, continuo y determinístico.
- Roles responsables pertenecientes al catálogo aprobado.
- Plazos y campos de evidencia válidos.
- En modo lineal, exactamente cero dependencias para la primera tarea y una para cada tarea posterior.
- Ninguna referencia a tareas de otra versión.
- La publicación debe construir una instantánea completa; nunca actualizar una versión publicada.

## Integración con el panel actual

El panel hoy administra únicamente reglas de notificación y ya usa el patrón de editar un borrador local y publicar una nueva versión. Puede incorporarse una pestaña «Plantillas de workflow» reutilizando ese lenguaje visual, pero no conviene mezclar las versiones de notificaciones con las versiones de workflow: tienen ciclos de vida y efectos distintos.

Una pantalla mínima tendría:

1. selector de plantilla y versión base;
2. listado ordenado de tareas con responsable y plazo;
3. edición de una tarea en panel o diálogo;
4. vista previa de la secuencia y errores;
5. acciones separadas «Guardar borrador», «Publicar versión» y «Activar para nuevos workflows».

## Riesgos y decisiones pendientes

- Definir si el administrador puede cambiar roles, evidencias y plazos, o solamente el orden.
- Definir si se permitirá volver a activar una versión antigua.
- Definir qué ocurre con reglas de notificación al publicar una plantilla nueva: copiar las vigentes parece el comportamiento más predecible, pero debe aprobarse.
- Definir si habrá más de un borrador simultáneo por plantilla.
- Confirmar que ninguna edición se propaga a instancias existentes.
- Mantener fuera de la primera entrega el editor de ramas y paralelismo, salvo aprobación explícita.

## Secuencia de implementación propuesta

1. Aprobar alcance, ciclo de vida y decisiones pendientes mediante ADR.
2. Preparar migración SQL revisable sin ejecutarla.
3. Implementar casos de uso y validaciones de borrador/publicación/activación.
4. Exponer contratos REST y OpenAPI.
5. Agregar la pestaña del panel con vista previa lineal accesible.
6. Cubrir inmutabilidad, autorización, concurrencia, activación única y conservación de instancias existentes.
