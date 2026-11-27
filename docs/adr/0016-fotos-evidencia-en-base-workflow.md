# ADR 0016: Fotos de evidencia en la base de workflow

Estado: aceptada por la solicitud del usuario del 27 de noviembre de 2026.

## Contexto

Los pasos 8 y 10 necesitan fotos como evidencia. El usuario pidió guardarlas en la base de workflow y aprobó hasta cinco fotos JPEG, PNG o WebP de 5 MB por tarea. El paso 8 debe avisar al revisor legal al guardar el formulario.

## Decisión

Guardar cada foto como `MEDIUMBLOB` en `task_evidence_photos`, con tipo MIME, tamaño, autor y fecha. El formulario versionado indica `requiresPhoto` y `notifyLegalOnSubmit`. La API recibe cada foto como cuerpo binario, verifica tamaño y firma, y solo entrega el binario a usuarios autorizados para el workflow. La evidencia estructurada conserva sus campos JSON y la API general solo expone metadatos de fotos. Las fotos se borran antes de tareas en los scripts de reinicio.

Las fotos se conservan en su formato de entrada. Convertir JPEG o PNG a WebP requiere una biblioteca de procesamiento de imágenes adicional y una autorización específica para esa dependencia.

## Alternativas y consecuencias

Almacenamiento externo: reduce tamaño de la base, pero contradice la elección explícita del usuario y exige otra infraestructura. Incrustar base64 en `form_data`: aumenta el tamaño del JSON y expone binarios en las consultas generales. El BLOB aumenta respaldos y uso de disco de la base; por eso se limita cada tarea a 25 MB y cada foto a 5 MB.
