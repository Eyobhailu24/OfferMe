import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, HttpException, Catch, type ExceptionFilter, type ArgumentsHost } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node';
import { Server } from 'socket.io';
import { ZodError } from 'zod';
import type { FileStorage } from './storage.js';
import { MediaController } from './media.controller.js';
import type { Configuration } from './config.js';
import { CONTEXT, Context } from './context.js';
import { ListingsController } from './listings.controller.js';
import { ConversationsController } from './conversations.controller.js';
import { ModerationController } from './moderation.controller.js';
import { migrate } from './database/migrate.js';

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError) {
      response.status(400).json({ message: error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; ') });
    } else if (error instanceof HttpException) {
      const detail = error.getResponse();
      response.status(error.getStatus()).json(typeof detail === 'string' ? { message: detail } : detail);
    } else {
      console.error('Request failed:', error instanceof Error ? error.message : 'Unknown error');
      response.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
  }
}

export async function createApplication(config: Configuration, options: { migrate?: boolean; onOtp?: (phone: string, code: string) => void; quiet?: boolean; storage?: FileStorage } = {}) {
  const context = new Context(config, options.onOtp, options.storage);
  if (options.migrate) await migrate(context.pool, context.auth);
  @Module({
    controllers: [ListingsController, ConversationsController, ModerationController, MediaController],
    providers: [{ provide: CONTEXT, useValue: context }],
  })
  class ApplicationModule {}
  const app = await NestFactory.create(ApplicationModule, { bodyParser: false, logger: options.quiet ? false : ['log','warn','error'] });
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const http = app.getHttpAdapter().getInstance() as express.Express;
  http.set('trust proxy', config.trustedProxyIps.length ? config.trustedProxyIps : false);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Replace any client-supplied header with Express's socket/trusted-proxy result.
    req.headers['x-offerme-client-ip'] = req.ip || req.socket.remoteAddress || '';
    next();
  });
  http.all('/api/auth/*path', toNodeHandler(context.auth));
  app.use(express.json({ limit: '1mb' }));
  app.use('/v1', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: config.trustedProxyIps.length > 0 } }));
  app.use('/v1', (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && origin && origin !== config.webOrigin && origin !== 'offerme://') {
      res.status(403).json({ message: 'This request origin is not allowed.' }); return;
    }
    next();
  });
  app.useGlobalFilters(new ApiErrors());
  const apiDocument = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('OFFERME API').setDescription('Addis Ababa local marketplace. Purchase payments happen directly between participants.').setVersion('0.1.0').addCookieAuth().build());
  SwaggerModule.setup('docs', app, apiDocument, { jsonDocumentUrl: '/openapi.json' });
  const io = new Server(app.getHttpServer(), { cors: { origin: config.webOrigin, credentials: true }, maxHttpBufferSize: 32_768 });
  context.io = io;
  io.use(async (socket, next) => {
    try {
      const cookie = socket.handshake.headers.cookie || socket.handshake.auth?.cookie;
      if (typeof cookie !== 'string' || cookie.length > 8192) return next(new Error('Sign in to connect.'));
      const session = await context.auth.api.getSession({ headers: fromNodeHeaders({ cookie }) });
      if (!session) return next(new Error('Sign in to connect.'));
      socket.data.userId = session.user.id;
      next();
    } catch { next(new Error('Sign in to connect.')); }
  });
  io.on('connection', socket => { void socket.join('user:' + socket.data.userId); });
  await app.init();
  return {
    app, context, apiDocument,
    async close() { await new Promise<void>(done => io.close(() => done())); await app.close(); await context.pool.end(); },
  };
}
