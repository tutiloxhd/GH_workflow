const express = require('express');
const { pool } = require('./db');
const motor = require('./motor/motor');

const r = express.Router();
// Mientras no hay login, el usuario viaja en el header x-usuario-id. TODO: reemplazar por JWT.
const usuario = req => Number(req.header('x-usuario-id')) || null;
const ok = fn => (req, res, next) => fn(req, res).catch(next);

// Iniciar el flujo a mano (en producción lo hace el sincronizador con admin_new)
r.post('/propiedades/:id/iniciar', ok(async (req, res) => {
  res.status(201).json(await motor.iniciar(Number(req.params.id)));
}));

// Bandeja "Mis tareas"
r.get('/mis-tareas', ok(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.estado, t.activada_en, pt.codigo, pt.nombre, i.id AS instancia_id, p.ubicacion, p.comuna
       FROM tareas t
       JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
       JOIN instancias i ON i.id = t.instancia_id
       JOIN propiedades p ON p.id = i.propiedad_id
      WHERE t.asignado_a = ? AND t.estado IN ('pendiente','en_curso') AND i.estado = 'ACTIVO'
      ORDER BY t.activada_en`, [usuario(req)]);
  res.json(rows);
}));

// Completar una tarea. Body: { resultado: {...} }
r.post('/tareas/:id/completar', ok(async (req, res) => {
  res.json(await motor.completarTarea(Number(req.params.id), {
    usuarioId: usuario(req), resultado: (req.body && req.body.resultado) || {}
  }));
}));

r.post('/tareas/:id/reintentar', ok(async (req, res) => {
  await motor.reintentar(Number(req.params.id));
  res.json({ ok: true });
}));

// Flujo completo de una instancia (para el diagrama del frontend)
r.get('/instancias/:id', ok(async (req, res) => {
  const [[inst]] = await pool.query('SELECT * FROM instancias WHERE id = ?', [req.params.id]);
  if (!inst) return res.status(404).json({ error: 'No existe' });
  const [tareas] = await pool.query(
    `SELECT t.id, pt.codigo, pt.nombre, pt.tipo, pt.rama, t.estado, u.nombre AS asignado, t.completada_en, t.error
       FROM tareas t
       JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
       LEFT JOIN usuarios u ON u.id = t.asignado_a
      WHERE t.instancia_id = ? ORDER BY pt.orden`, [req.params.id]);
  res.json({ ...inst, tareas });
}));

r.get('/instancias/:id/historial', ok(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM historial WHERE instancia_id = ? ORDER BY id', [req.params.id]);
  res.json(rows);
}));

// Suspender / reanudar / cancelar. Body opcional: { motivo }
r.post('/instancias/:id/:accion(suspender|reanudar|cancelar)', ok(async (req, res) => {
  res.json(await motor.cambiarEstado(Number(req.params.id), req.params.accion, usuario(req),
    req.body && req.body.motivo));
}));

module.exports = r;
