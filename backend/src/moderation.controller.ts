import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction, setListingStatus, lockListing } from "./exchange.js";
import { CONTEXT, Context } from "./context.js";

@ApiTags("Safety")
@Controller("v1")
export class ModerationController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Post("reports") async report(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req);
    const data = z
      .object({
        listingId: z.string().max(100).optional(),
        userId: z.string().max(100).optional(),
        messageId: z.string().uuid().optional(),
        reviewId: z.string().uuid().optional(),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .refine(
        (d) => !!d.listingId || !!d.userId || !!d.messageId || !!d.reviewId,
        "Choose a listing or person to report.",
      )
      .parse(input);
    if (data.messageId) {
      const message = (
        await this.ctx.pool.query(
          "SELECT m.sender_id,c.listing_id FROM message m JOIN conversation c ON c.id=m.conversation_id WHERE m.id=$1 AND (c.buyer_id=$2 OR c.seller_id=$2)",
          [data.messageId, user.id],
        )
      ).rows[0];
      if (!message) throw new NotFoundException("Message not found.");
      if (
        message.sender_id === user.id ||
        (data.userId && data.userId !== message.sender_id)
      )
        throw new BadRequestException(
          "Choose a message from the person you are reporting.",
        );
      data.userId = message.sender_id;
      data.listingId = message.listing_id;
    }
    if (data.reviewId) {
      const review = (
        await this.ctx.pool.query(
          "SELECT r.author_id,s.listing_id FROM review r JOIN sale s ON s.id=r.sale_id WHERE r.id=$1",
          [data.reviewId],
        )
      ).rows[0];
      if (!review) throw new NotFoundException("Review not found.");
      if (review.author_id === user.id)
        throw new BadRequestException("You cannot report your own review.");
      data.userId = review.author_id;
      data.listingId = review.listing_id;
    }
    if (
      data.listingId &&
      !(
        await this.ctx.pool.query("SELECT 1 FROM listing WHERE id=$1", [
          data.listingId,
        ])
      ).rowCount
    )
      throw new NotFoundException("Listing not found.");
    if (
      data.userId &&
      !(
        await this.ctx.pool.query('SELECT 1 FROM "user" WHERE id=$1', [
          data.userId,
        ])
      ).rowCount
    )
      throw new NotFoundException("User not found.");
    const id = randomUUID();
    await this.ctx.pool.query(
      "INSERT INTO report(id,reporter_id,listing_id,reported_user_id,reason,message_id,review_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        user.id,
        data.listingId || null,
        data.userId || null,
        data.reason,
        data.messageId || null,
        data.reviewId || null,
      ],
    );
    return { id, status: "open" };
  }
  @Post("blocks/:id") async block(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    if (user.id === id)
      throw new BadRequestException("You cannot block yourself.");
    if (
      !(await this.ctx.pool.query('SELECT 1 FROM "user" WHERE id=$1', [id]))
        .rowCount
    )
      throw new NotFoundException("User not found.");
    await transaction(this.ctx, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        [user.id, id].sort().join(":"),
      ]);
      await db.query(
        "INSERT INTO block(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [user.id, id],
      );
      await db.query(
        "UPDATE notification_job SET status='suppressed',lease=NULL WHERE status='pending' AND ((user_id=$1 AND actor_id=$2) OR (user_id=$2 AND actor_id=$1))",
        [user.id, id],
      );
    });
    this.ctx.notify([user.id, id], "conversation.updated", {});
    return { blocked: true };
  }
  @Get("admin/reports") async reports(@Req() req: Request) {
    await this.ctx.admin(req);
    return {
      items: (
        await this.ctx.pool.query(
          'SELECT r.id,r.listing_id AS "listingId",r.reported_user_id AS "userId",r.reason,r.status,r.created_at AS "createdAt",l.status AS "listingStatus" FROM report r LEFT JOIN listing l ON l.id=r.listing_id ORDER BY r.created_at DESC LIMIT 100',
        )
      ).rows,
    };
  }
  @Get("admin/reports/:id") async caseDetails(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await this.ctx.admin(req);
    const row = (
      await this.ctx.pool.query(
        'SELECT r.id,r.reason,r.status,r.review_id AS "reviewId",m.body AS "messageBody",v.body AS "reviewBody",u.name AS "reportedName" FROM report r LEFT JOIN message m ON m.id=r.message_id LEFT JOIN review v ON v.id=r.review_id LEFT JOIN "user" u ON u.id=r.reported_user_id WHERE r.id=$1',
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Report not found.");
    await this.ctx.pool.query(
      "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
      [randomUUID(), admin.id, "report.viewed", id],
    );
    return row;
  }
  @Patch("admin/reports/:id") async resolveReport(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const admin = await this.ctx.admin(req);
    const { status } = z
      .object({ status: z.enum(["resolved", "dismissed"]) })
      .strict()
      .parse(input);
    const connection = await this.ctx.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query(
        "UPDATE report SET status=$1,resolved_by=$2 WHERE id=$3 RETURNING id,status",
        [status, admin.id, id],
      );
      if (!result.rowCount) throw new NotFoundException("Report not found.");
      await connection.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), admin.id, "report." + status, id],
      );
      await connection.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  @Patch("admin/listings/:id") async removeListing(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await this.ctx.admin(req);
    const connection = await this.ctx.pool.connect();
    try {
      await connection.query("BEGIN");
      const listing = (
        await connection.query(
          "SELECT status FROM listing WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!listing) throw new NotFoundException("Listing not found.");
      await setListingStatus(
        connection,
        id,
        listing.status,
        "removed",
        admin.id,
      );
      await connection.query(
        "UPDATE reservation SET status='cancelled' WHERE listing_id=$1 AND status='confirmed'",
        [id],
      );
      const result = await connection.query(
        "SELECT id,status FROM listing WHERE id=$1",
        [id],
      );
      if (!result.rowCount) throw new NotFoundException("Listing not found.");
      await connection.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), admin.id, "listing.removed", id],
      );
      await connection.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  @Patch("admin/listings/:id/restore") async restoreListing(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const admin = await this.ctx.admin(req);
    return transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, id);
      if (listing.moderation_status !== "removed")
        throw new BadRequestException("This listing has not been removed.");
      const result = (
        await db.query(
          "UPDATE listing SET moderation_status='clear',availability=CASE WHEN EXISTS(SELECT 1 FROM sale WHERE listing_id=$1) THEN 'sold' WHEN availability='reserved' THEN 'available' ELSE availability END,updated_at=now() WHERE id=$1 RETURNING id,status",
          [id],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO listing_status_history(listing_id,actor_id,previous_status,status) VALUES($1,$2,$3,$4)",
        [id, admin.id, "removed", result.status],
      );
      await db.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,'listing.restored',$3)",
        [randomUUID(), admin.id, id],
      );
      return result;
    });
  }
  @Patch("admin/reviews/:id") async moderateReview(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const admin = await this.ctx.admin(req);
    const data = z
      .object({
        hidden: z.boolean(),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(input);
    return transaction(this.ctx, async (db) => {
      const result = await db.query(
        "UPDATE review SET hidden=$2 WHERE id=$1 RETURNING id,hidden",
        [id, data.hidden],
      );
      if (!result.rowCount) throw new NotFoundException("Review not found.");
      await db.query(
        "INSERT INTO audit_event(id,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          admin.id,
          data.hidden ? "review.hidden" : "review.restored",
          id,
          JSON.stringify({ reason: data.reason }),
        ],
      );
      return result.rows[0];
    });
  }
}
