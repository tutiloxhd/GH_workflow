// ═══════════════════════════════════════════════════════════════════
//  MOTOR DEL WORKFLOW
//  No conoce los pasos del remate: solo lee la plantilla y aplica 4 reglas.
//
//   1. iniciar()            crea la instancia y TODAS sus tareas en 'bloqueada'
//   2. activarSiguientes()  pasa a 'pendiente' las tareas con dependencias completas
//   3. completarTarea()     marca completada y vuelve a llamar a activarSiguientes()
//   4. verificarFin()       sin tareas abiertas → instancia TERMINADO
//
//  Todo ocurre dentro de una transacción con la instancia bloqueada (FOR UPDATE),
//  así dos personas completando tareas a la vez no rompen el estado.
// ═══════════════════════════════════════════════════════════════════
const { pool, transaccion } = require('../db');
const REGLAS = require('./reglas');

const ABIERTAS = ['bloqueada', 'pendiente', 'en_curso', 'fallida'];

class ErrorMotor extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

async function registrar(c, instanciaId, accion, { tareaId = null, usuarioId = null, detalle = null } = {}) {
  await c.query(
    'INSERT INTO historial (instancia_id, tarea_id, usuario_id, accion, detalle) VALUES (?,?,?,?,?)',
    [instanciaId, tareaId, usuarioId, accion, detalle ? JSON.stringify(detalle) : null]
  );
}

// ── 1. Iniciar ──────────────────────────────────────────────────────
// Idempotente: si la propiedad ya tiene flujo, devuelve el existente.
async function iniciar(propiedadId) {
  return transaccion(async c => {
    const [[existente]] = await c.query('SELECT id FROM instancias WHERE propiedad_id = ?', [propiedadId]);
    if (existente) return { instanciaId: existente.id, creada: false };

    const [[plantilla]] = await c.query(
      'SELECT id FROM plantillas WHERE activa = 1 ORDER BY version DESC LIMIT 1');
    if (!plantilla) throw new ErrorMotor('No hay plantilla activa', 500);

    const [ins] = await c.query(
      'INSERT INTO instancias (propiedad_id, plantilla_id) VALUES (?, ?)', [propiedadId, plantilla.id]);
    const instanciaId = ins.insertId;

    // Copia la plantilla: una tarea real por cada paso, todas bloqueadas.
    await c.query(
      `INSERT INTO tareas (instancia_id, plantilla_tarea_id, estado)
       SELECT ?, id, 'bloqueada' FROM plantilla_tareas WHERE plantilla_id = ?`,
      [instanciaId, plantilla.id]);

    await registrar(c, instanciaId, 'instancia_creada', { detalle: { propiedadId } });
    await activarSiguientes(c, instanciaId);
    return { instanciaId, creada: true };
  });
}

// ── 2. Activar siguientes ───────────────────────────────────────────
// Busca tareas 'bloqueada' cuyas dependencias estén TODAS completadas.
// Las de rama solo se activan si la rama coincide con el resultado de la instancia.
async function activarSiguientes(c, instanciaId) {
  const [[inst]] = await c.query('SELECT * FROM instancias WHERE id = ?', [instanciaId]);

  const [listas] = await c.query(
    `SELECT t.id, pt.codigo, pt.tipo, pt.rol
       FROM tareas t
       JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
      WHERE t.instancia_id = ?
        AND t.estado = 'bloqueada'
        AND (pt.rama IS NULL OR pt.rama = ?)
        AND NOT EXISTS (
              SELECT 1
                FROM plantilla_dependencias d
                JOIN tareas t2 ON t2.plantilla_tarea_id = d.depende_de_id
                              AND t2.instancia_id = t.instancia_id
               WHERE d.tarea_id = pt.id
                 AND t2.estado <> 'completada')`,
    [instanciaId, inst.resultado]);

  for (const t of listas) {
    const asignado = await resolverResponsable(c, inst, t.rol);
    // TODO fechas: aquí se calculará vence_en según la plantilla.
    await c.query(
      `UPDATE tareas SET estado = 'pendiente', asignado_a = ?, activada_en = NOW() WHERE id = ?`,
      [asignado, t.id]);
    await registrar(c, instanciaId, 'tarea_activada', { tareaId: t.id, detalle: { codigo: t.codigo, asignado } });
  }
  // Las automáticas quedan 'pendiente' y el worker las toma solo.
  return listas.map(t => t.codigo);
}

// Quién responde por una tarea (mismo orden que la maqueta).
async function resolverResponsable(c, inst, rol) {
  if (rol === 'sistema') return null;
  if (rol === 'gestor' && inst.gestor_id) return inst.gestor_id;
  if (rol === 'postor' && inst.postor_id) return inst.postor_id;
  const [[u]] = await c.query(
    'SELECT id FROM usuarios WHERE rol = ? AND activo = 1 ORDER BY id LIMIT 1', [rol]);
  if (u) return u.id;
  const [[admin]] = await c.query(
    "SELECT id FROM usuarios WHERE rol = 'admin' AND activo = 1 ORDER BY id LIMIT 1");
  return admin ? admin.id : null;
}

// ── 3. Completar tarea ──────────────────────────────────────────────
// usuarioId: quién la completa (null + sistema=true para el worker).
// resultado: datos que deja la tarea (ej. { rama: 'ADJUDICADO' }).
async function completarTarea(tareaId, { usuarioId = null, resultado = {}, sistema = false } = {}) {
  return transaccion(async c => {
    const [[ref]] = await c.query('SELECT instancia_id FROM tareas WHERE id = ?', [tareaId]);
    if (!ref) throw new ErrorMotor('Tarea no existe', 404);

    // Bloquea la instancia: nadie más la modifica hasta el commit.
    const [[inst]] = await c.query('SELECT * FROM instancias WHERE id = ? FOR UPDATE', [ref.instancia_id]);
    const [[t]] = await c.query(
      `SELECT t.*, pt.codigo, pt.tipo FROM tareas t
         JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
        WHERE t.id = ? FOR UPDATE`, [tareaId]);

    if (inst.estado !== 'ACTIVO') throw new ErrorMotor(`El flujo está ${inst.estado}`, 409);
    if (!['pendiente', 'en_curso'].includes(t.estado)) throw new ErrorMotor(`La tarea está ${t.estado}`, 409);

    if (!sistema) {
      if (t.tipo === 'automatica') throw new ErrorMotor('Las tareas automáticas las completa el sistema', 403);
      const [[u]] = await c.query('SELECT id, rol FROM usuarios WHERE id = ? AND activo = 1', [usuarioId]);
      if (!u) throw new ErrorMotor('Usuario no válido', 401);
      if (t.asignado_a !== u.id && u.rol !== 'admin') throw new ErrorMotor('La tarea no es tuya', 403);
    }

    const regla = REGLAS[t.codigo];
    if (regla && regla.validar) regla.validar(resultado, ErrorMotor);

    await c.query(
      `UPDATE tareas SET estado = 'completada', completada_en = NOW(), completada_por = ?, resultado = ?, error = NULL
        WHERE id = ?`,
      [usuarioId, JSON.stringify(resultado || {}), tareaId]);

    if (regla && regla.alCompletar) await regla.alCompletar(c, inst, resultado);

    await registrar(c, inst.id, 'tarea_completada', { tareaId, usuarioId, detalle: { codigo: t.codigo, resultado } });
    const activadas = await activarSiguientes(c, inst.id);
    const terminado = await verificarFin(c, inst.id);
    return { activadas, terminado };
  });
}

// ── 4. Fin ──────────────────────────────────────────────────────────
async function verificarFin(c, instanciaId) {
  const [[{ abiertas }]] = await c.query(
    `SELECT COUNT(*) AS abiertas FROM tareas WHERE instancia_id = ? AND estado IN (?)`,
    [instanciaId, ABIERTAS]);
  if (abiertas > 0) return false;
  await c.query(
    "UPDATE instancias SET estado = 'TERMINADO', terminado_en = NOW() WHERE id = ? AND estado = 'ACTIVO'",
    [instanciaId]);
  await registrar(c, instanciaId, 'instancia_terminada');
  return true;
}

// ── Estados excepcionales ───────────────────────────────────────────
const TRANSICIONES = {
  suspender: { desde: ['ACTIVO'], hacia: 'SUSPENDIDO' },
  reanudar:  { desde: ['SUSPENDIDO'], hacia: 'ACTIVO' },
  cancelar:  { desde: ['ACTIVO', 'SUSPENDIDO'], hacia: 'CANCELADO' }
};

async function cambiarEstado(instanciaId, accion, usuarioId, motivo = null) {
  const tr = TRANSICIONES[accion];
  if (!tr) throw new ErrorMotor('Acción no válida');
  return transaccion(async c => {
    const [[u]] = await c.query('SELECT rol FROM usuarios WHERE id = ? AND activo = 1', [usuarioId]);
    if (!u || !['admin', 'legal'].includes(u.rol)) throw new ErrorMotor('Solo admin o legal', 403);
    const [[inst]] = await c.query('SELECT * FROM instancias WHERE id = ? FOR UPDATE', [instanciaId]);
    if (!inst) throw new ErrorMotor('Instancia no existe', 404);
    if (!tr.desde.includes(inst.estado)) throw new ErrorMotor(`No se puede ${accion} un flujo ${inst.estado}`, 409);

    await c.query('UPDATE instancias SET estado = ? WHERE id = ?', [tr.hacia, instanciaId]);
    if (tr.hacia === 'CANCELADO') {
      await c.query(`UPDATE tareas SET estado = 'cancelada' WHERE instancia_id = ? AND estado IN (?)`,
        [instanciaId, ABIERTAS]);
    }
    await registrar(c, instanciaId, `instancia_${accion}`, { usuarioId, detalle: { motivo } });
    return { estado: tr.hacia };
  });
}

// Una automática que falló 3 veces queda 'fallida'; admin la reintenta.
async function reintentar(tareaId) {
  const [r] = await pool.query(
    "UPDATE tareas SET estado = 'pendiente', intentos = 0, error = NULL WHERE id = ? AND estado = 'fallida'",
    [tareaId]);
  if (!r.affectedRows) throw new ErrorMotor('La tarea no está fallida', 409);
}

module.exports = { iniciar, completarTarea, cambiarEstado, reintentar, ErrorMotor };
