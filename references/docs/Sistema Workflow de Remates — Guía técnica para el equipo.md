# Sistema Workflow de Remates — Guía técnica para el equipo

Nov 11, 2026 · @Nacholoz

Stack: **Angular + Node/Express + MySQL**. Base funcional: la maqueta [demo-web](https://tutiloxhd.github.io/demo-web/) (15 pasos, 3 ramas de resultado, suspender/cancelar, Mis tareas, Gestor de usuarios).

## 1. La idea en una frase

Cuando una propiedad pasa a **ACEPTADA**, el sistema copia una **plantilla de flujo** y crea las **tareas reales** de esa propiedad, cada una con responsable y fecha de vencimiento. Un **motor** desbloquea las tareas siguientes al completar una, ejecuta las automáticas y vigila los plazos.

## 1.1 Punto de inicio: la propiedad viene de admin\_new

La aceptación **no ocurre en este sistema**: ocurre en la base `admin_new` (otro sistema). El workflow solo **lee** esa base para saber cuándo una propiedad pasa a ACEPTADA, y ahí inicia el flujo.

**Cómo detectarlo: sincronizador por consulta periódica (recomendado)**

1. Un cron en el backend corre cada 1–5 min y consulta `admin_new` buscando propiedades en estado ACEPTADA que aún no tengan flujo.
2. Por cada una nueva: copia sus datos a `propiedades` (con `admin_new_id`) y llama a `workflow.iniciar()`.
3. `admin_new_id` es **UNIQUE** en `propiedades`: si el cron corre dos veces, no se crean dos flujos (idempotencia).
4. Se guarda la última fecha revisada en `sync_estado` (fuente, ultimo\_cambio\_visto, ultima\_ejecucion) para no releer todo cada vez.

**Reglas**

- Usuario MySQL de **solo lectura** sobre `admin_new`; el workflow nunca escribe ahí.
- La misma conexión del backend sirve: admin\_new se consulta con el prefijo de base (`admin_new.propiedad`).
- Si en `admin_new` la propiedad cambia después (fecha de remate, deja de estar aceptada), el mismo cron lo detecta: nueva fecha → se trata como REPROGRAMADO (recalcular plazos); deja de estar aceptada → se avisa a admin para suspender o cancelar.
- Si el cron falla, se registra el error y se reintenta en la siguiente vuelta; nada se pierde porque se vuelve a consultar el estado.

**Alternativas (descartadas por ahora)**

- *Trigger en admin\_new* que escriba en una tabla puente: más inmediato, pero requiere tocar el otro sistema.
- *Leer el binlog de MySQL (CDC)*: tiempo real, pero mucha infraestructura para este caso.

**Datos confirmados de admin\_new**

- Tabla `admin_new.propiedad`; una propiedad está aceptada cuando `id_clasif = 7`.
- Misma instancia MySQL que la base del workflow (llamada aquí `workflow`): se puede consultar entre bases directamente, sin segunda conexión.
- No existe fecha de modificación: se agrega (ver abajo).

**Paso 1: preparar admin\_new (una sola vez)**

```sql
-- Relación (sin claves foráneas; hoy la lógica está en el PHP):
--   propiedad.id_propiedad
--     ├── dato_propiedad.id_p   (PK: id_dato)
--     └── datos_lremate.idp     (PK: id_dr)

-- 1) Fecha de última modificación en las TRES tablas (MySQL la mantiene sola).
ALTER TABLE admin_new.propiedad
  ADD COLUMN updated_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_clasif (id_clasif),
  ADD INDEX idx_updated (updated_at);

ALTER TABLE admin_new.dato_propiedad
  ADD COLUMN updated_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_id_p (id_p),          -- sin FK no hay índice: el JOIN sería lento
  ADD INDEX idx_updated (updated_at);

ALTER TABLE admin_new.datos_lremate
  ADD COLUMN updated_at TIMESTAMP NOT NULL
    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_idp (idp),
  ADD INDEX idx_updated (updated_at);

-- 2) Usuario del workflow: solo lectura sobre las tres tablas
GRANT SELECT ON admin_new.propiedad      TO 'workflow_app'@'%';
GRANT SELECT ON admin_new.dato_propiedad TO 'workflow_app'@'%';
GRANT SELECT ON admin_new.datos_lremate  TO 'workflow_app'@'%';
```

Ojo: al crear la columna, todas las filas quedan con la fecha de hoy. No importa: la detección de nuevas no depende de ella.

**Paso 2: consultas del sincronizador**

Propiedades nuevas que entran al workflow (aceptadas y sin flujo todavía):

```sql
-- Sin FK nada impide filas duplicadas: se toma siempre la MÁS RECIENTE (mayor PK) de cada tabla hija.
SELECT p.id_propiedad, p.ubicacion, p.comuna, p.region,
       d.corte, d.tribunal, d.rol_normalizado,
       TIMESTAMP(d.r1, lr.hora_remate) AS fecha_hora_remate,
       d.r2, d.r3, d.r4, d.r5,
       d.hora_garantia_desde, d.hora_garantia_hasta
FROM admin_new.propiedad p
JOIN admin_new.dato_propiedad d
  ON d.id_dato = (SELECT MAX(id_dato) FROM admin_new.dato_propiedad WHERE id_p = p.id_propiedad)
LEFT JOIN admin_new.datos_lremate lr
  ON lr.id_dr = (SELECT MAX(id_dr) FROM admin_new.datos_lremate WHERE idp = p.id_propiedad)
LEFT JOIN workflow.propiedades w ON w.admin_new_id = p.id_propiedad
WHERE p.id_clasif = 7
  AND w.id IS NULL;
```

Cambios en propiedades que ya tienen flujo (ej. nueva fecha de remate):

```sql
SELECT p.id_propiedad, p.id_clasif,
       TIMESTAMP(d.r1, lr.hora_remate) AS fecha_hora_remate,
       d.r2, d.r3, d.r4, d.r5, d.hora_garantia_desde, d.hora_garantia_hasta,
       w.id AS propiedad_local_id
FROM admin_new.propiedad p
JOIN workflow.propiedades w ON w.admin_new_id = p.id_propiedad
JOIN admin_new.dato_propiedad d
  ON d.id_dato = (SELECT MAX(id_dato) FROM admin_new.dato_propiedad WHERE id_p = p.id_propiedad)
LEFT JOIN admin_new.datos_lremate lr
  ON lr.id_dr = (SELECT MAX(id_dr) FROM admin_new.datos_lremate WHERE idp = p.id_propiedad)
WHERE p.updated_at  > :ultimo_cambio_visto
   OR d.updated_at  > :ultimo_cambio_visto
   OR lr.updated_at > :ultimo_cambio_visto;   -- valor guardado en sync_estado
```

En ese resultado: si `id_clasif` ya no es 7 → avisar a admin (suspender/cancelar); si cambió `r1` → tratar como REPROGRAMADO y recalcular plazos; si cambió `r3`, `r4` o `r5` → recalcular solo las tareas que dependen de esa fecha.

**Mapeo admin\_new → workflow.propiedades**

| admin\_new | Significado | workflow.propiedades |
| --- | --- | --- |
| propiedad.id\_propiedad | id de origen | admin\_new\_id (UNIQUE) |
| propiedad.id\_clasif | 7 = aceptada | (solo se lee, no se copia) |
| propiedad.ubicacion | dirección | ubicacion |
| propiedad.comuna | comuna | comuna |
| propiedad.region | región | region |
| dato\_propiedad.corte | corte | corte |
| dato\_propiedad.tribunal | tribunal | tribunal |
| dato\_propiedad.rol\_normalizado | rol de la causa | rol\_causa |
| dato\_propiedad.r1 + datos\_lremate.hora\_remate | fecha y hora del remate | fecha\_remate (DATETIME) |
| dato\_propiedad.r2 | monto de la garantía | monto\_garantia |
| dato\_propiedad.r3 | fecha de pago (vencimiento) de la garantía | fecha\_pago\_garantia |
| dato\_propiedad.hora\_garantia\_desde / hasta | horario para pagar la garantía | garantia\_hora\_desde / garantia\_hora\_hasta |
| dato\_propiedad.r4 | fecha de devolución de la garantía | fecha\_devolucion\_garantia |
| dato\_propiedad.r5 | fecha de pago del saldo (adjudicación) | fecha\_pago\_saldo |

**Las fechas r1, r3, r4 y r5 son los puntos de referencia de los plazos:**

- **r1 (remate):** legal final, alertas, ingreso a sala, participar.
- **r3 (pago de la garantía):** todo el tramo del Vale Vista (pasos 3 a 9).
- **r4 (devolución):** rama NO ADJUDICADO → Recuperar garantía.
- **r5 (pago del saldo):** rama ADJUDICADO → Gestionar pago.

Así los plazos no se inventan: salen de las fechas que ya están en admin\_new. Y `r2` reemplaza el supuesto «10 % del mínimo» de la maqueta.

**Pendiente de confirmar**

- **Vencimiento de la garantía = `r3` + `hora_garantia_hasta`.** Las tareas del Vale Vista (pasos 3 a 9) cuentan hacia atrás desde ese momento, y el paso 9 solo se puede hacer entre `hora_garantia_desde` y `hora_garantia_hasta` de ese día.
- **Sin `hora_remate`** (no hay fila en datos\_lremate): el flujo se crea igual, se toma 00:00 y se deja a admin la tarea «Completar hora del remate». Lo mismo si falta `r1`.
- **Filas duplicadas:** como no hay FK, el sincronizador registra un aviso si una propiedad tiene más de una fila en dato\_propiedad o datos\_lremate (usa la más reciente).
- **Por confirmar:** ¿la fila más reciente (mayor PK) es siempre la vigente, o el PHP usa otro criterio?

## 2. Conceptos clave

| Concepto | Qué es | Ejemplo |
| --- | --- | --- |
| Plantilla | Definición del flujo: pasos, orden, rol, plazo. Se define una vez. | «Flujo remate judicial v1» |
| Instancia | El flujo de una propiedad concreta. | Flujo de «Casa Los Alerces 1450» |
| Tarea | Un paso de una instancia, con responsable, estado y vencimiento. | «Retirar Vale Vista» de esa casa |
| Tipo | `manual` (la hace una persona) o `automatica` (la hace el sistema). | Entregar VV en tribunal / Generar carta VV |
| Dependencia | Qué tareas deben terminar antes de que otra se active. | Entregar VV depende de Retirar VV |
| Plazo | Cuánto tiempo hay, medido desde un **punto de referencia**. | 1 h antes de la fecha del remate |
| Rama | Camino que se abre según el resultado. | Adjudicado / No adjudicado / Reprogramado |

## 3. El flujo (tomado de la maqueta)

| # | Tarea | Tipo | Rol | Depende de | Plazo (referencia) |
| --- | --- | --- | --- | --- | --- |
| 1 | Crear workflow | automática | sistema | — (evento ACEPTADA) | inmediato |
| 2 | Asignar gestor y postor | manual | admin | 1 | por definir |
| 3 | Generar carta Vale Vista | automática | sistema | 2 | inmediato |
| 4 | Enviar carta al GG (email) | automática | sistema | 3 | inmediato |
| 5 | GG envía carta al banco | manual | admin (GG) | 4 | por definir |
| 6 | Generar formulario | manual\* | gestor | 2 | por definir |
| 7 | Revisión legal pre-entrega | manual, **paralela** | legal | 2 | 1 h antes del paso 9 |
| 8 | Retirar Vale Vista | manual | gestor | 5 | por definir |
| 9 | Entregar VV + formulario en tribunal | manual | gestor | 6, 8 | antes de fecha\_remate (por definir) |
| 10 | Registrar evidencia (fotos timbradas) | manual | gestor | 9 | por definir |
| 11 | Revisión legal final | manual, **paralela** | legal | 10 | 1 h antes del remate |
| 12 | Preparar participación (link, monto) | manual | postor | 10 | por definir |
| 13 | Alertas pre-remate | automática | sistema | 12 | de 24 h a 15 min antes del remate |
| 14 | Ingresar a sala virtual | manual | postor | 12 | máx. 15 min antes del remate |
| 15 | Participar en remate | manual | postor | 14 | fecha\_remate |
| 16 | Registrar resultado → abre rama | manual | postor | 15 | por definir |

\* El paso 6 podría ser automático (generar el documento desde una plantilla). Decidir con negocio.

**Ramas tras el resultado**

- **ADJUDICADO:** Gestionar pago (gestor) → Marcar adjudicada (admin) → Crear proyecto (sistema o admin).
- **NO ADJUDICADO:** Recuperar garantía (gestor) → Registrar garantía: monto, banco, N° VV (gestor).
- **REPROGRAMADO:** Actualizar fecha (admin) → Recalcular plazos (**automática**) → Continuar workflow en la etapa vigente.

**Estados excepcionales (a nivel de instancia, no de tarea)**

- **SUSPENDIDO:** lo decide legal en cualquier paso; congela las tareas y se puede reanudar.
- **CANCELADO:** cierra el flujo; no se reanuda.

## 4. Qué cambia respecto a la maqueta

La maqueta simplifica cosas que el sistema real debe resolver:

- **Varias tareas abiertas a la vez.** Legal (7 y 11) corre en paralelo; por eso se modelan **dependencias**, no un número de paso lineal (`flowStage`).
- **Un plazo por tarea**, no uno por remate (`dueAt`). Cada tarea calcula su `vence_en` al crearse.
- **Plazos relativos a la fecha del remate.** Así, al reprogramar, «Recalcular plazos» solo reemplaza la fecha y recalcula.
- **Historial real** de quién completó qué y cuándo (la maqueta solo guarda la última).
- **Login y permisos por rol** (hoy no hay sesión).
- El estado del remate (BIEN / ALERTA / ATRASADO) **se deriva** de sus tareas abiertas; no se guarda a mano.

## 5. Modelo de datos (MySQL)

**Definición (plantilla)**

- `flujo_plantillas` (id, nombre, version, activa)
- `plantilla_tareas` (id, plantilla\_id, codigo \[`s9`, `17A`…\], nombre, descripcion, tipo \[manual/automatica\], rol, accion \[ej. `GENERAR_CARTA_VV`\], plazo\_minutos, plazo\_referencia \[inicio\_tarea / r1 remate / r3 pago garantía / r4 devolución / r5 pago saldo\], rama \[null/ADJUDICADO/…\], bloquea\_avance \[bool\])
- `plantilla_dependencias` (tarea\_id, depende\_de\_id)

**Ejecución**

- `propiedades` (id, admin\_new\_id \[UNIQUE\], ubicacion, comuna, region, corte, tribunal, rol\_causa, fecha\_remate (DATETIME), monto\_garantia, fecha\_pago\_garantia, garantia\_hora\_desde, garantia\_hora\_hasta, fecha\_devolucion\_garantia, fecha\_pago\_saldo, estado)
- `flujo_instancias` (id, propiedad\_id, plantilla\_id, estado \[ACTIVO/SUSPENDIDO/CANCELADO/TERMINADO\], resultado, gestor\_id, postor\_id, gestor\_suplente\_id, postor\_suplente\_id, creado\_en)
- `tareas` (id, instancia\_id, plantilla\_tarea\_id, estado, asignado\_a, suplente\_id, vence\_en, iniciada\_en, completada\_en, completada\_por, resultado\_json)
- `tarea_historial` (id, tarea\_id, usuario\_id, accion, detalle\_json, fecha)
- `documentos` (id, propiedad\_id, tarea\_id, nombre, tipo, estado, url)
- `jobs` (id, tipo, tarea\_id, ejecutar\_en, estado, intentos, error) — descartada en la implementación: la tabla tareas hace de cola (ver README del motor)

**Usuarios**

- `usuarios` (id, nombre, email, password\_hash, rol, activo)

**Estados de una tarea:** `bloqueada → pendiente → en_curso → completada`, más `vencida`, `fallida` (automáticas) y `cancelada`.

## 6. El motor: reglas

1. **El sincronizador detecta una propiedad ACEPTADA en admin\_new:** en una transacción se crea la instancia y **todas** las tareas de la plantilla (sin las ramas) en `bloqueada`.
2. **Activar:** toda tarea cuyas dependencias estén completas pasa a `pendiente` y se calcula `vence_en`.
3. **Manual:** aparece en *Mis tareas* del responsable. **Automática:** `queda pendiente y la ejecuta el worker (la tabla tareas es la cola; no hay tabla de jobs)`.
4. **Completar:** se guarda historial y se repite el paso 2 para desbloquear las siguientes.
5. **Registrar resultado:** se crean las tareas de la rama elegida.
6. **Cron (cada 1–5 min):** ejecuta `jobs` vencidos, marca tareas `vencida`, envía alertas y recalcula el estado del remate.
7. **Suspender/Cancelar:** cambia el estado de la instancia; con SUSPENDIDO ninguna tarea se puede completar.

**Quién responde por una tarea** (igual que la maqueta): asignado a mano → gestor/postor de la instancia → primer usuario activo del rol → un admin.

**Estado del remate:** ATRASADO si hay alguna tarea vencida; ALERTA si alguna vence en menos de X horas; si no, BIEN.

## 7. Estructura del código

**Backend (Express)**

```
src/
  modules/
    auth/            login, JWT, middleware de rol
    usuarios/
    propiedades/     copia local de las propiedades (solo lectura; el estado manda admin_new)
    integracion/     sincronizador admin_new: detecta ACEPTADAS → workflow.iniciar()
    workflow/        motor: iniciar, activarSiguientes, completar, elegirRama, suspender, cancelar
    tareas/          bandeja, reasignar, en curso, adjuntos
    documentos/
  automatizaciones/  un archivo por acción: generarCartaVV.js, enviarCartaGG.js, alertasPreRemate.js, recalcularPlazos.js
  scheduler/         node-cron: procesa jobs, vencimientos, alertas
  db/                conexión (mysql2 o un ORM como Prisma/Sequelize), migraciones, seed de la plantilla
```

**Endpoints principales**

- `GET /propiedades (no hay PATCH de estado: lo define admin_new)`
- `GET /tareas/mias` · `POST /tareas/:id/completar` · `PATCH /tareas/:id` (reasignar, en curso, bloquear)
- `GET /instancias/:id` (flujo completo para el diagrama) · `POST /instancias/:id/resultado` · `POST /instancias/:id/suspender|reanudar|cancelar`

**Frontend (Angular)** — una pantalla por cada una de la maqueta:

- Tablero (inicio) · Detalle + diagrama del flujo · Mis tareas · Calendario semanal · Documentos · Reportes · Gestor de usuarios
- Servicios: `AuthService`, `PropiedadesService`, `TareasService`, `WorkflowService`; guards por rol.

## 8. Plan por fases

1. **Base:** proyecto, migraciones, login, usuarios y propiedades. Seed con la plantilla de la sección 3.
2. **Motor:** sincronizador con admin\_new que inicia el flujo, dependencias, completar tareas manuales. Pantallas Mis tareas y Detalle.
3. **Automático:** cola `jobs` + cron, generar y enviar carta VV, vencimientos y estado del remate.
4. **Resultado y excepciones:** ramas, suspender/cancelar, reprogramar con recálculo de plazos.
5. **Resto de pantallas:** tablero, calendario, documentos, reportes, alertas por email.
6. **Después:** editor visual de plantillas (no hace falta al inicio: la plantilla vive en el seed).

## 9. Pendiente de definir con negocio

- Plazo de cada paso marcado «por definir» y desde qué referencia se mide.
- ¿El paso 6 (formulario) y el 3 (carta VV) son siempre automáticos?
- ¿Las revisiones legales bloquean el avance o solo pueden suspender? (la maqueta dice que no bloquean).
- Cuándo un remate pasa a ALERTA (¿cuántas horas antes de vencer?).
- Garantía del Vale Vista: ¿siempre 10 % del mínimo?
- Mecanismo de pago en ADJUDICADO y qué es «Crear proyecto».
