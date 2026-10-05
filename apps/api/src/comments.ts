import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from './db';
import type { Config } from './config';
import { ApiError, boardRole, currentUser, requireRole, uuid, verifyCsrf } from './security';
import { sendMail } from './mail';
export function registerComments(app: FastifyInstance, db: Database, settings: Config) {
  app.get('/api/v1/boards/:id/comments', async (request) => {
    const user = await currentUser(db, request),
      { id } = z.object({ id: uuid }).parse(request.params);
    await boardRole(db, id, user.id);
    const threads = await db.query<{ id: string; card_id: string; resolved: boolean }>(
      'SELECT * FROM comment_threads WHERE board_id=$1 ORDER BY created_at',
      [id],
    );
    const items = [];
    for (const thread of threads.rows) {
      const comments = await db.query(
        'SELECT c.id,c.author_id,c.body,c.mentions,c.created_at,c.edited_at,u.display_name FROM comments c JOIN users u ON u.id=c.author_id WHERE c.thread_id=$1 AND c.deleted_at IS NULL ORDER BY c.created_at',
        [thread.id],
      );
      if (comments.rows.length) items.push({ ...thread, comments: comments.rows });
    }
    return { items };
  });
  app.post('/api/v1/boards/:id/comments', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'commenter');
    const input = z
      .object({
        body: z.string().trim().min(1).max(10000),
        cardId: z.string().uuid().optional(),
        threadId: uuid.optional(),
        mentions: z.array(uuid).max(20).default([]),
      })
      .parse(request.body);
    const recipients = [...new Set(input.mentions)];
    for (const recipient of recipients) {
      try {
        await boardRole(db, id, recipient);
      } catch {
        throw new ApiError(
          400,
          'MENTION_FORBIDDEN',
          'Só é possível mencionar pessoas com acesso ao quadro.',
        );
      }
    }
    const threadId = input.threadId ?? crypto.randomUUID(),
      commentId = crypto.randomUUID();
    if (input.threadId) {
      const valid = await db.query('SELECT id FROM comment_threads WHERE id=$1 AND board_id=$2', [
        threadId,
        id,
      ]);
      if (!valid.rows.length)
        throw new ApiError(404, 'THREAD_NOT_FOUND', 'Conversa não encontrada.');
    }
    await db.transaction(async (tx) => {
      if (!input.threadId)
        await tx.query('INSERT INTO comment_threads(id,board_id,card_id) VALUES($1,$2,$3)', [
          threadId,
          id,
          input.cardId ?? null,
        ]);
      await tx.query(
        'INSERT INTO comments(id,thread_id,author_id,body,mentions) VALUES($1,$2,$3,$4,$5)',
        [commentId, threadId, user.id, input.body, JSON.stringify(recipients)],
      );
      for (const recipient of recipients) {
        await tx.query(
          'INSERT INTO mentions(comment_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [commentId, recipient],
        );
        if (recipient !== user.id)
          await tx.query(
            'INSERT INTO notifications(id,user_id,actor_id,kind,board_id,entity_id,message,dedup_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(dedup_key) DO NOTHING',
            [
              crypto.randomUUID(),
              recipient,
              user.id,
              'mention',
              id,
              threadId,
              user.display_name + ' mencionou você em ' + access.board.title,
              commentId + ':' + recipient,
            ],
          );
      }
    });
    for (const recipient of recipients.filter((r) => r !== user.id)) {
      const result = await db.query<{ email: string; preferences: { emailMentions?: boolean } }>(
        'SELECT email,preferences FROM users WHERE id=$1',
        [recipient],
      );
      if (result.rows[0]?.preferences.emailMentions !== false)
        await sendMail(
          settings,
          result.rows[0].email,
          'Você foi mencionado no Atelier Desk',
          user.display_name +
            ' mencionou você em ' +
            access.board.title +
            '. Veja: ' +
            settings.origin +
            '/quadro/' +
            id,
        );
    }
    return { id: commentId, threadId };
  });
  app.patch('/api/v1/boards/:id/comments/:threadId', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id, threadId } = z.object({ id: uuid, threadId: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'commenter');
    const input = z.object({ resolved: z.boolean() }).parse(request.body);
    await db.query('UPDATE comment_threads SET resolved=$3 WHERE id=$1 AND board_id=$2', [
      threadId,
      id,
      input.resolved,
    ]);
    return { ok: true };
  });
  const ownComment = async (request: import('fastify').FastifyRequest) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const result = await db.query<{ author_id: string; board_id: string }>(
      'SELECT c.author_id,t.board_id FROM comments c JOIN comment_threads t ON t.id=c.thread_id WHERE c.id=$1 AND c.deleted_at IS NULL',
      [id],
    );
    if (!result.rows[0] || result.rows[0].author_id !== user.id)
      throw new ApiError(404, 'NOT_FOUND', 'Comentário não encontrado.');
    const access = await boardRole(db, result.rows[0].board_id, user.id);
    requireRole(access.role, 'commenter');
    return id;
  };
  app.patch('/api/v1/comments/:id', async (request) => {
    const id = await ownComment(request),
      input = z.object({ body: z.string().trim().min(1).max(10000) }).parse(request.body);
    await db.query('UPDATE comments SET body=$2,edited_at=now() WHERE id=$1', [id, input.body]);
    return { ok: true };
  });
  app.delete('/api/v1/comments/:id', async (request) => {
    const id = await ownComment(request);
    await db.query('UPDATE comments SET deleted_at=now() WHERE id=$1', [id]);
    return { ok: true };
  });
  app.get('/api/v1/notifications', async (request) => {
    const user = await currentUser(db, request),
      result = await db.query<{ board_id: string }>(
        'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [user.id],
      ),
      items = [];
    for (const notification of result.rows) {
      try {
        await boardRole(db, notification.board_id, user.id);
        items.push(notification);
      } catch {
        /* Permissão revogada remove dados da resposta. */
      }
    }
    return { items };
  });
  app.post('/api/v1/notifications/read', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [
      user.id,
    ]);
    return { ok: true };
  });
  app.post('/api/v1/notifications/:id/read', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    await db.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [
      id,
      user.id,
    ]);
    return { ok: true };
  });
}
