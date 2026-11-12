import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CONTEXT, Context } from './context.js';
import { messageInput } from './validation.js';

@ApiTags('Conversations')
@Controller('v1/conversations')
export class ConversationsController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  async member(id: string, userId: string) {
    const result = await this.ctx.pool.query('SELECT * FROM conversation WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)', [id, userId]);
    if (!result.rowCount) throw new NotFoundException('Conversation not found.');
    return result.rows[0] as { id: string; buyer_id: string; seller_id: string; listing_id: string };
  }
  @Get() async list(@Req() req: Request) {
    const user = await this.ctx.user(req);
    const result = await this.ctx.pool.query(`SELECT c.id,c.listing_id AS "listingId",c.buyer_id AS "buyerId",c.seller_id AS "sellerId",c.updated_at AS "updatedAt",l.title,l.images,l.price_minor AS "priceMinor",u.name AS "otherName",u.id AS "otherId",(SELECT body FROM message m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS "lastMessage" FROM conversation c JOIN listing l ON l.id=c.listing_id JOIN "user" u ON u.id=CASE WHEN c.buyer_id=$1 THEN c.seller_id ELSE c.buyer_id END WHERE c.buyer_id=$1 OR c.seller_id=$1 ORDER BY c.updated_at DESC`, [user.id]);
    return { items: result.rows };
  }
  @Post() async create(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req); const { listingId } = z.object({ listingId: z.string().min(1).max(100) }).strict().parse(input);
    const listing = (await this.ctx.pool.query("SELECT seller_id,status FROM listing WHERE id=$1 AND status NOT IN ('removed','archived')", [listingId])).rows[0];
    if (!listing) throw new NotFoundException('This listing is unavailable.');
    if (listing.seller_id === user.id) throw new BadRequestException('You cannot message yourself.');
    await this.ctx.unblocked(user.id, listing.seller_id);
    const existing = (await this.ctx.pool.query('SELECT id FROM conversation WHERE listing_id=$1 AND buyer_id=$2', [listingId, user.id])).rows[0];
    if (existing) return existing;
    if (listing.status !== 'active') throw new BadRequestException('This item is no longer available.');
    const result = await this.ctx.pool.query('INSERT INTO conversation(id,listing_id,buyer_id,seller_id) VALUES($1,$2,$3,$4) ON CONFLICT(listing_id,buyer_id) DO UPDATE SET listing_id=EXCLUDED.listing_id RETURNING id', [randomUUID(), listingId, user.id, listing.seller_id]);
    return result.rows[0];
  }
  @Get(':id') async detail(@Req() req: Request, @Param('id') id: string, @Query('before') before?: string) {
    const user = await this.ctx.user(req); const conversation = await this.member(id, user.id);
    const values: unknown[] = [id]; let cursor = '';
    if (before) { values.push(before); cursor = 'AND (created_at,id) < (SELECT created_at,id FROM message WHERE id=$2 AND conversation_id=$1)'; }
    const messages = await this.ctx.pool.query(`SELECT id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId" FROM message WHERE conversation_id=$1 ${cursor} ORDER BY created_at DESC,id DESC LIMIT 100`, values);
    const offers = await this.ctx.pool.query('SELECT id,sender_id AS "senderId",amount_minor AS "amountMinor",status,created_at AS "createdAt" FROM offer WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 50', [id]);
    const meetups = await this.ctx.pool.query('SELECT id,proposer_id AS "proposerId",place,scheduled_at AS "scheduledAt",status FROM meetup WHERE conversation_id=$1 ORDER BY created_at DESC LIMIT 20', [id]);
    const blocked = await this.ctx.pool.query('SELECT 1 FROM block WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)', [conversation.buyer_id, conversation.seller_id]);
    return { id, buyerId: conversation.buyer_id, sellerId: conversation.seller_id, listingId: conversation.listing_id, messages: messages.rows.reverse(), offers: offers.rows, meetups: meetups.rows, hasEarlier: messages.rowCount === 100, blocked: !!blocked.rowCount };
  }
  @Post(':id/messages') async send(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const data = messageInput.parse(input); const conversation = await this.member(id, user.id);
    await this.ctx.unblocked(conversation.buyer_id, conversation.seller_id);
    const result = await this.ctx.pool.query('INSERT INTO message(id,conversation_id,sender_id,client_id,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,client_id) DO NOTHING RETURNING id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId"', [randomUUID(), id, user.id, data.clientId, data.body]);
    let message = result.rows[0];
    if (!message) {
      const previous = await this.ctx.pool.query('SELECT id,sender_id AS "senderId",body,created_at AS "createdAt",client_id AS "clientId",conversation_id FROM message WHERE sender_id=$1 AND client_id=$2', [user.id, data.clientId]);
      if (previous.rows[0]?.conversation_id !== id || previous.rows[0]?.body !== data.body) throw new BadRequestException('That message identifier was already used.');
      message = previous.rows[0]; delete message.conversation_id;
    }
    await this.ctx.pool.query('UPDATE conversation SET updated_at=now() WHERE id=$1', [id]);
    this.ctx.notify([conversation.buyer_id, conversation.seller_id], 'conversation.updated', { id });
    return message;
  }
  @Post(':id/offers') async offer(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const { amountMinor } = z.object({ amountMinor: z.number().int().positive().max(2_000_000_000) }).strict().parse(input);
    const conversation = await this.member(id, user.id); await this.ctx.unblocked(conversation.buyer_id, conversation.seller_id);
    const listing = (await this.ctx.pool.query('SELECT status,negotiable,price_minor FROM listing WHERE id=$1', [conversation.listing_id])).rows[0];
    if (listing.status !== 'active') throw new BadRequestException('This item is not accepting offers.');
    if (!listing.negotiable && amountMinor !== listing.price_minor) throw new BadRequestException('The seller has set a firm price.');
    const result = await this.ctx.pool.query('INSERT INTO offer(id,conversation_id,sender_id,amount_minor) VALUES($1,$2,$3,$4) RETURNING id,status', [randomUUID(), id, user.id, amountMinor]);
    this.ctx.notify([conversation.buyer_id, conversation.seller_id], 'conversation.updated', { id });
    return result.rows[0];
  }
  @Patch(':id/offers/:offerId') async respond(@Req() req: Request, @Param('id') id: string, @Param('offerId') offerId: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const conversation = await this.member(id, user.id);
    await this.ctx.unblocked(conversation.buyer_id, conversation.seller_id);
    const { status } = z.object({ status: z.enum(['accepted','declined','withdrawn']) }).strict().parse(input);
    const result = await this.ctx.pool.query(`UPDATE offer SET status=$1 WHERE id=$2 AND conversation_id=$3 AND status='pending' AND sender_id ${status === 'withdrawn' ? '=' : '<>'} $4 RETURNING id,status`, [status, offerId, id, user.id]);
    if (!result.rowCount) throw new BadRequestException('This offer can no longer be changed.');
    this.ctx.notify([conversation.buyer_id, conversation.seller_id], 'conversation.updated', { id });
    return result.rows[0];
  }
  @Post(':id/meetups') async proposeMeetup(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const conversation = await this.member(id, user.id);
    await this.ctx.unblocked(conversation.buyer_id, conversation.seller_id);
    const data = z.object({ place: z.string().trim().min(5).max(250), scheduledAt: z.iso.datetime({ offset: true }) }).strict().parse(input);
    const date = new Date(data.scheduledAt);
    if (date.getTime() < Date.now() || date.getTime() > Date.now() + 90 * 86400000) throw new BadRequestException('Choose a meetup within the next 90 days.');
    const result = await this.ctx.pool.query('INSERT INTO meetup(id,conversation_id,proposer_id,place,scheduled_at) VALUES($1,$2,$3,$4,$5) RETURNING id,status', [randomUUID(), id, user.id, data.place, date]);
    this.ctx.notify([conversation.buyer_id, conversation.seller_id], 'conversation.updated', { id });
    return result.rows[0];
  }
  @Patch(':id/meetups/:meetupId') async meetupStatus(@Req() req: Request, @Param('id') id: string, @Param('meetupId') meetupId: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const conversation = await this.member(id, user.id);
    await this.ctx.unblocked(conversation.buyer_id, conversation.seller_id);
    const { status } = z.object({ status: z.enum(['confirmed','cancelled','completed']) }).strict().parse(input);
    const where = status === 'confirmed' ? "status='proposed' AND proposer_id<>$4" : status === 'completed' ? "status='confirmed' AND scheduled_at<=now() AND $4::text IS NOT NULL" : "status IN ('proposed','confirmed') AND $4::text IS NOT NULL";
    const result = await this.ctx.pool.query(`UPDATE meetup SET status=$1 WHERE id=$2 AND conversation_id=$3 AND ${where} RETURNING id,status`, [status, meetupId, id, user.id]);
    if (!result.rowCount) throw new BadRequestException('This meetup cannot be changed.');
    this.ctx.notify([conversation.buyer_id, conversation.seller_id], 'conversation.updated', { id });
    return result.rows[0];
  }
}
