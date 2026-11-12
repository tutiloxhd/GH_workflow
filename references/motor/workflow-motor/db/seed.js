// Crea las tablas, usuarios de ejemplo, la plantilla y 3 propiedades de prueba.
// ⚠ Borra las tablas del workflow. Solo para desarrollo.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const plantilla = require('./plantilla-remate');

async function seed() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true
  });
  const db = process.env.DB_NAME;
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4; USE \`${db}\`;`);
  await c.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  await c.query(
    `INSERT INTO usuarios (nombre, email, rol) VALUES
      ('María González','maria@grupohouse.cl','admin'),
      ('Juan Pérez','juan@grupohouse.cl','gestor'),
      ('Carla Rojas','carla@grupohouse.cl','gestor'),
      ('Diego Torres','diego@grupohouse.cl','postor'),
      ('Felipe Morales','felipe@grupohouse.cl','legal')`);

  const [p] = await c.query('INSERT INTO plantillas (nombre, version) VALUES (?, ?)',
    [plantilla.nombre, plantilla.version]);
  const ids = {};
  for (const [i, t] of plantilla.tareas.entries()) {
    const [r] = await c.query(
      `INSERT INTO plantilla_tareas (plantilla_id, codigo, nombre, tipo, rol, accion, rama, orden)
       VALUES (?,?,?,?,?,?,?,?)`,
      [p.insertId, t.codigo, t.nombre, t.tipo, t.rol, t.accion || null, t.rama || null, i + 1]);
    ids[t.codigo] = r.insertId;
  }
  for (const t of plantilla.tareas) {
    for (const dep of t.depende) {
      if (!ids[dep]) throw new Error(`${t.codigo} depende de ${dep}, que no existe`);
      await c.query('INSERT INTO plantilla_dependencias (tarea_id, depende_de_id) VALUES (?,?)',
        [ids[t.codigo], ids[dep]]);
    }
  }

  await c.query(
    `INSERT INTO propiedades (admin_new_id, ubicacion, comuna) VALUES
      (1001,'Casa Los Alerces 1450','Las Condes'),
      (1002,'Depto. San Martín 588','Santiago Centro'),
      (1003,'Casa El Roble 972','Ñuñoa')`);

  await c.end();
  console.log(`Base "${db}" lista: ${plantilla.tareas.length} tareas en la plantilla.`);
}

if (require.main === module) seed().catch(e => { console.error(e); process.exit(1); });
module.exports = seed;
