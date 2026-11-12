// Demo de punta a punta, sin servidor HTTP: llama al motor directamente.
// Lleva 3 propiedades por el flujo completo, una por cada rama, y prueba las reglas.
//   npm run seed && npm run demo
const assert = require('assert');
const seed = require('../db/seed');
const { pool } = require('../src/db');
const motor = require('../src/motor/motor');
const { procesarAutomaticas } = require('../src/motor/worker');

const ADMIN = 1, GESTOR = 2, POSTOR = 4, LEGAL = 5;

async function abiertas(instanciaId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.asignado_a, pt.codigo, pt.tipo FROM tareas t
       JOIN plantilla_tareas pt ON pt.id = t.plantilla_tarea_id
      WHERE t.instancia_id = ? AND t.estado IN ('pendiente','en_curso') ORDER BY pt.orden`, [instanciaId]);
  return rows;
}

async function espera(promesa, status) {
  await assert.rejects(promesa, e => e.status === status);
}

async function correrFlujo(propiedadId, rama) {
  const { instanciaId } = await motor.iniciar(propiedadId);
  const repetido = await motor.iniciar(propiedadId);
  assert.strictEqual(repetido.creada, false, 'iniciar debe ser idempotente');
  console.log(`\n▶ Propiedad ${propiedadId} → flujo ${instanciaId} (rama ${rama})`);

  for (let vuelta = 1; vuelta < 50; vuelta++) {
    await procesarAutomaticas();                       // lo que haría el worker cada 5 s
    const pend = (await abiertas(instanciaId)).filter(t => t.tipo === 'manual');
    if (!pend.length) break;
    console.log(`  vuelta ${vuelta}: abiertas ${pend.map(t => t.codigo).join(', ')}`);

    for (const t of pend) {
      const resultado =
        t.codigo === 's2'  ? { gestor_id: GESTOR, postor_id: POSTOR } :
        t.codigo === 's16' ? { rama } : {};
      await motor.completarTarea(t.id, { usuarioId: t.asignado_a, resultado });
    }
  }
  const [[inst]] = await pool.query('SELECT estado, resultado FROM instancias WHERE id = ?', [instanciaId]);
  console.log(`  ✔ estado final: ${inst.estado} · resultado: ${inst.resultado}`);
  assert.strictEqual(inst.estado, 'TERMINADO');
  return instanciaId;
}

async function probarReglas(propiedadId) {
  console.log('\n▶ Reglas');
  const { instanciaId } = await motor.iniciar(propiedadId);
  const [s2] = await abiertas(instanciaId);

  await espera(motor.completarTarea(s2.id, { usuarioId: GESTOR }), 403);
  console.log('  ✔ un gestor no puede completar una tarea del admin');

  await espera(motor.completarTarea(s2.id, { usuarioId: ADMIN, resultado: {} }), 400);
  console.log('  ✔ s2 exige gestor_id y postor_id');

  await espera(motor.cambiarEstado(instanciaId, 'suspender', GESTOR), 403);
  await motor.cambiarEstado(instanciaId, 'suspender', LEGAL, 'Revisión de títulos');
  await espera(motor.completarTarea(s2.id, { usuarioId: ADMIN, resultado: { gestor_id: GESTOR, postor_id: POSTOR } }), 409);
  console.log('  ✔ suspendido: no se pueden completar tareas');

  await motor.cambiarEstado(instanciaId, 'reanudar', LEGAL);
  const r = await motor.completarTarea(s2.id, { usuarioId: ADMIN, resultado: { gestor_id: GESTOR, postor_id: POSTOR } });
  console.log(`  ✔ reanudado y s2 completada → se activan: ${r.activadas.join(', ')}`);
  assert.deepStrictEqual(r.activadas.sort(), ['s3', 's6', 's7']);

  await espera(motor.completarTarea(s2.id, { usuarioId: ADMIN }), 409);
  console.log('  ✔ una tarea no se completa dos veces');

  await motor.cambiarEstado(instanciaId, 'cancelar', LEGAL, 'Problema legal');
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) n FROM tareas WHERE instancia_id = ? AND estado IN ('bloqueada','pendiente')", [instanciaId]);
  assert.strictEqual(n, 0);
  console.log('  ✔ cancelado: todas las tareas abiertas quedan canceladas');
}

(async () => {
  await seed();
  await correrFlujo(1, 'ADJUDICADO');
  await correrFlujo(2, 'NO_ADJUDICADO');
  await pool.query(`INSERT INTO propiedades (admin_new_id, ubicacion, comuna) VALUES (1004,'Parcela Chicureo 18','Colina'),(1005,'Casa Mirador 777','Peñalolén')`);
  await correrFlujo(4, 'REPROGRAMADO');
  await probarReglas(3);
  console.log('\nTodo OK');
  await pool.end();
})().catch(async e => { console.error('\n✘', e); await pool.end(); process.exit(1); });
