// Local browser-test fixture. This entry point is never imported by the API runtime.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { configuration } from '../src/config.js';
import { createApplication } from '../src/application.js';
import { localTestStorage } from '../tests/local-storage.js';

const config = configuration();
if (config.production) throw new Error('Browser fixtures cannot run in production.');
const url = new URL(config.databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/offerme_dev') throw new Error('Browser tests require the isolated local development database.');
const database = 'offerme_e2e_' + process.pid + '_' + Date.now();
if (!/^offerme_e2e_[0-9_]+$/.test(database)) throw new Error('Invalid test database name.');
const owner = new pg.Pool({ connectionString: config.databaseUrl });
await owner.query('CREATE DATABASE "' + database + '"');
url.pathname = '/' + database;
const directory = resolve('.local', database);
mkdirSync(directory, { recursive: true });
const fixturePath = resolve('.local/e2e-fixture.json');
const secret = randomUUID();
const codes: Record<string, string> = {};
const persist = () => writeFileSync(fixturePath, JSON.stringify({ database, secret, codes }));
persist();
const runtime = await createApplication({ ...config, databaseUrl: url.toString(), webOrigin: 'http://127.0.0.1:3101', authUrl: 'http://127.0.0.1:4101', uploadDir: resolve(directory, 'uploads') }, { migrate: true, quiet: true, storage: localTestStorage(resolve(directory, 'uploads')), onOtp: (phone, code) => { codes[phone] = code; persist(); } });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  control.close();
  await runtime.close();
  await owner.query('DROP DATABASE "' + database + '" WITH (FORCE)');
  await owner.end();
  writeFileSync(fixturePath, JSON.stringify({ database, cleanedUp: true }));
  process.exit(0);
}
// Registered only by this test entry point, protected by a random local fixture token.
const control = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/shutdown' || req.headers.authorization !== 'Bearer ' + secret) { res.writeHead(403); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ stopping: true }));
  setTimeout(() => { void close(); }, 100);
});
control.listen(4102, '127.0.0.1');
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
await runtime.app.listen(4101, '127.0.0.1');
console.info('Isolated browser-test API ready on 4101');
