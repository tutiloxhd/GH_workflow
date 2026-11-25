import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const api = join(root, 'apps', 'api');
const web = join(root, 'apps', 'web');
const services = [
  ['API', api, 'dev'],
  ['Frontend', web, 'start'],
  ['Sincronizador', api, 'sync'],
  ['Notificaciones worker', api, 'notifications:worker'],
  ['Notificaciones scheduler', api, 'notifications:scheduler'],
];

for (const directory of [api, web]) {
  if (!existsSync(join(directory, 'node_modules'))) {
    console.error(`Faltan dependencias en ${directory}. Instálalas antes de iniciar.`);
    process.exit(1);
  }
}

if (!existsSync(join(api, '.env'))) {
  console.error('Falta apps/api/.env. Revisa LEVANTAR-PROYECTO.md.');
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Ejecuta este comando mediante npm run dev.');
  process.exit(1);
}

const children = new Map();
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children.values()) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}

for (const [name, directory, script] of services) {
  const child = spawn(process.execPath, [npmCli, 'run', script], {
    cwd: directory,
    stdio: 'inherit',
    env: process.env,
  });
  children.set(name, child);
  child.on('error', (error) => {
    console.error(`${name}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (!stopping) {
      console.error(`${name} terminó (${signal ?? code}). Deteniendo los demás servicios.`);
      stop(1);
    }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
