import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { Context, CONTEXT } from './context.js';
import { categories, neighborhoods, conditions } from './catalog.js';
import { listingInput, profileInput } from './validation.js';
import { listings, favorites } from './database/schema.js';

const publicSelect = `SELECT l.id,l.seller_id AS "sellerId",l.title,l.description,l.defects,l.price_minor AS "priceMinor",l.category_id AS "categoryId",l.condition,l.neighborhood,l.negotiable,l.status,l.images,l.demo,l.created_at AS "createdAt",u.name AS "sellerName",u."createdAt" AS "sellerSince",u."phoneNumberVerified" AS "sellerPhoneVerified" FROM listing l JOIN "user" u ON u.id=l.seller_id`;

@ApiTags('Marketplace')
@Controller('v1')
export class ListingsController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Get('health') health() { return { status: 'ok', name: 'OFFERME', version: '0.1.0', market: 'Addis Ababa' }; }
  @Get('catalog') catalog() { return { categories, neighborhoods, conditions, currency: 'ETB', city: 'Addis Ababa' }; }
  @Get('me') async me(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return { id: user.id, name: user.name, phoneNumber: user.phoneNumber, phoneNumberVerified: user.phoneNumberVerified, createdAt: user.createdAt, admin: !!user.phoneNumberVerified && this.ctx.config.adminPhones.includes(user.phoneNumber || '') };
  }
  @Patch('me') async profile(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req); const data = profileInput.parse(input);
    await this.ctx.pool.query('UPDATE "user" SET name=$1,"updatedAt"=now() WHERE id=$2', [data.name, user.id]);
    return { id: user.id, name: data.name };
  }
  @Get('listings') async browse(@Query() query: Record<string, string>) {
    const params: unknown[] = []; const clauses = ["l.status='active'"];
    const add = (sql: string, value: unknown) => { params.push(value); clauses.push(sql.replace('?', '$' + params.length)); };
    if (query.q?.trim()) {
      const value = query.q.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
      add("(l.title ILIKE ? OR l.description ILIKE ?)", `%${value}%`);
      clauses[clauses.length - 1] = clauses[clauses.length - 1].replace('?', '$' + params.length);
    }
    if (query.category) add('l.category_id=?', query.category);
    if (query.neighborhood) add('l.neighborhood=?', query.neighborhood);
    if (query.condition) add('l.condition=?', query.condition);
    if (query.min) add('l.price_minor>=?', z.coerce.number().int().min(0).parse(query.min));
    if (query.max) add('l.price_minor<=?', z.coerce.number().int().min(0).parse(query.max));
    if (query.seller) add('l.seller_id=?', query.seller);
    const page = z.coerce.number().int().min(1).max(10000).parse(query.page || 1);
    const sort = query.sort === 'price_low' ? 'l.price_minor ASC,l.id' : query.sort === 'price_high' ? 'l.price_minor DESC,l.id' : 'l.created_at DESC,l.id DESC';
    const count = await this.ctx.pool.query(`SELECT count(*)::int AS total FROM listing l WHERE ${clauses.join(' AND ')}`, params);
    const result = await this.ctx.pool.query(`${publicSelect} WHERE ${clauses.join(' AND ')} ORDER BY ${sort} LIMIT 24 OFFSET ${(page - 1) * 24}`, params);
    return { items: result.rows, total: count.rows[0].total, page, hasMore: page * 24 < count.rows[0].total };
  }
  @Get('listings/mine') async mine(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return { items: (await this.ctx.pool.query(`${publicSelect} WHERE l.seller_id=$1 ORDER BY l.created_at DESC`, [user.id])).rows };
  }
  @Get('listings/:id') async detail(@Param('id') id: string, @Req() req: Request) {
    const result = await this.ctx.pool.query(`${publicSelect} WHERE l.id=$1`, [id]);
    const item = result.rows[0]; if (!item) throw new NotFoundException('This listing was not found.');
    if (['removed', 'archived'].includes(item.status)) {
      const session = await this.ctx.session(req);
      if (session?.user.id !== item.sellerId) throw new NotFoundException('This listing is unavailable.');
    }
    return item;
  }
  async validateImages(images: string[], ownerId: string) {
    if (new Set(images).size !== images.length) throw new BadRequestException('Choose different photos.');
    const result = await this.ctx.pool.query('SELECT path FROM media WHERE owner_id=$1 AND path=ANY($2::text[])', [ownerId, images]);
    if (result.rowCount !== images.length) throw new BadRequestException('Use photos you uploaded to your account.');
  }
  @Post('listings') async create(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req); const data = listingInput.parse(input);
    await this.validateImages(data.images, user.id);
    const [item] = await this.ctx.db.insert(listings).values({ ...data, id: randomUUID(), sellerId: user.id }).returning();
    return item;
  }
  @Patch('listings/:id') async update(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const data = listingInput.parse(input);
    const [existing] = await this.ctx.db.select().from(listings).where(and(eq(listings.id, id), eq(listings.sellerId, user.id)));
    if (!existing) throw new NotFoundException('Listing not found.');
    if (['sold', 'removed'].includes(existing.status)) throw new BadRequestException('This listing can no longer be edited.');
    await this.validateImages(data.images, user.id);
    const [updated] = await this.ctx.db.update(listings).set({ ...data, updatedAt: new Date() }).where(eq(listings.id, id)).returning();
    return updated;
  }
  @Patch('listings/:id/status') async status(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const user = await this.ctx.user(req); const { status } = z.object({ status: z.enum(['active', 'reserved', 'sold', 'archived']) }).strict().parse(input);
    const result = await this.ctx.pool.query("UPDATE listing SET status=$1,updated_at=now() WHERE id=$2 AND seller_id=$3 AND status NOT IN ('removed','sold') RETURNING id,status", [status, id, user.id]);
    if (!result.rowCount) throw new BadRequestException('This listing cannot be changed. Sold listings stay sold.');
    return result.rows[0];
  }
  @Post('media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: Request, @UploadedFile() file?: Express.Multer.File) {
    const user = await this.ctx.user(req);
    if (!file || !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.mimetype)) throw new BadRequestException('Choose a JPG, PNG, WebP, or supported HEIC image under 8 MB.');
    const id = randomUUID(); const path = `/media/${id}.webp`;
    let image: Buffer;
    try { image = await sharp(file.buffer, { limitInputPixels: 25_000_000 }).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(); }
    catch { throw new BadRequestException('This photo could not be read. Try a JPG or PNG.'); }
    const stored = await this.ctx.storage.upload({ key: `${id}.webp`, body: image, contentType: 'image/webp' });
    try {
      await this.ctx.pool.query('INSERT INTO media(id,owner_id,path,storage) VALUES($1,$2,$3,$4)', [id, user.id, path, JSON.stringify(stored)]);
    } catch (error) {
      try { await this.ctx.storage.remove(stored); }
      catch { console.error('Could not clean up unrecorded media:', id); }
      throw error;
    }
    return { id, url: path };
  }
  @Get('favorites') async saved(@Req() req: Request) {
    const user = await this.ctx.user(req);
    return { items: (await this.ctx.pool.query(`${publicSelect} JOIN favorite f ON f.listing_id=l.id WHERE f.user_id=$1 AND l.status NOT IN ('removed','archived') ORDER BY f.created_at DESC`, [user.id])).rows };
  }
  @Post('favorites/:id') async save(@Req() req: Request, @Param('id') id: string) {
    const user = await this.ctx.user(req); await this.detail(id, req);
    await this.ctx.db.insert(favorites).values({ userId: user.id, listingId: id }).onConflictDoNothing();
    return { saved: true };
  }
  @Delete('favorites/:id') async unsave(@Req() req: Request, @Param('id') id: string) {
    const user = await this.ctx.user(req);
    await this.ctx.db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.listingId, id)));
    return { saved: false };
  }
}
