import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const root = resolve('.local');
const data = join(root, 'postgres');
mkdirSync(root, { recursive: true });
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = name => bin ? join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const run = (name, args, quiet = false) => execFileSync(exe(name), args, { windowsHide: true, stdio: quiet ? 'ignore' : 'inherit' });
if (process.argv[2] === 'stop') {
  if (existsSync(join(data, 'postmaster.pid'))) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  process.exit(0);
}
const settingsFile = join(root, 'database.json');
let settings;
if (existsSync(settingsFile)) settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
else {
  settings = { user: 'offerme', password: randomBytes(24).toString('hex'), host: '127.0.0.1', port: 55433, database: 'offerme_dev' };
  writeFileSync(settingsFile, JSON.stringify(settings), { mode: 0o600 });
}
if (!existsSync(join(data, 'PG_VERSION'))) {
  const passwordFile = join(root, 'init-password');
  writeFileSync(passwordFile, settings.password, { mode: 0o600 });
  try { run('initdb', ['-D', data, '-U', settings.user, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--pwfile=' + passwordFile]); }
  finally { unlinkSync(passwordFile); }
}
let running = false;
try { run('pg_ctl', ['-D', data, 'status'], true); running = true; } catch {}
if (!running) run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${settings.port}`, '-w', 'start']);
const pool = new pg.Pool({ ...settings, database: 'postgres' });
try {
  const result = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [settings.database]);
  if (!result.rowCount) await pool.query('CREATE DATABASE offerme_dev');
} finally { await pool.end(); }
console.log('OFFERME local PostgreSQL is ready on 127.0.0.1:55433. No existing database was changed.');
