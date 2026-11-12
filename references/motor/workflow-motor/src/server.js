require('dotenv').config();
const express = require('express');
const routes = require('./routes');
const { iniciarWorker } = require('./motor/worker');
const { iniciarSync } = require('./integracion/syncAdminNew');

const app = express();
app.use(express.json());
app.use('/api', routes);

// Errores: los del motor traen su status (403, 409…); el resto es 500.
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Motor de workflow en http://localhost:${port}/api`));

iniciarWorker(Number(process.env.WORKER_INTERVALO_MS || 5000));
if (process.env.SYNC_ADMIN_NEW === '1') iniciarSync(Number(process.env.SYNC_INTERVALO_MS || 60000));
