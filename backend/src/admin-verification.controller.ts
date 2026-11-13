import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { TOTP } from "otpauth";
import { z } from "zod";
import { CONTEXT, Context } from "./context.js";
import { transaction } from "./exchange.js";
@Controller("v1/me")
export class AdminVerificationController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Post("admin-verification") async verify(
    @Req() req: Request,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req),
      session = await this.ctx.session(req);
    if (
      !user.phoneNumberVerified ||
      !this.ctx.config.adminPhones.includes(user.phoneNumber || "")
    )
      throw new ForbiddenException("Administrator access required.");
    const secret = this.ctx.config.adminTotpSecrets[user.phoneNumber || ""];
    if (!secret)
      throw new BadRequestException(
        "Administrator verification is not configured.",
      );
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(input);
    const result = await transaction(this.ctx, async (db) => {
      await db.query(
        "INSERT INTO admin_totp_state(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [user.id],
      );
      const state = (
        await db.query(
          "SELECT * FROM admin_totp_state WHERE user_id=$1 FOR UPDATE",
          [user.id],
        )
      ).rows[0];
      const now = Date.now(),
        fresh = new Date(state.window_at).getTime() > now - 15 * 60000;
      if (fresh && state.attempts >= 5) return false;
      const otp = new TOTP({
        issuer: "OFFERME",
        label: user.phoneNumber || user.id,
        secret,
      });
      const delta = otp.validate({
        token: code,
        window: 1,
        timestamp: now,
        afterCounter:
          state.last_counter === null ? null : Number(state.last_counter),
      });
      if (delta === null) {
        await db.query(
          "UPDATE admin_totp_state SET attempts=$2,window_at=$3 WHERE user_id=$1",
          [
            user.id,
            fresh ? state.attempts + 1 : 1,
            fresh ? state.window_at : new Date(now),
          ],
        );
        return false;
      }
      await db.query(
        "UPDATE admin_totp_state SET last_counter=$2,attempts=0,window_at=now() WHERE user_id=$1",
        [user.id, otp.counter({ timestamp: now }) + delta],
      );
      await db.query(
        "INSERT INTO admin_grant(session_id,user_id,expires_at) VALUES($1,$2,now()+interval '15 minutes') ON CONFLICT(session_id) DO UPDATE SET expires_at=EXCLUDED.expires_at",
        [session!.session.id, user.id],
      );
      return true;
    });
    if (!result)
      throw new BadRequestException(
        "Invalid or reused administrator code. Try a new code, or wait fifteen minutes after repeated failures.",
      );
    return { verified: true };
  }
}
