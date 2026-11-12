// Sincronizador con admin_new: detecta propiedades aceptadas (id_clasif = 7) sin flujo y lo inicia.
// admin_new está en el mismo servidor MySQL, así que se consulta con el prefijo de base.
// Es idempotente: si corre dos veces, propiedades.admin_new_id (UNIQUE) y motor.iniciar() evitan duplicados.
const { pool } = require('../db');
const motor = require('../motor/motor');

async function sincronizar() {
  const [nuevas] = await pool.query(
    `SELECT p.id_propiedad, p.ubicacion, p.comuna,
            TIMESTAMP(d.r1, lr.hora_remate) AS fecha_remate
       FROM admin_new.propiedad p
       LEFT JOIN admin_new.dato_propiedad d
              ON d.id_dato = (SELECT MAX(id_dato) FROM admin_new.dato_propiedad WHERE id_p = p.id_propiedad)
       LEFT JOIN admin_new.datos_lremate lr
              ON lr.id_dr = (SELECT MAX(id_dr) FROM admin_new.datos_lremate WHERE idp = p.id_propiedad)
       LEFT JOIN propiedades w ON w.admin_new_id = p.id_propiedad
      WHERE p.id_clasif = 7 AND w.id IS NULL`);

  for (const p of nuevas) {
    const [r] = await pool.query(
      `INSERT INTO propiedades (admin_new_id, ubicacion, comuna, fecha_remate) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [p.id_propiedad, p.ubicacion, p.comuna, p.fecha_remate]);
    const { instanciaId } = await motor.iniciar(r.insertId);
    console.log(`[sync] propiedad ${p.id_propiedad} → flujo ${instanciaId}`);
  }
  // TODO: segunda consulta con updated_at para detectar cambios (ver doc, sección 1.1).
  return nuevas.length;
}

function iniciarSync(intervaloMs = 60000) {
  setInterval(() => sincronizar().catch(e => console.error('[sync]', e.message)), intervaloMs);
}

module.exports = { sincronizar, iniciarSync };
