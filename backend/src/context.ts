import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { fromNodeHeaders } from 'better-auth/node';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { Server } from 'socket.io';
import type { Configuration } from './config.js';
import { createAuth } from './auth.js';
import { CloudStorage, type FileStorage } from './storage.js';

export const CONTEXT = Symbol('OFFERME_CONTEXT');
export class Context {
  readonly pool: pg.Pool;
  readonly db: ReturnType<typeof drizzle>;
  readonly auth: ReturnType<typeof createAuth>;
  readonly storage: FileStorage;
  io?: Server;
  constructor(readonly config: Configuration, onOtp?: (phone: string, code: string) => void, storage?: FileStorage) {
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    this.db = drizzle(this.pool);
    this.auth = createAuth(this.pool, config, onOtp);
    this.storage = storage || new CloudStorage(config.storage);
  }
  async session(request: Request) { return this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) }); }
  async user(request: Request) {
    const session = await this.session(request);
    if (!session) throw new UnauthorizedException('Sign in to continue.');
    return session.user;
  }
  async admin(request: Request) {
    const user = await this.user(request);
    if (!user.phoneNumberVerified || !this.config.adminPhones.includes(user.phoneNumber || '')) throw new ForbiddenException('Administrator access required.');
    return user;
  }
  async unblocked(a: string, b: string) {
    const result = await this.pool.query('SELECT 1 FROM block WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)', [a, b]);
    if (result.rowCount) throw new ForbiddenException('This conversation is unavailable.');
  }
  notify(ids: string[], event: string, data: unknown) { ids.forEach(id => this.io?.to(`user:${id}`).emit(event, data)); }
}
