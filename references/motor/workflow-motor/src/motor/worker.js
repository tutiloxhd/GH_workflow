// Worker de tareas automáticas.
// Cada X segundos toma las tareas automáticas en 'pendiente', ejecuta su handler y las completa.
// No hace falta una tabla de jobs: la tabla `tareas` ya es la cola.
const { pool } = require('../db');
const motor = require('./motor');
const automatizaciones = require('../automatizaciones');

const MAX_INTENTOS = 3;

async function procesarAutomaticas(limite = 10) {
  // 1) Reservar tareas. SKIP LOCKED: si hay dos workers, no toman la misma.
  const c = await pool.getConnection();
  let tomadas;
  try {
    await c.beginTransaction();
    [tomadas] = await c.query(
      `SELECT t.id, t.instancia_id, pt.accion, pt.codigo
         FROM tareas t
         JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
         JOIN instancias i ON i.id = t.instancia_id
        WHERE pt.tipo = 'automatica' AND t.estado = 'pendiente' AND i.estado = 'ACTIVO'
        ORDER BY t.id
        LIMIT ?
        FOR UPDATE SKIP LOCKED`, [limite]);
    if (tomadas.length) {
      await c.query(`UPDATE tareas SET estado = 'en_curso', intentos = intentos + 1 WHERE id IN (?)`,
        [tomadas.map(t => t.id)]);
    }
    await c.commit();
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }

  // 2) Ejecutar cada una fuera de la transacción (puede tardar: PDF, email…).
  for (const t of tomadas) {
    try {
      const handler = automatizaciones[t.accion];
      if (!handler) throw new Error(`No existe handler para ${t.accion}`);
      const [[ctx]] = await pool.query(
        `SELECT i.*, p.ubicacion, p.comuna, p.fecha_remate, p.admin_new_id
           FROM instancias i JOIN propiedades p ON p.id = i.propiedad_id WHERE i.id = ?`, [t.instancia_id]);
      const resultado = await handler({ tareaId: t.id, instancia: ctx });
      await motor.completarTarea(t.id, { sistema: true, resultado: resultado || {} });
    } catch (e) {
      // Reintento: vuelve a 'pendiente' hasta MAX_INTENTOS; después queda 'fallida'.
      await pool.query(
        `UPDATE tareas SET estado = IF(intentos >= ?, 'fallida', 'pendiente'), error = ? WHERE id = ?`,
        [MAX_INTENTOS, String(e.message || e), t.id]);
      console.error(`[worker] ${t.codigo} (tarea ${t.id}) falló: ${e.message}`);
    }
  }
  return tomadas.length;
}

function iniciarWorker(intervaloMs = 5000) {
  let corriendo = false;
  setInterval(async () => {
    if (corriendo) return;            // no encimar vueltas
    corriendo = true;
    try { await procesarAutomaticas(); }
    catch (e) { console.error('[worker]', e.message); }
    finally { corriendo = false; }
  }, intervaloMs);
}

module.exports = { procesarAutomaticas, iniciarWorker };
