import {
  BadRequestException,
  Body,
  Controller,
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
import {
  availableTo,
  lockListing,
  reportSale,
  setListingStatus,
  transaction,
} from "./exchange.js";

@Controller("v1")
export class ExchangesController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Post("listings/:id/reservations") async reserve(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({
        conversationId: z.string().uuid(),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .parse(input);
    const expires = new Date(data.expiresAt);
    if (
      expires.getTime() <= Date.now() ||
      expires.getTime() > Date.now() + 7 * 86400000
    )
      throw new BadRequestException("Choose an expiry within seven days.");
    return transaction(this.ctx, async (db) => {
      const listing = await lockListing(db, id);
      if (listing.seller_id !== user.id)
        throw new NotFoundException("Listing not found.");
      const c = (
        await db.query(
          "SELECT buyer_id FROM conversation WHERE id=$1 AND listing_id=$2 AND seller_id=$3",
          [data.conversationId, id, user.id],
        )
      ).rows[0];
      if (!c)
        throw new BadRequestException(
          "Choose a buyer conversation for this listing.",
        );
      await this.ctx.unblocked(user.id, c.buyer_id, db);
      const current = (
        await db.query(
          "SELECT * FROM reservation WHERE listing_id=$1 AND status='confirmed'",
          [id],
        )
      ).rows[0];
      if (current) {
        if (current.conversation_id !== data.conversationId)
          throw new BadRequestException(
            "This item is already reserved for another buyer.",
          );
        return current;
      }
      if (listing.status !== "active")
        throw new BadRequestException("Only available items can be reserved.");
      const result = (
        await db.query(
          "INSERT INTO reservation(id,listing_id,conversation_id,buyer_id,seller_id,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [randomUUID(), id, data.conversationId, c.buyer_id, user.id, expires],
        )
      ).rows[0];
      await setListingStatus(db, id, listing.status, "reserved", user.id);
      await this.ctx.enqueue(
        db,
        c.buyer_id,
        user.id,
        data.conversationId,
        "reservation",
        result.id,
      );
      return result;
    });
  }
  @Get("sales") async sales(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return {
      items: (
        await this.ctx.pool.query(
          `SELECT s.*,l.title,u.name AS other_name,
   EXISTS(SELECT 1 FROM review r WHERE r.sale_id=s.id AND r.author_id=$1) AS reviewed
   FROM sale s JOIN listing l ON l.id=s.listing_id LEFT JOIN "user" u ON u.id=CASE WHEN s.seller_id=$1 THEN s.buyer_id ELSE s.seller_id END
   WHERE s.seller_id=$1 OR s.buyer_id=$1 ORDER BY s.created_at DESC LIMIT 100`,
          [user.id],
        )
      ).rows,
    };
  }
  @Post("listings/:id/sales") async sold(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const { conversationId } = z
      .object({ conversationId: z.string().uuid().optional() })
      .strict()
      .parse(input);
    return reportSale(this.ctx, user.id, id, conversationId);
  }
  @Patch("sales/:id/confirm") async confirm(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await this.ctx.user(req);
    const result = await this.ctx.pool.query(
      "UPDATE sale SET buyer_confirmed=true WHERE id=$1 AND buyer_id=$2 RETURNING id,buyer_confirmed",
      [id, user.id],
    );
    if (!result.rowCount) throw new NotFoundException("Exchange not found.");
    return result.rows[0];
  }
  @Post("sales/:id/reviews") async review(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const user = await this.ctx.user(req);
    const data = z
      .object({
        rating: z.number().int().min(1).max(5),
        body: z.string().trim().max(1000),
      })
      .strict()
      .parse(input);
    return transaction(this.ctx, async (db) => {
      const sale = (
        await db.query(
          "SELECT * FROM sale WHERE id=$1 AND (seller_id=$2 OR buyer_id=$2) FOR UPDATE",
          [id, user.id],
        )
      ).rows[0];
      if (!sale) throw new NotFoundException("Exchange not found.");
      if (!sale.buyer_id || !sale.seller_confirmed || !sale.buyer_confirmed)
        throw new BadRequestException(
          "Both participants must confirm the exchange before reviewing.",
        );
      const previous = (
        await db.query(
          "SELECT * FROM review WHERE sale_id=$1 AND author_id=$2",
          [id, user.id],
        )
      ).rows[0];
      if (previous) {
        if (previous.rating !== data.rating || previous.body !== data.body)
          throw new BadRequestException("You already reviewed this exchange.");
        return previous;
      }
      const subject =
        sale.seller_id === user.id ? sale.buyer_id : sale.seller_id;
      return (
        await db.query(
          "INSERT INTO review(id,sale_id,author_id,subject_id,rating,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [randomUUID(), id, user.id, subject, data.rating, data.body],
        )
      ).rows[0];
    });
  }
  @Get("users/:id/reputation") async reputation(@Param("id") id: string) {
    const user = (
      await this.ctx.pool.query(
        'SELECT id,name,"createdAt" AS "createdAt","phoneNumberVerified" AS "phoneVerified" FROM "user" WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!user) throw new NotFoundException("User not found.");
    const summary = (
      await this.ctx.pool.query(
        "SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS rating FROM review WHERE subject_id=$1 AND NOT hidden",
        [id],
      )
    ).rows[0];
    const reviews = (
      await this.ctx.pool.query(
        'SELECT r.id,r.rating,r.body,r.created_at AS "createdAt",u.name AS "authorName",u.id AS "authorId" FROM review r JOIN "user" u ON u.id=r.author_id WHERE r.subject_id=$1 AND NOT r.hidden ORDER BY r.created_at DESC LIMIT 50',
        [id],
      )
    ).rows;
    return { ...user, ...summary, reviews };
  }
}
