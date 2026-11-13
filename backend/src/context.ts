import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { fromNodeHeaders } from "better-auth/node";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { Server } from "socket.io";
import type { Configuration } from "./config.js";
import { createAuth } from "./auth.js";
import { CloudStorage, type FileStorage } from "./storage.js";

export const CONTEXT = Symbol("OFFERME_CONTEXT");
export class Context {
  readonly pool: pg.Pool;
  readonly db: ReturnType<typeof drizzle>;
  readonly auth: ReturnType<typeof createAuth>;
  readonly storage: FileStorage;
  io?: Server;
  constructor(
    readonly config: Configuration,
    onOtp?: (phone: string, code: string) => void,
    storage?: FileStorage,
  ) {
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    this.pool.on("error", (error) =>
      console.error(
        JSON.stringify({
          event: "database.idle_error",
          code: (error as { code?: string }).code || "unknown",
        }),
      ),
    );
    this.db = drizzle(this.pool);
    this.auth = createAuth(this.pool, config, onOtp);
    this.storage = storage || new CloudStorage(config.storage);
  }
  async session(request: Request) {
    return this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
  }
  async user(request: Request) {
    const session = await this.session(request);
    if (!session) throw new UnauthorizedException("Sign in to continue.");
    const settings = (
      await this.pool.query(
        "SELECT suspended FROM user_settings WHERE user_id=$1",
        [session.user.id],
      )
    ).rows[0];
    if (
      settings?.suspended &&
      ![
        "/v1/me",
        "/v1/me/export",
        "/v1/me/deletion",
        "/v1/me/settings",
        "/v1/support",
      ].includes(request.path)
    )
      throw new ForbiddenException(
        "This account is suspended. Open Account to contact support or appeal.",
      );
    return session.user;
  }
  async admin(request: Request) {
    const user = await this.user(request);
    if (
      !user.phoneNumberVerified ||
      !this.config.adminPhones.includes(user.phoneNumber || "")
    )
      throw new ForbiddenException("Administrator access required.");
    const session = await this.session(request);
    if (this.config.adminTotpSecrets[user.phoneNumber || ""]) {
      const grant = await this.pool.query(
        "SELECT 1 FROM admin_grant WHERE session_id=$1 AND user_id=$2 AND expires_at>now()",
        [session!.session.id, user.id],
      );
      if (!grant.rowCount)
        throw new ForbiddenException("Verify administrator access in Account.");
    }
    return user;
  }
  async unblocked(
    a: string,
    b: string,
    db: Pick<pg.Pool, "query"> = this.pool,
  ) {
    if (db !== this.pool)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        [a, b].sort().join(":"),
      ]);
    if (
      (
        await db.query(
          "SELECT 1 FROM user_settings WHERE user_id IN ($1,$2) AND suspended",
          [a, b],
        )
      ).rowCount
    )
      throw new ForbiddenException("This conversation is unavailable.");
    const result = await db.query(
      "SELECT 1 FROM block WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)",
      [a, b],
    );
    if (result.rowCount)
      throw new ForbiddenException("This conversation is unavailable.");
  }
  async enqueue(
    db: Pick<pg.Pool, "query">,
    userId: string,
    actorId: string,
    conversationId: string,
    kind: string,
    resourceId: string,
  ) {
    await db.query(
      "INSERT INTO notification_job(id,user_id,actor_id,conversation_id,kind,resource_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [crypto.randomUUID(), userId, actorId, conversationId, kind, resourceId],
    );
  }
  notify(ids: string[], event: string, data: unknown) {
    ids.forEach((id) => this.io?.to(`user:${id}`).emit(event, data));
  }
}
