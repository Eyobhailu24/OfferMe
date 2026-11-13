import { BadRequestException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Context } from "./context.js";

export async function transaction<T>(
  ctx: Context,
  run: (db: pg.PoolClient) => Promise<T>,
) {
  const db = await ctx.pool.connect();
  try {
    await db.query("BEGIN");
    const result = await run(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function lockListing(db: pg.PoolClient, id: string) {
  const row = (
    await db.query("SELECT * FROM listing WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!row) throw new NotFoundException("Listing not found.");
  const expired = await db.query(
    "UPDATE reservation SET status='expired' WHERE listing_id=$1 AND status='confirmed' AND expires_at<=now() RETURNING id",
    [id],
  );
  if (expired.rowCount && row.status === "reserved") {
    await db.query(
      "UPDATE listing SET status='active',updated_at=now() WHERE id=$1",
      [id],
    );
    row.status = "active";
  }
  await db.query(
    "UPDATE offer SET status='expired' WHERE conversation_id IN (SELECT id FROM conversation WHERE listing_id=$1) AND status='pending' AND expires_at<=now()",
    [id],
  );
  return row;
}
export async function availableTo(
  db: pg.PoolClient,
  listing: { id: string; status: string },
  buyerId: string,
) {
  if (listing.status === "reserved") {
    const mine = await db.query(
      "SELECT 1 FROM reservation WHERE listing_id=$1 AND buyer_id=$2 AND status='confirmed' AND expires_at>now()",
      [listing.id, buyerId],
    );
    if (mine.rowCount) return;
  }
  if (listing.status !== "active")
    throw new BadRequestException("This item is unavailable for this action.");
}
export async function setListingStatus(
  db: pg.PoolClient,
  id: string,
  previous: string,
  status: string,
  actor: string,
) {
  await db.query("UPDATE listing SET status=$2,updated_at=now() WHERE id=$1", [
    id,
    status,
  ]);
  if (previous !== status)
    await db.query(
      "INSERT INTO listing_status_history(listing_id,actor_id,previous_status,status) VALUES($1,$2,$3,$4)",
      [id, actor, previous, status],
    );
}
export async function reportSale(
  ctx: Context,
  sellerId: string,
  listingId: string,
  conversationId?: string,
) {
  return transaction(ctx, async (db) => {
    const listing = await lockListing(db, listingId);
    if (listing.seller_id !== sellerId)
      throw new NotFoundException("Listing not found.");
    const existing = (
      await db.query("SELECT * FROM sale WHERE listing_id=$1", [listingId])
    ).rows[0];
    if (existing) {
      if ((existing.conversation_id || undefined) !== conversationId)
        throw new BadRequestException(
          "This sale was already reported with a different buyer.",
        );
      return existing;
    }
    if (["removed", "sold", "archived"].includes(listing.status))
      throw new BadRequestException("This listing cannot be marked sold.");
    let buyerId: string | null = null;
    if (conversationId) {
      const c = (
        await db.query(
          "SELECT buyer_id FROM conversation WHERE id=$1 AND listing_id=$2 AND seller_id=$3",
          [conversationId, listingId, sellerId],
        )
      ).rows[0];
      if (!c)
        throw new BadRequestException(
          "Choose a conversation for this listing.",
        );
      buyerId = c.buyer_id;
      await ctx.unblocked(sellerId, buyerId!, db);
      await availableTo(db, listing, buyerId!);
    }
    const sale = (
      await db.query(
        "INSERT INTO sale(id,listing_id,seller_id,buyer_id,conversation_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), listingId, sellerId, buyerId, conversationId || null],
      )
    ).rows[0];
    await setListingStatus(db, listingId, listing.status, "sold", sellerId);
    await db.query(
      "UPDATE reservation SET status=CASE WHEN buyer_id=$2 THEN 'completed' ELSE 'cancelled' END WHERE listing_id=$1 AND status='confirmed'",
      [listingId, buyerId],
    );
    await db.query(
      "UPDATE offer SET status='withdrawn' WHERE conversation_id IN (SELECT id FROM conversation WHERE listing_id=$1) AND status='pending'",
      [listingId],
    );
    if (buyerId)
      await ctx.enqueue(
        db,
        buyerId,
        sellerId,
        conversationId!,
        "sale",
        sale.id,
      );
    return sale;
  });
}
