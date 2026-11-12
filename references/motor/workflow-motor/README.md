# Motor de workflow de remates

Motor mínimo y funcional en Node, Express y MySQL. Todavía no maneja fechas ni plazos: el objetivo es que el flujo avance solo y bien.

## Cómo funciona (en 4 reglas)

```
admin_new (id_clasif = 7)
      │  sincronizador (cada 1 min)
      ▼
motor.iniciar()  ──► crea la instancia + TODAS las tareas en 'bloqueada'
      │
      ▼
activarSiguientes()  ──► las tareas con dependencias completas pasan a 'pendiente'
      │                    • manual     → aparece en /mis-tareas del responsable
      │                    • automática → el worker la ejecuta (cada 5 s)
      ▼
completarTarea()  ──► 'completada' → vuelve a activarSiguientes()
      │
      ▼
verificarFin()  ──► sin tareas abiertas → instancia TERMINADO
```

- **El motor no conoce los pasos del remate.** Solo lee la plantilla (`db/plantilla-remate.js`). Para agregar, quitar o reordenar un paso se edita ese archivo y se corre `npm run seed`.
- **Las tareas en paralelo salen solas de las dependencias.** Al completar `s2` se activan `s3`, `s6` y `s7` al mismo tiempo, porque las tres dependen solo de `s2`.
- **Ramas:** las tareas de las tres ramas se crean desde el inicio. Al registrar el resultado (`s16`) se activa la rama elegida y las otras dos quedan `cancelada`.
- **No hay tabla de jobs:** la tabla `tareas` funciona como cola. El worker toma las tareas automáticas en `pendiente` con `FOR UPDATE SKIP LOCKED`. Si una falla, se reintenta 3 veces y después queda `fallida`.
- **Concurrencia:** cada operación corre en una transacción que bloquea la instancia (`FOR UPDATE`).

## Archivos

| Archivo | Qué hace |
|---|---|
| `db/schema.sql` | Tablas: la definición (plantilla) y la ejecución (instancias, tareas, historial) |
| `db/plantilla-remate.js` | **El flujo.** Los 15 pasos y las 3 ramas, con sus dependencias |
| `db/seed.js` | Crea las tablas y carga usuarios, la plantilla y propiedades de prueba |
| `src/motor/motor.js` | **El motor:** iniciar, activar, completar, suspender, reanudar y cancelar |
| `src/motor/reglas.js` | Reglas especiales por paso (`s2` guarda gestor y postor; `s16` elige la rama) |
| `src/motor/worker.js` | Ejecuta las tareas automáticas |
| `src/automatizaciones/index.js` | Una función por cada tarea automática (hoy simuladas) |
| `src/integracion/syncAdminNew.js` | Lee `admin_new` e inicia los flujos |
| `src/routes.js` | API REST |
| `test/demo.js` | Lleva 3 propiedades por el flujo completo (una por rama) y prueba las reglas |

## Probarlo

```bash
cp .env.example .env      # completar datos de MySQL (el usuario necesita crear tablas)
npm install
npm run demo              # crea la base, corre el flujo completo y verifica las reglas
npm start                 # API en http://localhost:3000/api
```

## API

Mientras no haya login, el usuario se envía en el header `x-usuario-id`.

| Método | Ruta | Para qué |
|---|---|---|
| POST | `/api/propiedades/:id/iniciar` | Iniciar un flujo a mano (en producción lo hace el sincronizador) |
| GET | `/api/mis-tareas` | Bandeja del usuario |
| POST | `/api/tareas/:id/completar` | Body `{ "resultado": {...} }`. `s2` exige `gestor_id` y `postor_id`; `s16` exige `rama` |
| POST | `/api/tareas/:id/reintentar` | Volver a lanzar una automática que quedó `fallida` |
| GET | `/api/instancias/:id` | Flujo completo con el estado de cada tarea (para el diagrama) |
| GET | `/api/instancias/:id/historial` | Quién hizo qué y cuándo |
| POST | `/api/instancias/:id/suspender` · `reanudar` · `cancelar` | Solo admin o legal |

```bash
curl -X POST localhost:3000/api/tareas/1/completar \
  -H 'x-usuario-id: 1' -H 'content-type: application/json' \
  -d '{"resultado":{"gestor_id":2,"postor_id":4}}'
```

## Cómo extenderlo

- **Nuevo paso:** se agrega en `plantilla-remate.js` con sus `depende`.
- **Nueva automatización:** se le pone `tipo: 'automatica'` y una `accion: 'MI_ACCION'` en la plantilla, y se agrega `MI_ACCION` en `src/automatizaciones/index.js`.
- **Un paso que exige datos al completarse:** se agrega su código en `src/motor/reglas.js`.

## Pendiente (siguientes etapas)

- Plazos: calcular `vence_en` en `activarSiguientes()` y un cron que marque las tareas vencidas.
- Login con JWT, en reemplazo de `x-usuario-id`.
- Rama Reprogramado: `17E` debería volver a abrir los pasos que correspondan (hoy solo cierra el flujo).
- Sincronizador: detectar cambios con `updated_at`.
- Versiones de la plantilla: las instancias que ya existen siguen con su `plantilla_id`.
