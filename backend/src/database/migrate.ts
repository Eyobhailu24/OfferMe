import { getMigrations } from 'better-auth/db/migration';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Auth } from '../auth.js';

export async function migrate(pool: pg.Pool, auth: Auth) {
  const connection = await pool.connect();
  try {
    await connection.query('SELECT pg_advisory_lock(43871821)');
    const authMigration = await getMigrations(auth.options);
    await authMigration.runMigrations();
    await connection.query('CREATE TABLE IF NOT EXISTS offerme_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(resolve('migrations'))).filter(s => s.endsWith('.sql')).sort()) {
      const sql = await readFile(resolve('migrations', name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await connection.query('SELECT checksum FROM offerme_migration WHERE name=$1', [name]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Migration ${name} changed after being applied. Add a new migration instead.`);
        continue;
      }
      await connection.query('BEGIN');
      try {
        await connection.query(sql);
        await connection.query('INSERT INTO offerme_migration(name,checksum) VALUES($1,$2)', [name, checksum]);
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
    }
  } finally { await connection.query('SELECT pg_advisory_unlock(43871821)'); connection.release(); }
}
