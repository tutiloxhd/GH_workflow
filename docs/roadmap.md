# Roadmap del MVP — Workflow de Remates

Documento vivo con el estado del proyecto y el camino al MVP definitivo. El backlog semanal vive en [backlog-semana.md](./backlog-semana.md); cada historia apunta a un ítem de este roadmap y ambos se actualizan en el mismo cambio.

Referencias: [modelo de datos](./modelo-datos-mvp.md), [ADRs](./adr/), [plan de pruebas](./plan-de-pruebas.md), [cómo levantar el proyecto](../LEVANTAR-PROYECTO.md).

**Estados:** Terminado · En curso · Siguiente · Pendiente · Bloqueado (espera una decisión).

## 1. Fase 1 — Terminada

El flujo corre de punta a punta: una propiedad aceptada en `admin_new` crea su workflow, los usuarios lo trabajan desde la interfaz y los cambios de fecha recalculan los plazos.

| Sprint | Entregable |
| --- | --- |
| 0. Fundaciones | Repositorio `apps/api` + `apps/web`, migraciones, OpenAPI, ADRs 0001–0004. |
| 1. Identidad | Login, sesiones de 8 h, roles, bloqueo por fuerza bruta; solo el admin crea cuentas. |
| 2. Motor | Plantilla base actual de 13 tareas, dependencias, responsables y suplentes, plazos, suspender/reanudar/cancelar, historial (ADR 0006 y ADR 0015). |
| 3. Pantallas | Inicio, Mis tareas, modal de tarea con evidencia básica, detalle del workflow. |
| 4. Sincronización | Lectura de solo lectura de `admin_new`, proceso aparte, pantalla «Sincronización» (ADR 0007). |
| 5. Reprogramación | Cambios de fecha en `admin_new` recalculan los plazos abiertos y quedan trazados (RP-01 a RP-18). |

Decisiones de alcance que siguen vigentes:

- Las tareas automáticas del flujo (carta Vale Vista, carta al gerente general, alertas pre-remate) son **manuales** hasta el hito B.
- El flujo termina en «Registrar resultado»; las ramas posteriores son del hito B.
- `admin_new` nunca se modifica; el sistema solo lo lee.
- Las reglas de negocio que viven en `admin_new` (como la elección de gestor y postor) **no se replican**: el workflow lee su resultado.

## 2. Camino al MVP definitivo

### Hito A — Personas desde admin_new, notificaciones, «Ver flujo» y base para producción

| ID | Ítem | Estado |
| --- | --- | --- |
| A1 | Gestor y postor de cada propiedad leídos desde `admin_new` | Terminado |
| A2 | Migrar los usuarios de `gh_agente_zona` al workflow con sus roles | En curso |
| A3 | Desactivar en el workflow a los usuarios que salen de `gh_agente_zona` | Siguiente |
| A4 | Reasignar tareas abiertas cuando cambia el gestor o el postor en `admin_new` | Siguiente |
| A5 | Centro de notificaciones: motor, bandeja en la aplicación y configuración general | Siguiente |
| A6 | Búsqueda y filtros en el tablero de remates | Pendiente |
| A7 | Revisión responsive (teléfono, tablet, escritorio) | Pendiente |
| A8 | CI: typecheck, lint, pruebas y build | Pendiente |
| A9 | Ambiente de QA con usuario de solo SELECT sobre `admin_new`, API y sincronizador permanentes | Pendiente |
| A10 | `sql/workflow_mvp.sql` al día con la migración 0005 | Pendiente |
| A11 | Pantalla «Ver flujo» para ADMIN: propiedades en flujo, resumen y vista aérea (miniatura placeholder) | Siguiente |
| HU-13 | Plantilla base del remate judicial de 13 pasos, reinicio local/desarrollo y pruebas asociadas | En curso |

### Hito B — Flujo completo

| ID | Ítem | Estado |
| --- | --- | --- |
| B1 | Ramas después del resultado: adjudicado, no adjudicado, reprogramado | Bloqueado (N5) |
| B2 | Plazos definitivos por tarea (plantilla nueva) | Bloqueado (N2) |
| B3 | Formularios de evidencia definitivos | Bloqueado (N3) |
| B4 | Revisiones legales: bloquean o no el avance | Bloqueado (N4) |
| B5 | Qué pasa con el workflow cuando la propiedad deja de estar aceptada | Bloqueado (N6) |
| B6 | Cola de jobs y scheduler (ADR) | Pendiente |
| B7 | Tareas automáticas: carta Vale Vista, carta al gerente, alertas pre-remate | Pendiente (requiere B6) |

### Hito C — Documentos y notificaciones

| ID | Ítem | Estado |
| --- | --- | --- |
| C1 | Almacenamiento documental (ADR) | Pendiente |
| C2 | Subida de archivos y fotos timbradas en la evidencia | Pendiente (requiere C1) |
| C3 | Documentos versionados por workflow | Pendiente (requiere C1) |
| C4 | Canal de correo para el motor de notificaciones | Pendiente (requiere A5) |
| C5 | Fotos de la propiedad en «Ver flujo» cuando `admin_new` las guarde | Pendiente |

### Hito D — Pantallas y acceso

| ID | Ítem | Estado |
| --- | --- | --- |
| D1 | Calendario de remates | Pendiente |
| D2 | Reportes: atrasos por responsable, estado de remates | Pendiente |
| D3 | Recuperar y cambiar contraseña | Pendiente |
| D4 | Login único con las credenciales de `admin_new` o propio | Bloqueado (N7) |

### Hito E — Salida a producción

| ID | Ítem | Estado |
| --- | --- | --- |
| E1 | Despliegue y ambiente de producción (ADR) | Pendiente (requiere A9) |
| E2 | Respaldos de la base `workflow` | Pendiente |
| E3 | Logs centralizados, monitoreo y alerta si el sincronizador falla | Pendiente |
| E4 | Lectura incremental si `admin_new` agrega fecha de modificación | Pendiente |
| E5 | Pruebas end-to-end en el navegador | Pendiente |
| E6 | Revisión de seguridad | Pendiente |
| E7 | Manual de usuario | Pendiente |
| E8 | Demo de cierre y aceptación de negocio | Pendiente |

## 3. Decisiones de negocio pendientes

Ningún agente ni desarrollador las decide por su cuenta.

| ID | Decisión | Hoy (provisorio) | Desbloquea |
| --- | --- | --- | --- |
| N1 | Reglas de sincronización: frecuencia, fila duplicada, remates ya ocurridos, hora faltante | 60 s; fila de mayor id; no se inicia; 00:00 (ADR 0007) | Cierre de A9 |
| N2 | Plazo de cada tarea | 3 días, editable por workflow | B2 |
| N3 | Campos de cada formulario de evidencia | Básicos, solo para probar | B3, C2 |
| N4 | Si las revisiones legales bloquean el avance | Solo bloquean el cierre | B4 |
| N5 | Reglas de las ramas adjudicado, no adjudicado y reprogramado | Fuera de alcance | B1 |
| N6 | Workflow de una propiedad que deja de estar aceptada | Aviso pendiente para el admin | B5 |
| N7 | Origen del login | Cuentas propias del workflow | D4 |
| N8 | Anticipación por defecto de «por vencer» y tipos de notificación activos | Por definir | A5 |

## 4. Backlog de la semana

El backlog de la semana en curso está en [backlog-semana.md](./backlog-semana.md) y sus casos de prueba en [pruebas-backlog-semana.md](./pruebas-backlog-semana.md).

Semana del 16 al 20 nov 2026: HU-06, HU-07 y HU-08 (A2 a A4), HU-09 (A5) y HU-12 (A11); llevar a negocio N1, N5, N6 y N8.
