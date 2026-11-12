import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { serviceConfiguration } from './service-config.js';

export function configuration() {
  const production = process.env.NODE_ENV === 'production';
  const local = resolve('.local');
  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl && !production && existsSync(resolve(local, 'database.json'))) {
    const db = JSON.parse(readFileSync(resolve(local, 'database.json'), 'utf8'));
    databaseUrl = `postgresql://${db.user}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.database}`;
  }
  if (!databaseUrl) throw new Error('DATABASE_URL is required. For local development, run npm run db:local.');
  let secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && !production) {
    mkdirSync(local, { recursive: true });
    const path = resolve(local, 'auth-secret');
    if (!existsSync(path)) writeFileSync(path, randomBytes(48).toString('hex'), { mode: 0o600 });
    secret = readFileSync(path, 'utf8');
  }
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  if (production && (!process.env.WEB_ORIGIN || !process.env.BETTER_AUTH_URL)) throw new Error('Production requires WEB_ORIGIN and BETTER_AUTH_URL.');
  return {
    production, databaseUrl, secret, ...serviceConfiguration(),
    port: Number(process.env.PORT || 4100), host: process.env.HOST || '127.0.0.1',
    webOrigin: process.env.WEB_ORIGIN || 'http://127.0.0.1:3100',
    authUrl: process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4100',
    uploadDir: resolve(local, 'uploads'),
    adminPhones: (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean),
    trustedProxyIps: (process.env.TRUSTED_PROXY_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
export type Configuration = ReturnType<typeof configuration>;
