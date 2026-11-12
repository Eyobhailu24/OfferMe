import { Body, Controller, Get, Inject, Param, Patch, Post, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CONTEXT, Context } from './context.js';

@ApiTags('Safety')
@Controller('v1')
export class ModerationController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Post('reports') async report(@Req() req: Request, @Body() input: unknown) {
    const user = await this.ctx.user(req);
    const data = z.object({ listingId: z.string().max(100).optional(), userId: z.string().max(100).optional(), reason: z.string().trim().min(10).max(1000) }).strict().refine(d => !!d.listingId || !!d.userId, 'Choose a listing or person to report.').parse(input);
    if (data.listingId && !(await this.ctx.pool.query('SELECT 1 FROM listing WHERE id=$1', [data.listingId])).rowCount) throw new NotFoundException('Listing not found.');
    if (data.userId && !(await this.ctx.pool.query('SELECT 1 FROM "user" WHERE id=$1', [data.userId])).rowCount) throw new NotFoundException('User not found.');
    const id = randomUUID();
    await this.ctx.pool.query('INSERT INTO report(id,reporter_id,listing_id,reported_user_id,reason) VALUES($1,$2,$3,$4,$5)', [id,user.id,data.listingId || null,data.userId || null,data.reason]);
    return { id, status: 'open' };
  }
  @Post('blocks/:id') async block(@Req() req: Request, @Param('id') id: string) {
    const user = await this.ctx.user(req);
    if (user.id === id) throw new BadRequestException('You cannot block yourself.');
    if (!(await this.ctx.pool.query('SELECT 1 FROM "user" WHERE id=$1', [id])).rowCount) throw new NotFoundException('User not found.');
    await this.ctx.pool.query('INSERT INTO block(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id,id]);
    this.ctx.notify([user.id,id], 'conversation.updated', {});
    return { blocked: true };
  }
  @Get('admin/reports') async reports(@Req() req: Request) {
    await this.ctx.admin(req);
    return { items: (await this.ctx.pool.query('SELECT id,listing_id AS "listingId",reported_user_id AS "userId",reason,status,created_at AS "createdAt" FROM report ORDER BY created_at DESC LIMIT 100')).rows };
  }
  @Patch('admin/reports/:id') async resolveReport(@Req() req: Request, @Param('id') id: string, @Body() input: unknown) {
    const admin = await this.ctx.admin(req);
    const { status } = z.object({ status: z.enum(['resolved','dismissed']) }).strict().parse(input);
    const connection = await this.ctx.pool.connect();
    try {
      await connection.query('BEGIN');
      const result = await connection.query('UPDATE report SET status=$1,resolved_by=$2 WHERE id=$3 RETURNING id,status', [status,admin.id,id]);
      if (!result.rowCount) throw new NotFoundException('Report not found.');
      await connection.query('INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(),admin.id,'report.' + status,id]);
      await connection.query('COMMIT');
      return result.rows[0];
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
  @Patch('admin/listings/:id') async removeListing(@Req() req: Request, @Param('id') id: string) {
    const admin = await this.ctx.admin(req);
    const connection = await this.ctx.pool.connect();
    try {
      await connection.query('BEGIN');
      const result = await connection.query("UPDATE listing SET status='removed',updated_at=now() WHERE id=$1 RETURNING id,status", [id]);
      if (!result.rowCount) throw new NotFoundException('Listing not found.');
      await connection.query('INSERT INTO audit_event(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(),admin.id,'listing.removed',id]);
      await connection.query('COMMIT');
      return result.rows[0];
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    finally { connection.release(); }
  }
}
