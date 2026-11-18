# Plan de la fase 1 del MVP

Alcance funcional y modelo de datos: [modelo-datos-mvp.md](./modelo-datos-mvp.md). Decisiones técnicas: [adr/](./adr/).

La fase 1 se divide en seis sprints. Cada uno termina con un entregable demostrable y se planifica y aprueba por separado.

## Decisiones de alcance

- Las tareas que el flujo completo define como automáticas (generar carta Vale Vista, enviar carta al gerente general, alertas pre-remate) son **manuales** en la fase 1. No hay cola de jobs, correo ni generación de documentos.
- El flujo de la fase 1 termina en «Registrar resultado». Las ramas posteriores (adjudicado, no adjudicado, reprogramado) quedan fuera.
- La reprogramación nace de un cambio de fecha detectado en `admin_new` (sprint 5) o de una suspensión con nueva fecha (sprint 2).
- Reglas del motor (admin omnipotente, suplente, plazos, suspensión): [ADR 0006](./adr/0006-reglas-del-motor.md).
- Suspender, reanudar y cancelar un workflow, y el historial a nivel de instancia, forman parte de la fase 1.
- `admin_new` no se modifica: los cambios se detectan comparando un hash de los valores de origen.

## Sprints

| Sprint                  | Contenido                                                                                                                                                                                                                                 | Entregable                                                                                | Estado    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 0. Fundaciones          | ADRs, estructura del repositorio, `apps/api` y `apps/web`, migración inicial de 17 tablas, seed de roles, esqueleto OpenAPI.                                                                                                              | La API arranca y valida su entorno; la base se crea desde SQL revisable; Angular compila. | Terminado |
| 1. Identidad            | Registro, login y logout, sesiones revocables, roles, autorización en backend; shell Angular con login y layout de la maqueta.                                                                                                            | Un usuario inicia sesión y un administrador asigna roles.                                 | Terminado |
| 2. Motor                | Seed de la plantilla (15 tareas manuales), inicio idempotente, activación por dependencias, responsables y suplentes, cálculo de `due_at`, completar tarea, suspender/reanudar/cancelar, historial; pruebas de concurrencia.              | El flujo completo corre por API con propiedades sintéticas y pruebas en verde.            | Terminado |
| 3. Pantallas de trabajo | Tablero de remates, Mis tareas, modal de tarea (en curso, evidencia, completar), detalle del workflow con participantes, plazos, suspender/reanudar/cancelar e historial. Sin porcentaje de avance.                                       | Un usuario recorre el flujo desde la interfaz.                                            | Terminado |
| 4. Sincronización       | Adaptador de solo lectura de `admin_new`, proceso separado del servidor HTTP, cursores, ejecuciones, incidencias y cambios de origen; pantalla «Sincronización» para ADMIN. Reglas en [ADR 0007](./adr/0007-sincronizacion-admin-new.md). | Una propiedad aceptada genera su workflow sola, sin duplicados.                           | Terminado |
| 5. Reprogramación       | Detección del cambio de fecha, recálculo de vencimientos abiertos, historial; demo de cierre.                                                                                                                                             | Cambiar la fecha en el origen recalcula los plazos y queda trazado.                       | Terminado |

El motor va antes que la sincronización porque puede probarse con datos sintéticos y concentra el mayor riesgo.

## `admin_new`

Estructura y formatos confirmados con una muestra de la copia local (13 nov 2026): ver [ADR 0007](./adr/0007-sincronizacion-admin-new.md).

- `clasificacion.id_clasif = 7` es «Aceptada».
- `propiedad`: `id_propiedad` INT; `id_clasif` INT indexado; no existe fecha de modificación.
- `dato_propiedad`: `id_p` es TEXT (con índice de prefijo); `r1` a `r5` son TEXT (fechas `AAAA-MM-DD`, monto `8.100.000`); `hora_garantia_desde` y `hora_garantia_hasta` son TIME.
- `datos_lremate`: motor MyISAM; `idp` es TEXT sin índice; `hora_remate` es TEXT (`HH:MM`, a veces `9:00`, `11.30` o vacío).
- `estado_remate`: `id_r` referencia `datos_lremate.id_dr`; el sincronizador lee `postor` y `pagador` del registro con mayor `id_er`.

## Decisiones de negocio que bloquean sprints

| Decisión                                                                                                                             | Bloquea                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Plazos definitivos por tarea (hoy, 3 días provisorios y editables por workflow)                                                      | No bloquea; se ajusta publicando una plantilla nueva                                              |
| Si las revisiones legales bloquean el avance                                                                                         | No bloquea; hoy solo bloquean el cierre                                                           |
| Estructura definitiva de los formularios de evidencia (hoy básicos de prueba)                                                        | No bloquea; se ajusta en `evidence-forms.ts` y una plantilla nueva si cambia qué tareas la exigen |
| Frecuencia del sincronizador, criterio para filas duplicadas, no iniciar remates ya ocurridos, hora 00:00 cuando falta `hora_remate` | No bloquea; hoy 60 s, fila de mayor id y las reglas provisorias del ADR 0007                      |
