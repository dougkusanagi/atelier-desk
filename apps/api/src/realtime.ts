import { userReadModel } from './readModel';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as Y from 'yjs';
import type { Database } from './db';
import { Documents } from './documents';
import { ApiError, currentUser, boardRole, uuid } from './security';
export function registerRealtime(
  app: FastifyInstance,
  db: Database,
  documents: Documents,
  origin: string,
) {
  app.get('/collab/:id', { websocket: true }, (socket, request) => {
    let cleanup = () => {};
    const send = (event: Record<string, unknown>) => {
      if (socket.readyState === 1) socket.send(JSON.stringify(event));
    };
    let lastPresence = 0;
    const initialize = async () => {
      if (request.headers.origin !== origin)
        throw new ApiError(403, 'ORIGIN_DENIED', 'Origem não permitida.');
      const user = await currentUser(db, request),
        { id } = z.object({ id: uuid }).parse(request.params);
      await documents.refresh(id);
      const access = await boardRole(db, id, user.id),
        room = await documents.get(id),
        clientId = crypto.randomUUID();
      let role = access.role;
      const sendState = async (type: 'sync' | 'snapshot') => {
        const current = await boardRole(db, id, user.id);
        role = current.role;
        send({
          type,
          state: await userReadModel(db, await documents.snapshot(id), user.id),
          epoch: room.epoch,
          sequence: room.sequence,
          role,
          clientId,
        });
      };
      let delivery = Promise.resolve();
      const listener = (event: Record<string, unknown>) => {
        delivery = delivery
          .then(async () => {
            if (socket.readyState !== 1) return;
            if (event.type !== 'update') {
              send(event);
              return;
            }
            const current = await boardRole(db, id, user.id);
            role = current.role;
            if (['owner', 'editor'].includes(role)) send(event);
            else await sendState('snapshot');
          })
          .catch(() => socket.close(1008, 'ACCESS_REVOKED'));
      };
      room.listeners.add(listener);
      if (['owner', 'editor'].includes(role))
        send({
          type: 'sync',
          update: Buffer.from(Y.encodeStateAsUpdate(room.board.doc)).toString('base64'),
          epoch: room.epoch,
          sequence: room.sequence,
          role,
          clientId,
        });
      else await sendState('sync');
      socket.on('message', (raw: Buffer) => {
        void (async () => {
          if (raw.toString().length > 3_000_000)
            throw new ApiError(413, 'UPDATE_LIMIT', 'Mensagem grande demais.');
          const message = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (message.type === 'update') {
            const input = z
              .object({
                update: z.string().max(3_000_000),
                epoch: z.number().int(),
                updateId: uuid,
              })
              .parse(message);
            const result = await documents.update(
              id,
              user.id,
              Buffer.from(input.update, 'base64'),
              input.epoch,
              input.updateId,
            );
            send({ type: 'ack', updateId: input.updateId, ...result });
          } else if (message.type === 'presence' && Date.now() - lastPresence >= 45) {
            const current = await boardRole(db, id, user.id);
            lastPresence = Date.now();
            const p = z
              .object({
                x: z.number().finite(),
                y: z.number().finite(),
                selection: z.array(z.string()).max(1000),
              })
              .parse(message);
            room.listeners.forEach((fn) =>
              fn({
                type: 'presence',
                clientId,
                user: { id: user.id, name: user.display_name },
                role: current.role,
                x: p.x,
                y: p.y,
                selection: p.selection,
              }),
            );
          } else if (message.type === 'ping') {
            await currentUser(db, request);
            await boardRole(db, id, user.id);
            send({ type: 'pong' });
          }
        })().catch((error) => {
          const apiError =
            error instanceof ApiError
              ? error
              : new ApiError(400, 'INVALID_MESSAGE', 'Não foi possível processar a atualização.');
          send({ type: 'error', code: apiError.code, message: apiError.message });
          if ([401, 403, 404].includes(apiError.status)) socket.close(1008, apiError.code);
        });
      });
      const timer = setInterval(() => {
        void currentUser(db, request)
          .then(() => boardRole(db, id, user.id))
          .then(async (current) => {
            if (current.role === role) return;
            if (['owner', 'editor'].includes(current.role)) socket.close(1012, 'ROLE_CHANGED');
            else await sendState('snapshot');
          })
          .catch(() => socket.close(1008, 'ACCESS_REVOKED'));
      }, 4000);
      cleanup = () => {
        clearInterval(timer);
        room.listeners.delete(listener);
        room.listeners.forEach((fn) => fn({ type: 'leave', clientId }));
      };
      if (socket.readyState !== 1) cleanup();
    };
    socket.on('close', () => cleanup());
    socket.on('error', () => cleanup());
    void initialize().catch((error) => {
      send({
        type: 'error',
        code: error instanceof ApiError ? error.code : 'CONNECTION_FAILED',
        message: 'Não foi possível acessar o quadro.',
      });
      socket.close(1008);
    });
  });
}
