import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Context, CONTEXT } from './context.js';
import type { StoredFile } from './storage.js';

@Controller('media')
export class MediaController {
  constructor(@Inject(CONTEXT) private readonly ctx: Context) {}
  @Get(':filename') async read(@Param('filename') filename: string, @Res() response: Response) {
    if (!/^[a-f0-9-]+\.webp$/.test(filename)) throw new NotFoundException();
    const result = await this.ctx.pool.query<{ storage: StoredFile | null }>('SELECT storage FROM media WHERE path=$1', ['/media/' + filename]);
    if (!result.rowCount) throw new NotFoundException();
    const file = result.rows[0].storage;
    if (!file || file.provider === 'local') {
      // Preserve pre-cloud uploads already present on disk.
      response.sendFile(filename, { root: this.ctx.config.uploadDir, maxAge: '7d', immutable: true, dotfiles: 'deny' }, error => {
        if (error && !response.headersSent) response.status(404).json({ message: 'Image not found.' });
      });
      return;
    }
    const url = await this.ctx.storage.deliveryUrl(file);
    if (!url) throw new NotFoundException();
    // Do not cache a redirect containing an expiring S3 signature.
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, url);
  }
}
