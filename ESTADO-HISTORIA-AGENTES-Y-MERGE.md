# Estado de la historia: agentes y asignación automática

## Estado actual del repositorio

- La resolución de conflictos quedó incorporada. El estado actual de Git muestra `main` en `aeb24ea` (`Merge branch 'main'...`), alineado con `origin/main`.
- La migración `0006_admin_new_agent_users` se conserva como 0006. La migración de notificaciones quedó como `0007_notifications`, con su snapshot posterior y el journal actualizado.
- Hay un cambio local ajeno a esta historia en `apps/web/proxy.conf.json`: el proxy apunta a `localhost:3001` en vez de `localhost:3000`. Está fuera del stage y se debe preservar.
- No ejecutar otro sync sin revisar su alcance: procesa todas las propiedades aceptadas.

## Agentes migrados

- Se importaron 18 usuarios que aparecen en `gh_agente_zona` y que tenían correo válido y único.
- Se les asignaron los roles de gestor (`MANAGER`) y postor (`BIDDER`).
- Tres agentes de las áreas `legal` o `jefe legal` también tienen `LEGAL_REVIEWER`.
- La importación puede ejecutarse en modo de vista previa con `npm run users:import-admin-new-agents`; `-- --apply` escribe en la base del workflow. `admin_new` se mantiene como origen de solo lectura.
- Para probar la asignación automática se ejecutaron pruebas sintéticas antes del merge: 2 pasaron y 23 quedaron omitidas. No se ejecutaron pruebas después de integrar notificaciones.

## Reglas observadas para la asignación automática

- El nombre del pagador se busca entre usuarios activos con rol de gestor; el nombre del postor, entre usuarios activos con rol de postor.
- Se requiere una coincidencia única por nombre.
- En un workflow existente, la sincronización solo completa asignaciones faltantes cuando la tarea `ASSIGN_MANAGER_AND_BIDDER` está `READY`. No reemplaza responsables ya asignados ni reabre una tarea completada.

## Propiedades revisadas para la prueba

- **13975:** el pagador es Felipe Bustos Gonzalez. Quedó fuera de la importación por no tener un correo válido, por lo que no hay usuario migrado para asignarlo como gestor. Cambiar la clasificación no reinicia el workflow ni la tarea.
- **13941:** nombres del pagador y postor coinciden con usuarios migrados, pero su workflow ya tiene la tarea de asignación completada y responsables de demostración. No es una prueba válida de asignación automática.
- No se encontró una propiedad aceptada que sirva ahora como prueba real de ambos roles: las demás coincidencias tenían fecha de remate pasada y no tenían workflow.

## Regla regional a?adida

- En remates presenciales, gestor y postor deben pertenecer a la regi?n de la propiedad.
- En modalidad Videollamada, el gestor debe seguir siendo regional y el postor puede pertenecer a cualquier regi?n de la oficina.
- La regi?n de la propiedad se deriva desde la comuna con gh_comuna_region; la modalidad procede de datos_lremate.tipo_remate y la regi?n del agente de gh_agente_zona.region.
- La migraci?n 0009_agent_region_assignment y la actualizaci?n de regiones de agentes ya importados est?n preparadas, pero pendientes de aplicar. Despu?s de la migraci?n habr? que volver a ejecutar la importaci?n con --apply.

## Siguiente paso

Ejecutar las verificaciones del proyecto después del merge. Para probar con datos de workflow, usar una propiedad con fecha vigente, nombres coincidentes con usuarios migrados y la tarea de asignación todavía `READY`; evitar alterar responsables ya asignados.
