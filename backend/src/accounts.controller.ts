import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CONTEXT, Context } from "./context.js";
import { transaction } from "./exchange.js";
import { categories, neighborhoods, conditions } from "./catalog.js";
const filters = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z
      .string()
      .refine((x) => categories.some((c) => c.id === x))
      .optional(),
    neighborhood: z.enum(neighborhoods).optional(),
    condition: z.enum(conditions).optional(),
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(),
  })
  .strict();
@Controller("v1")
export class AccountsController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Get("me/settings") async settings(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return (
      (
        await this.ctx.pool.query(
          'SELECT locale,push_enabled AS "pushEnabled",suspended,deletion_requested_at AS "deletionRequestedAt" FROM user_settings WHERE user_id=$1',
          [user.id],
        )
      ).rows[0] || {
        locale: "en",
        pushEnabled: true,
        suspended: false,
        deletionRequestedAt: null,
      }
    );
  }
  @Patch("me/settings") async setSettings(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({ locale: z.enum(["en", "am", "om"]), pushEnabled: z.boolean() })
      .strict()
      .parse(input);
    await this.ctx.pool.query(
      "INSERT INTO user_settings(user_id,locale,push_enabled) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET locale=EXCLUDED.locale,push_enabled=EXCLUDED.push_enabled",
      [user.id, data.locale, data.pushEnabled],
    );
    return data;
  }
  @Post("me/devices") async device(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const { token } = z
      .object({
        token: z
          .string()
          .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
          .max(300),
      })
      .strict()
      .parse(input);
    await this.ctx.pool.query(
      "INSERT INTO push_device(token,user_id) VALUES($1,$2) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,updated_at=now()",
      [token, user.id],
    );
    return { registered: true };
  }
  @Delete("me/devices") async removeDevices(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({ token: z.string().max(300) })
      .strict()
      .parse(input);
    await this.ctx.pool.query(
      "DELETE FROM push_device WHERE user_id=$1 AND token=$2",
      [user.id, data.token],
    );
    return { removed: true };
  }
  @Get("blocks") async blocks(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          'SELECT b.blocked_id AS id,u.name FROM block b JOIN "user" u ON u.id=b.blocked_id WHERE b.user_id=$1 ORDER BY b.created_at DESC',
          [user.id],
        )
      ).rows,
    };
  }
  @Delete("blocks/:id") async unblock(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    await this.ctx.pool.query(
      "DELETE FROM block WHERE user_id=$1 AND blocked_id=$2",
      [user.id, id],
    );
    return { blocked: false };
  }
  @Get("saved-searches") async searches(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          "SELECT id,name,filters FROM saved_search WHERE user_id=$1 ORDER BY created_at DESC",
          [user.id],
        )
      ).rows,
    };
  }
  @Post("saved-searches") async saveSearch(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({ name: z.string().trim().min(2).max(80), filters })
      .strict()
      .parse(input);
    return transaction(this.ctx, async (db) => {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user.id]);
      const count = (
        await db.query(
          "SELECT count(*)::int AS count FROM saved_search WHERE user_id=$1",
          [user.id],
        )
      ).rows[0].count;
      if (count >= 50)
        throw new BadRequestException("You can save up to 50 searches.");
      return (
        await db.query(
          "INSERT INTO saved_search(id,user_id,name,filters) VALUES($1,$2,$3,$4) RETURNING id,name,filters",
          [randomUUID(), user.id, data.name, JSON.stringify(data.filters)],
        )
      ).rows[0];
    });
  }
  @Delete("saved-searches/:id") async deleteSearch(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    await this.ctx.pool.query(
      "DELETE FROM saved_search WHERE id=$1 AND user_id=$2",
      [id, user.id],
    );
    return { deleted: true };
  }
  @Get("support") async support(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          "SELECT id,kind,body,status,response,created_at FROM support_request WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [user.id],
        )
      ).rows,
    };
  }
  @Post("support") async requestSupport(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({
        kind: z.enum(["recovery", "appeal", "support"]),
        body: z.string().trim().min(15).max(4000),
      })
      .strict()
      .parse(input);
    return (
      await this.ctx.pool.query(
        "INSERT INTO support_request(id,user_id,kind,body) VALUES($1,$2,$3,$4) RETURNING id,status",
        [randomUUID(), user.id, data.kind, data.body],
      )
    ).rows[0];
  }
  @Post("me/deletion") async deletion(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return transaction(this.ctx, async (db) => {
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [user.id]);
      const previous = (
        await db.query(
          "SELECT id,status FROM support_request WHERE user_id=$1 AND kind='deletion' AND status='open'",
          [user.id],
        )
      ).rows[0];
      if (previous) return previous;
      await db.query(
        "INSERT INTO user_settings(user_id,deletion_requested_at,push_enabled) VALUES($1,now(),false) ON CONFLICT(user_id) DO UPDATE SET deletion_requested_at=now(),push_enabled=false",
        [user.id],
      );
      await db.query("DELETE FROM push_device WHERE user_id=$1", [user.id]);
      return (
        await db.query(
          "INSERT INTO support_request(id,user_id,kind,body) VALUES($1,$2,'deletion','Account deletion requested by the account owner.') RETURNING id,status",
          [randomUUID(), user.id],
        )
      ).rows[0];
    });
  }
  @Get("me/export") async exportData(@Req() req: Request) {
    const user = await this.ctx.user(req);
    const own = async (table: string, where: string) =>
      (
        await this.ctx.pool.query(`SELECT * FROM ${table} WHERE ${where}`, [
          user.id,
        ])
      ).rows;
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
      },
      listings: await own("listing", "seller_id=$1"),
      conversations: await own("conversation", "buyer_id=$1 OR seller_id=$1"),
      messages: await own("message", "sender_id=$1"),
      favorites: await own("favorite", "user_id=$1"),
      sales: await own("sale", "seller_id=$1 OR buyer_id=$1"),
      reviews: await own("review", "author_id=$1"),
      settings: await this.settings(req),
      searches: await own("saved_search", "user_id=$1"),
      reports: await own("report", "reporter_id=$1"),
      support: await own("support_request", "user_id=$1"),
    };
  }
  @Get("admin/support") async supportQueue(@Req() req: Request) {
    await this.ctx.admin(req);
    return {
      items: (
        await this.ctx.pool.query(
          'SELECT s.*,u.name FROM support_request s JOIN "user" u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 200',
        )
      ).rows,
    };
  }
  @Patch("admin/support/:id") async resolve(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const admin = await this.ctx.admin(req);
    const data = z
      .object({
        status: z.enum(["resolved", "dismissed"]),
        response: z.string().trim().min(10).max(4000),
      })
      .strict()
      .parse(input);
    return transaction(this.ctx, async (db) => {
      const ticket = (
        await db.query(
          "SELECT kind FROM support_request WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (ticket?.kind === "deletion" && data.status === "resolved")
        throw new BadRequestException(
          "Complete the account erasure procedure before resolving a deletion request.",
        );
      const result = await db.query(
        "UPDATE support_request SET status=$2,response=$3,resolved_at=now() WHERE id=$1 AND status='open' RETURNING id,status",
        [id, data.status, data.response],
      );
      if (!result.rowCount)
        throw new NotFoundException("Open request not found.");
      await db.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), admin.id, "support." + data.status, id],
      );
      return result.rows[0];
    });
  }
  @Patch("admin/users/:id") async suspend(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const admin = await this.ctx.admin(req);
    const data = z
      .object({
        suspended: z.boolean(),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(input);
    if (id === admin.id)
      throw new BadRequestException(
        "You cannot suspend your own administrator account.",
      );
    return transaction(this.ctx, async (db) => {
      if (
        !(await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [id]))
          .rowCount
      )
        throw new NotFoundException("User not found.");
      await db.query(
        "INSERT INTO user_settings(user_id,suspended,suspension_reason) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET suspended=EXCLUDED.suspended,suspension_reason=EXCLUDED.suspension_reason",
        [id, data.suspended, data.reason],
      );
      if (data.suspended) {
        await db.query('DELETE FROM session WHERE "userId"=$1', [id]);
        await db.query("DELETE FROM push_device WHERE user_id=$1", [id]);
      }
      await db.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          admin.id,
          data.suspended ? "user.suspended" : "user.restored",
          id,
        ],
      );
      return { id, suspended: data.suspended };
    });
  }
}
