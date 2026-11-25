
## Descripción

<!-- Explica brevemente qué hace este PR y por qué es necesario. -->

Implementación del sistema de notificaciones para la asignación de tareas.

- **Ticket / Issue relacionado:** #[Número de ticket o enlace]
- **Tipo de cambio:**
  - [ ] Nueva funcionalidad (`feat`)
  - [ ] Corrección de errores (`fix`)
  - [ ] Refactorización (`refactor`)
  - [ ] Documentación (`docs`)

## Cambios realizados

<!-- Lista los cambios técnicos principales divididos por área si aplica. -->

- **Backend:**
  - Servicio de creación de notificaciones.
  - Persistencia de notificaciones en base de datos.
  - Endpoint de consulta por usuario (`GET /api/...`).
- **Frontend:**
  - Componente de visualización de notificaciones en la interfaz.

## ¿Cómo probarlo?

<!-- Pasos claros para que el revisor pueda validar los cambios en su entorno local. -->

1. Iniciar sesión como administrador.
2. Asignar una tarea a otro usuario.
3. Iniciar sesión con el usuario asignado.
4. Verificar que aparezca la notificación correctamente.

## Capturas de pantalla (Opcional)

<!-- Si hay cambios visuales en el frontend, adjunta capturas o GIFs del antes y después. -->

## Checklist

- [ ] El proyecto compila correctamente sin nuevos warnings ni errores.
- [ ] Se verificó el funcionamiento de todos los flujos afectados.
- [ ] Se agregaron o actualizaron las pruebas unitarias/integración correspondientes.
- [ ] No se incluyen credenciales, tokens ni datos sensibles.
- [ ] Se revisaron los cambios propios (self-review) antes de solicitar aprobación.

## Consideraciones adicionales

<!-- Detalla si este PR requiere acciones extra antes o después del despliegue. -->

- **Migraciones de BD:** [Ej. Ejecutar `npm run migrate` / No aplica]
- **Variables de entorno:** [Ej. Agregar `NOTIFICATIONS_ENABLED=true` / No aplica]
- **Dependencias nuevas:** [Indicar si se instalaron paquetes nuevos / No aplica]
