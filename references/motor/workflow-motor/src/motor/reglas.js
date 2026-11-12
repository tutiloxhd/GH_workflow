// Reglas especiales por código de tarea.
// La mayoría de las tareas no necesitan nada aquí: solo se completan.
// Úsalo cuando completar una tarea debe exigir datos o cambiar la instancia.
//
//   validar(resultado, ErrorMotor)  → lanza error si faltan datos
//   alCompletar(conexion, instancia, resultado) → efectos extra, dentro de la misma transacción

const RAMAS = ['ADJUDICADO', 'NO_ADJUDICADO', 'REPROGRAMADO'];

module.exports = {
  // Asignar gestor y postor: deja guardados los responsables del remate.
  s2: {
    validar(r, ErrorMotor) {
      if (!r.gestor_id || !r.postor_id) throw new ErrorMotor('Faltan gestor_id y postor_id');
    },
    async alCompletar(c, inst, r) {
      await c.query('UPDATE instancias SET gestor_id = ?, postor_id = ? WHERE id = ?',
        [r.gestor_id, r.postor_id, inst.id]);
    }
  },

  // Registrar resultado: elige la rama y cancela las otras dos.
  s16: {
    validar(r, ErrorMotor) {
      if (!RAMAS.includes(r.rama)) throw new ErrorMotor(`rama debe ser una de: ${RAMAS.join(', ')}`);
    },
    async alCompletar(c, inst, r) {
      await c.query('UPDATE instancias SET resultado = ? WHERE id = ?', [r.rama, inst.id]);
      await c.query(
        `UPDATE tareas t JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
            SET t.estado = 'cancelada'
          WHERE t.instancia_id = ? AND pt.rama IS NOT NULL AND pt.rama <> ?`,
        [inst.id, r.rama]);
    }
  }
};
