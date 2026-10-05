import { registerBoardOperations } from './boardOperations';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import { ZodError } from 'zod';
import { createDatabase, type Database } from './db';
import { config, type Config } from './config';
import { ApiError } from './security';
import { Documents } from './documents';
import { registerAuth } from './auth';
import { registerBoards } from './boards';
import { registerRealtime } from './realtime';
import { registerSharing } from './sharing';
import { registerComments } from './comments';
import { Storage } from './storage';
import { registerAssets } from './assets';
import { registerPreviews } from './previews';
import { registerExports } from './exports';
export async function createApp(
  options: { settings?: Partial<Config>; database?: Database; logger?: boolean } = {},
) {
  const settings = config(options.settings),
    db = options.database ?? (await createDatabase(settings));
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers.x-csrf-token',
            'req.headers.x-share-password',
          ],
          serializers: {
            req(request) {
              return {
                method: request.method,
                url: request.url
                  ?.split('?')[0]
                  ?.replace(/(\/(?:shares|published|invitations)\/)[^/]+/, '$1[redacted]'),
                remoteAddress: request.ip,
              };
            },
          },
        }
      : false,
    bodyLimit: 3 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    loggerInstance: undefined,
  });
  const documents = new Documents(db);
  let refreshBusy = false;
  const refreshTimer = setInterval(() => {
    if (refreshBusy) return;
    refreshBusy = true;
    void Promise.all([...documents.rooms.keys()].map((id) => documents.refresh(id)))
      .catch((error) => app.log.error({ err: error }, 'Falha ao atualizar documentos'))
      .finally(() => {
        refreshBusy = false;
      });
  }, 500);
  refreshTimer.unref();
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: settings.cookieSecret });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024, files: 1 } });
  await app.register(websocket, { options: { maxPayload: 3 * 1024 * 1024 } });
  await app.register(swagger, {
    openapi: { info: { title: 'Atelier Desk API', version: '1.0.0' } },
  });
  app.addHook('onRequest', async (request) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method)) {
      const supplied = request.headers.origin;
      if (supplied && supplied !== settings.origin)
        throw new ApiError(403, 'ORIGIN_DENIED', 'Origem não permitida.');
      if (settings.production && !supplied)
        throw new ApiError(403, 'ORIGIN_REQUIRED', 'Origem necessária para esta ação.');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Confira os campos informados.',
        fieldErrors: error.flatten().fieldErrors,
        requestId: request.id,
      });
    if (error instanceof ApiError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message, requestId: request.id });
    app.log.error({ err: error, requestId: request.id }, 'Falha na requisição');
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    return reply.code(status).send({
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir. Tente novamente.',
      requestId: request.id,
    });
  });
  app.get('/api/v1/health', async () => ({ ok: true }));
  app.get('/api/v1/ready', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });
  app.get('/api/v1/openapi.json', async () => app.swagger());
  registerAuth(app, db, settings, documents);
  registerBoards(app, db, documents);
  registerBoardOperations(app, db, documents);
  registerRealtime(app, db, documents, settings.origin);
  registerSharing(app, db, documents, settings);
  registerComments(app, db, settings);
  const storage = new Storage(settings);
  registerAssets(app, db, storage, settings);
  const exportWorker = registerExports(app, db, documents, storage, settings.workerEnabled);
  registerPreviews(app, db);
  app.addHook('onClose', async () => {
    clearInterval(refreshTimer);
    await exportWorker.close();
    await Promise.all([...documents.rooms.values()].map((room) => room.queue));
    documents.close();
    if (!options.database) await db.close();
  });
  return { app, db, documents, settings };
}
