import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cloneState } from '@atelier/domain';
import type { Database } from './db';
import type { Documents } from './documents';
import { userReadModel } from './readModel';
import {
  ApiError,
  boardRole,
  currentUser,
  requireRole,
  uuid,
  verifyCsrf,
  type BoardRow,
} from './security';
export function registerBoardOperations(app: FastifyInstance, db: Database, documents: Documents) {
  app.post('/api/v1/boards/:id/duplicate', async (request, reply) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    const root = await boardRole(db, id, user.id);
    requireRole(root.role, 'editor');
    const input = z
      .object({ title: z.string().trim().min(1).max(200).optional() })
      .parse(request.body ?? {});
    const membership = await db.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
      [root.board.workspace_id, user.id],
    );
    if (!membership.rows.length)
      throw new ApiError(
        403,
        'WORKSPACE_REQUIRED',
        'Entre no espaço de trabalho antes de duplicar o quadro.',
      );
    const hierarchy = await db.query<BoardRow>(
      `WITH RECURSIVE tree AS (
      SELECT b.*,0 AS depth FROM boards b WHERE id=$1 AND deleted_at IS NULL
      UNION ALL SELECT b.*,tree.depth+1 FROM boards b JOIN tree ON b.parent_id=tree.id
      WHERE b.deleted_at IS NULL AND tree.depth<49
    ) SELECT * FROM tree ORDER BY depth`,
      [id],
    );
    if (hierarchy.rows.length > 100)
      throw new ApiError(413, 'CLONE_LIMIT', 'Duplique até 100 quadros por operação.');
    const accessible: BoardRow[] = [];
    for (const board of hierarchy.rows) {
      if (board.id !== id && !accessible.some((parent) => parent.id === board.parent_id)) continue;
      try {
        await boardRole(db, board.id, user.id);
        accessible.push(board);
      } catch (error) {
        if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
      }
    }
    const mapping = new Map(accessible.map((board) => [board.id, crypto.randomUUID()]));
    const states = await Promise.all(
      accessible.map(async (board) =>
        cloneState(await userReadModel(db, await documents.snapshot(board.id), user.id), mapping),
      ),
    );
    await db.transaction(async (tx) => {
      for (let i = 0; i < accessible.length; i++) {
        const board = accessible[i];
        await tx.query(
          'INSERT INTO boards(id,workspace_id,owner_id,parent_id,title,description,icon,cover_asset) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            mapping.get(board.id),
            board.workspace_id,
            user.id,
            board.id === id ? null : mapping.get(board.parent_id!),
            board.id === id ? (input.title ?? board.title.slice(0, 190) + ' — cópia') : board.title,
            board.description,
            board.icon,
            board.cover_asset,
          ],
        );
        await documents.create(tx, mapping.get(board.id)!, states[i]);
      }
    });
    return reply.code(201).send({ id: mapping.get(id), count: accessible.length });
  });
}
