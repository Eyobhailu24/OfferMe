import {
  BadRequestException,
  ForbiddenException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CONTEXT, Context } from "./context.js";
import { messageInput } from "./validation.js";
import { availableTo, lockListing, transaction } from "./exchange.js";

@ApiTags("Conversations")
@Controller("v1/conversations")
export class ConversationsController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  async member(id: string, userId: string) {
    const row = (
      await this.ctx.pool.query(
        "SELECT * FROM conversation WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)",
        [id, userId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Conversation not found.");
    return row as {
      id: string;
      buyer_id: string;
      seller_id: string;
      listing_id: string;
    };
  }
  @Get() async list(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          `SELECT c.id,c.listing_id AS "listingId",c.buyer_id AS "buyerId",c.seller_id AS "sellerId",c.updated_at AS "updatedAt",l.title,l.images,l.price_minor AS "priceMinor",u.name AS "otherName",u.id AS "otherId",
   (SELECT body FROM message m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS "lastMessage",
   (SELECT count(*)::int FROM message m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND
     (m.created_at,m.id)>COALESCE((SELECT (r.created_at,r.id) FROM conversation_read cr JOIN message r ON r.id=cr.message_id WHERE cr.conversation_id=c.id AND cr.user_id=$1),('-infinity'::timestamptz,''))) AS "unreadCount"
   FROM conversation c JOIN listing l ON l.id=c.listing_id JOIN "user" u ON u.id=CASE WHEN c.buyer_id=$1 THEN c.seller_id ELSE c.buyer_id END
   WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY c.updated_at DESC,c.id DESC LIMIT 200`,
          [user.id],
        )
      ).rows,
    };
  }
  @Post() async create(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req);
    const { listingId } = z
      .object({ listingId: z.string().uuid() })
      .strict()
      .parse(input);
    return transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, listingId);
      if (["removed", "archived"].includes(listing.status))
        throw new NotFoundException("This listing is unavailable.");
      if (listing.seller_id === user.id)
        throw new BadRequestException("You cannot message yourself.");
      await this.ctx.unblocked(user.id, listing.seller_id, db);
      const existing = (
        await db.query(
          "SELECT id FROM conversation WHERE listing_id=$1 AND buyer_id=$2",
          [listingId, user.id],
        )
      ).rows[0];
      if (existing) return existing;
      await availableTo(db, listing, user.id);
      return (
        await db.query(
          "INSERT INTO conversation(id,listing_id,buyer_id,seller_id) VALUES($1,$2,$3,$4) RETURNING id",
          [randomUUID(), listingId, user.id, listing.seller_id],
        )
      ).rows[0];
    });
  }
  @Get(":id") async detail(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("before") before?: string,
  ) {
    const user = await this.ctx.user(req);
    const c = await this.member(id, user.id);
    await transaction(this.ctx, async (db) => {
      await lockListing(db, c.listing_id);
    });
    const values: unknown[] = [id];
    let cursor = "";
    if (before) {
      values.push(z.string().uuid().parse(before));
      cursor =
        "AND (created_at,id)<(SELECT created_at,id FROM message WHERE id=$2 AND conversation_id=$1)";
    }
    const messages = (
      await this.ctx.pool.query(
        `SELECT id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId" FROM message WHERE conversation_id=$1 ${cursor} ORDER BY created_at DESC,id DESC LIMIT 100`,
        values,
      )
    ).rows;
    const offers = (
      await this.ctx.pool.query(
        'SELECT id,sender_id AS "senderId",amount_minor AS "amountMinor",status,expires_at AS "expiresAt",previous_id AS "previousId",created_at AS "createdAt" FROM offer WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',
        [id],
      )
    ).rows;
    const meetups = (
      await this.ctx.pool.query(
        'SELECT id,proposer_id AS "proposerId",place,neighborhood,scheduled_at AS "scheduledAt",status,previous_id AS "previousId" FROM meetup WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',
        [id],
      )
    ).rows;
    const blocked = await this.ctx.pool.query(
      "SELECT 1 FROM block WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)",
      [c.buyer_id, c.seller_id],
    );
    const reservation =
      (
        await this.ctx.pool.query(
          'SELECT id,buyer_id AS "buyerId",expires_at AS "expiresAt" FROM reservation WHERE listing_id=$1 AND status=\'confirmed\'',
          [c.listing_id],
        )
      ).rows[0] || null;
    const listing = (
      await this.ctx.pool.query("SELECT status FROM listing WHERE id=$1", [
        c.listing_id,
      ])
    ).rows[0];
    const muted = !!(
      await this.ctx.pool.query(
        "SELECT 1 FROM conversation_mute WHERE conversation_id=$1 AND user_id=$2",
        [id, user.id],
      )
    ).rowCount;
    const readCursors = (
      await this.ctx.pool.query(
        'SELECT user_id AS "userId",message_id AS "messageId" FROM conversation_read WHERE conversation_id=$1',
        [id],
      )
    ).rows;
    return {
      id,
      buyerId: c.buyer_id,
      sellerId: c.seller_id,
      listingId: c.listing_id,
      listingStatus: listing.status,
      blocked: !!blocked.rowCount,
      messages: messages.reverse(),
      offers,
      meetups,
      hasEarlier: messages.length === 100,
      reservation,
      muted,
      readCursors,
    };
  }
  @Post(":id/messages") async send(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = messageInput.parse(input);
    if (data.expectedSenderId && data.expectedSenderId !== user.id)
      throw new ForbiddenException(
        "This message belongs to another signed-in account.",
      );
    const c = await this.member(id, user.id);
    const message = await transaction(this.ctx, async (db) => {
      await lockListing(db, c.listing_id);
      await this.ctx.unblocked(c.buyer_id, c.seller_id, db);
      const result = await db.query(
        'INSERT INTO message(id,conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,client_id) DO NOTHING RETURNING id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId"',
        [randomUUID(), id, user.id, data.clientId, data.body],
      );
      if (!result.rowCount) {
        const previous = (
          await db.query(
            'SELECT id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId",conversation_id FROM message WHERE sender_id=$1 AND client_id=$2',
            [user.id, data.clientId],
          )
        ).rows[0];
        if (previous?.conversation_id !== id || previous.body !== data.body)
          throw new BadRequestException(
            "That message identifier was already used.",
          );
        delete previous.conversation_id;
        return previous;
      }
      await db.query("UPDATE conversation SET updated_at=now() WHERE id=$1", [
        id,
      ]);
      await this.ctx.enqueue(
        db,
        user.id === c.buyer_id ? c.seller_id : c.buyer_id,
        user.id,
        id,
        "message",
        result.rows[0].id,
      );
      return result.rows[0];
    });
    this.ctx.notify([c.buyer_id, c.seller_id], "conversation.updated", { id });
    return message;
  }
  @Post(":id/offers") async offer(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const c = await this.member(id, user.id);
    const data = z
      .object({
        amountMinor: z.number().int().positive().max(2_000_000_000),
        previousId: z.string().uuid().optional(),
      })
      .strict()
      .parse(input);
    const result = await transaction(this.ctx, async (db) => {
      const l = await lockListing(db, c.listing_id);
      await this.ctx.unblocked(c.buyer_id, c.seller_id, db);
      await availableTo(db, l, c.buyer_id);
      if (!l.negotiable && data.amountMinor !== l.price_minor)
        throw new BadRequestException("The seller has set a firm price.");
      if (data.previousId) {
        const previous = await db.query(
          "UPDATE offer SET status='countered' WHERE id=$1 AND conversation_id=$2 AND sender_id<>$3 AND status='pending' AND expires_at>now() RETURNING id",
          [data.previousId, id, user.id],
        );
        if (!previous.rowCount)
          throw new BadRequestException("This offer cannot be countered.");
      }
      const row = (
        await db.query(
          "INSERT INTO offer(id,conversation_id,sender_id,amount_minor,previous_id) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
          [
            randomUUID(),
            id,
            user.id,
            data.amountMinor,
            data.previousId || null,
          ],
        )
      ).rows[0];
      await this.ctx.enqueue(
        db,
        user.id === c.buyer_id ? c.seller_id : c.buyer_id,
        user.id,
        id,
        "offer",
        row.id,
      );
      return row;
    });
    this.ctx.notify([c.buyer_id, c.seller_id], "conversation.updated", { id });
    return result;
  }
  @Patch(":id/offers/:offerId") async respond(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("offerId") offerId: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const c = await this.member(id, user.id);
    const { status } = z
      .object({ status: z.enum(["accepted", "declined", "withdrawn"]) })
      .strict()
      .parse(input);
    const result = await transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, c.listing_id);
      await this.ctx.unblocked(c.buyer_id, c.seller_id, db);
      await availableTo(db, listing, c.buyer_id);
      const result = await db.query(
        `UPDATE offer SET status=$1 WHERE id=$2 AND conversation_id=$3 AND status='pending' AND expires_at>now() AND sender_id ${status === "withdrawn" ? "=" : "<>"} $4 RETURNING id,status`,
        [status, offerId, id, user.id],
      );
      if (!result.rowCount)
        throw new BadRequestException("This offer can no longer be changed.");
      await this.ctx.enqueue(
        db,
        user.id === c.buyer_id ? c.seller_id : c.buyer_id,
        user.id,
        id,
        "offer." + status,
        offerId,
      );
      return result.rows[0];
    });
    this.ctx.notify([c.buyer_id, c.seller_id], "conversation.updated", { id });
    return result;
  }
  @Post(":id/meetups") async proposeMeetup(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const c = await this.member(id, user.id);
    const data = z
      .object({
        place: z.string().trim().min(5).max(250),
        scheduledAt: z.iso.datetime({ offset: true }),
        previousId: z.string().uuid().optional(),
      })
      .strict()
      .parse(input);
    const date = new Date(data.scheduledAt);
    if (
      date.getTime() < Date.now() ||
      date.getTime() > Date.now() + 90 * 86400000
    )
      throw new BadRequestException("Choose a meetup within the next 90 days.");
    const result = await transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, c.listing_id);
      await this.ctx.unblocked(c.buyer_id, c.seller_id, db);
      await availableTo(db, listing, c.buyer_id);
      if (data.previousId) {
        const previous = await db.query(
          "UPDATE meetup SET status='cancelled' WHERE id=$1 AND conversation_id=$2 AND status IN ('proposed','confirmed') RETURNING id",
          [data.previousId, id],
        );
        if (!previous.rowCount)
          throw new BadRequestException("This meetup cannot be rescheduled.");
      }
      const row = (
        await db.query(
          "INSERT INTO meetup(id,conversation_id,proposer_id,place,scheduled_at,neighborhood,previous_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status",
          [
            randomUUID(),
            id,
            user.id,
            data.place,
            date,
            listing.neighborhood,
            data.previousId || null,
          ],
        )
      ).rows[0];
      await this.ctx.enqueue(
        db,
        user.id === c.buyer_id ? c.seller_id : c.buyer_id,
        user.id,
        id,
        "meetup",
        row.id,
      );
      return row;
    });
    this.ctx.notify([c.buyer_id, c.seller_id], "conversation.updated", { id });
    return result;
  }
  @Patch(":id/meetups/:meetupId") async meetupStatus(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("meetupId") meetupId: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const c = await this.member(id, user.id);
    const { status } = z
      .object({
        status: z.enum([
          "confirmed",
          "cancelled",
          "completed",
          "no_show_reported",
        ]),
      })
      .strict()
      .parse(input);
    const result = await transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, c.listing_id);
      await this.ctx.unblocked(c.buyer_id, c.seller_id, db);
      if (status === "confirmed") await availableTo(db, listing, c.buyer_id);
      const where =
        status === "confirmed"
          ? "status='proposed' AND proposer_id<>$4"
          : ["completed", "no_show_reported"].includes(status)
            ? "status='confirmed' AND scheduled_at<=now() AND $4::text IS NOT NULL"
            : "status IN ('proposed','confirmed') AND $4::text IS NOT NULL";
      const result = await db.query(
        `UPDATE meetup SET status=$1 WHERE id=$2 AND conversation_id=$3 AND ${where} RETURNING id,status`,
        [status, meetupId, id, user.id],
      );
      if (!result.rowCount)
        throw new BadRequestException("This meetup cannot be changed.");
      await this.ctx.enqueue(
        db,
        user.id === c.buyer_id ? c.seller_id : c.buyer_id,
        user.id,
        id,
        "meetup." + status,
        meetupId,
      );
      return result.rows[0];
    });
    this.ctx.notify([c.buyer_id, c.seller_id], "conversation.updated", { id });
    return result;
  }
  @Patch(":id/read") async read(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    await this.member(id, user.id);
    const { messageId } = z
      .object({ messageId: z.string().uuid() })
      .strict()
      .parse(input);
    const m = (
      await this.ctx.pool.query(
        "SELECT id FROM message WHERE id=$1 AND conversation_id=$2",
        [messageId, id],
      )
    ).rows[0];
    if (!m)
      throw new BadRequestException("Message not found in this conversation.");
    await this.ctx.pool.query(
      `INSERT INTO conversation_read(conversation_id,user_id,message_id) VALUES($1,$2,$3)
   ON CONFLICT(conversation_id,user_id) DO UPDATE SET message_id=EXCLUDED.message_id,read_at=now()
   WHERE (SELECT (created_at,id) FROM message WHERE id=conversation_read.message_id)<(SELECT (created_at,id) FROM message WHERE id=EXCLUDED.message_id)`,
      [id, user.id, messageId],
    );
    return { read: true };
  }
  @Patch(":id/mute") async mute(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    await this.member(id, user.id);
    const { muted } = z.object({ muted: z.boolean() }).strict().parse(input);
    if (muted)
      await this.ctx.pool.query(
        "INSERT INTO conversation_mute(conversation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, user.id],
      );
    else
      await this.ctx.pool.query(
        "DELETE FROM conversation_mute WHERE conversation_id=$1 AND user_id=$2",
        [id, user.id],
      );
    return { muted };
  }
}
