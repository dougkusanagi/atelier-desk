import { userReadModel } from './readModel';
import * as Y from 'yjs';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { BoardDocument, BUILTIN_TEMPLATES, templateState } from '@atelier/domain';
import type { Database } from './db';
import { Documents } from './documents';
import {
  ApiError,
  boardRole,
  currentUser,
  requireRole,
  uuid,
  verifyCsrf,
  type BoardRow,
} from './security';
export function registerBoards(app: FastifyInstance, db: Database, documents: Documents) {
  const auth = async (request: import('fastify').FastifyRequest, write = false) => {
    const user = await currentUser(db, request);
    if (write) verifyCsrf(user, request);
    return user;
  };
  app.get('/api/v1/workspaces', async (request) => {
    const user = await auth(request);
    const result = await db.query(
      'SELECT w.*,m.role FROM workspaces w JOIN workspace_members m ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at',
      [user.id],
    );
    return { items: result.rows };
  });
  app.post('/api/v1/workspaces', async (request) => {
    const user = await auth(request, true),
      input = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body),
      workspaceId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO workspaces(id,name,owner_id) VALUES($1,$2,$3)', [
        workspaceId,
        input.name,
        user.id,
      ]);
      await tx.query('INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)', [
        workspaceId,
        user.id,
        'owner',
      ]);
    });
    return { id: workspaceId, name: input.name };
  });
  app.get('/api/v1/boards', async (request) => {
    const user = await auth(request);
    const input = z
      .object({ workspaceId: uuid.optional(), trash: z.enum(['true', 'false']).optional() })
      .parse(request.query);
    const result = await db.query<BoardRow>(
      'SELECT b.*, (f.board_id IS NOT NULL) AS favorite,v.last_visited FROM boards b LEFT JOIN board_favorites f ON f.board_id=b.id AND f.user_id=$2 LEFT JOIN board_visits v ON v.board_id=b.id AND v.user_id=$2 WHERE ($1::uuid IS NULL OR workspace_id=$1) ORDER BY updated_at DESC',
      [input.workspaceId ?? null, user.id],
    );
    const items = [];
    for (const board of result.rows) {
      if (Boolean(board.deleted_at) !== (input.trash === 'true')) continue;
      if (board.kind === 'unsorted' && board.owner_id !== user.id) continue;
      try {
        const access = await boardRole(db, board.id, user.id, input.trash === 'true');
        items.push({ ...board, role: access.role });
      } catch {
        /* Excluir quadros inacessíveis. */
      }
    }
    return { items };
  });
  app.post('/api/v1/boards', async (request, reply) => {
    const user = await auth(request, true);
    const input = z
      .object({
        id: uuid.optional(),
        workspaceId: uuid,
        title: z.string().trim().min(1).max(200),
        parentId: uuid.nullable().optional(),
        templateId: z.string().optional(),
        kind: z.enum(['board', 'unsorted']).default('board'),
      })
      .parse(request.body);
    const member = await db.query(
      'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
      [input.workspaceId, user.id],
    );
    if (!member.rows.length) throw new ApiError(404, 'NOT_FOUND', 'Espaço não encontrado.');
    if (input.parentId) {
      const parent = await boardRole(db, input.parentId, user.id);
      requireRole(parent.role, 'editor');
      if (parent.board.workspace_id !== input.workspaceId)
        throw new ApiError(409, 'WORKSPACE_CONFLICT', 'O quadro pai pertence a outro espaço.');
    }
    const boardId = input.id ?? crypto.randomUUID();
    const existing = await db.query<BoardRow>('SELECT * FROM boards WHERE id=$1', [boardId]);
    if (existing.rows[0]) {
      const access = await boardRole(db, boardId, user.id);
      return { ...access.board, role: access.role };
    }
    let state = input.templateId
      ? templateState(input.templateId)
      : { cards: [], connectors: [], revision: 0 };
    if (input.templateId && uuid.safeParse(input.templateId).success) {
      const saved = await db.query<{ document: typeof state }>(
        'SELECT document FROM templates WHERE id=$1 AND workspace_id=$2',
        [input.templateId, input.workspaceId],
      );
      if (!saved.rows[0]) throw new ApiError(404, 'TEMPLATE_NOT_FOUND', 'Template não encontrado.');
      const temp = new BoardDocument();
      temp.insert(saved.rows[0].document.cards, saved.rows[0].document.connectors);
      temp.duplicate(
        temp.snapshot().cards.map((c) => c.id),
        0,
      );
      const originalIds = new Set(saved.rows[0].document.cards.map((c) => c.id));
      state = {
        cards: temp.snapshot().cards.filter((c) => !originalIds.has(c.id)),
        connectors: temp
          .snapshot()
          .connectors.filter((c) => !saved.rows[0].document.connectors.some((o) => o.id === c.id)),
        revision: 0,
      };
      temp.destroy();
    }
    await db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO boards(id,workspace_id,owner_id,parent_id,title,kind) VALUES($1,$2,$3,$4,$5,$6)',
        [boardId, input.workspaceId, user.id, input.parentId ?? null, input.title, input.kind],
      );
      await documents.create(tx, boardId, state);
    });
    return reply.code(201).send({
      ...(await db.query<BoardRow>('SELECT * FROM boards WHERE id=$1', [boardId])).rows[0],
      role: 'owner',
    });
  });
  app.get('/api/v1/boards/:id', async (request) => {
    const user = await auth(request),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    return { ...access.board, role: access.role };
  });
  app.patch('/api/v1/boards/:id', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    const input = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).optional(),
        icon: z.string().max(40).optional(),
        favorite: z.boolean().optional(),
        inheritAccess: z.boolean().optional(),
        coverAsset: uuid.nullable().optional(),
      })
      .parse(request.body);
    if (Object.keys(input).some((key) => key !== 'favorite')) requireRole(access.role, 'editor');
    if (input.inheritAccess !== undefined) requireRole(access.role, 'owner');
    if (input.favorite !== undefined) {
      if (input.favorite)
        await db.query(
          'INSERT INTO board_favorites(user_id,board_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [user.id, id],
        );
      else
        await db.query('DELETE FROM board_favorites WHERE user_id=$1 AND board_id=$2', [
          user.id,
          id,
        ]);
    }
    if (input.coverAsset !== undefined) {
      if (input.coverAsset) {
        const asset = await db.query(
          "SELECT 1 FROM assets a JOIN asset_references r ON r.asset_id=a.id WHERE a.id=$1 AND r.board_id=$2 AND a.mime LIKE 'image/%'",
          [input.coverAsset, id],
        );
        if (!asset.rows.length)
          throw new ApiError(
            403,
            'ASSET_FORBIDDEN',
            'Escolha uma imagem deste quadro para a capa.',
          );
      }
      await db.query('UPDATE boards SET cover_asset=$2 WHERE id=$1', [id, input.coverAsset]);
    }

    await db.query(
      'UPDATE boards SET title=COALESCE($2,title),description=COALESCE($3,description),icon=COALESCE($4,icon),favorite=COALESCE($5,favorite),inherit_access=COALESCE($6,inherit_access),version=version+1,updated_at=now() WHERE id=$1',
      [
        id,
        input.title ?? null,
        input.description ?? null,
        input.icon ?? null,
        null,
        input.inheritAccess ?? null,
      ],
    );
    return { ok: true };
  });
  app.post('/api/v1/boards/:id/move', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'owner');
    const input = z
      .object({ parentId: uuid.nullable(), version: z.number().int() })
      .parse(request.body);
    if (input.parentId) {
      const target = await boardRole(db, input.parentId, user.id);
      requireRole(target.role, 'editor');
      if (target.board.workspace_id !== access.board.workspace_id)
        throw new ApiError(409, 'WORKSPACE_CONFLICT', 'Mova quadros dentro do mesmo espaço.');
    }
    await db.transaction(async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
        access.board.workspace_id,
      ]);
      const current = await tx.query<BoardRow>('SELECT * FROM boards WHERE id=$1', [id]);
      if (current.rows[0].version !== input.version)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'O quadro foi alterado. Atualize e tente novamente.',
        );
      if (input.parentId) {
        const ancestors = await tx.query<{ id: string; depth: number }>(
          'WITH RECURSIVE tree AS (SELECT id,parent_id,1 AS depth FROM boards WHERE id=$1 UNION ALL SELECT b.id,b.parent_id,t.depth+1 FROM boards b JOIN tree t ON b.id=t.parent_id WHERE t.depth<51) SELECT id,depth FROM tree',
          [input.parentId],
        );
        if (ancestors.rows.some((b) => b.id === id) || ancestors.rows.length >= 50)
          throw new ApiError(
            409,
            'HIERARCHY_CYCLE',
            'Não é possível criar um ciclo ou ultrapassar 50 níveis.',
          );
      }
      await tx.query('UPDATE boards SET parent_id=$2,version=version+1 WHERE id=$1', [
        id,
        input.parentId,
      ]);
    });
    return { ok: true };
  });
  app.delete('/api/v1/boards/:id', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'owner');
    const batch = crypto.randomUUID();
    await db.query(
      'WITH RECURSIVE tree AS (SELECT id FROM boards WHERE id=$1 AND deleted_at IS NULL UNION ALL SELECT b.id FROM boards b JOIN tree t ON b.parent_id=t.id WHERE b.deleted_at IS NULL) UPDATE boards SET deleted_at=now(),deletion_batch=$2 WHERE id IN (SELECT id FROM tree)',
      [id, batch],
    );
    return { ok: true };
  });
  app.post('/api/v1/boards/:id/restore', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id, true);
    requireRole(access.role, 'owner');
    const deleted = await db.query<{ deletion_batch: string }>(
      'SELECT deletion_batch FROM boards WHERE id=$1',
      [id],
    );
    await db.transaction(async (tx) => {
      await tx.query(
        'UPDATE boards SET deleted_at=NULL,deletion_batch=NULL WHERE deletion_batch=$1',
        [deleted.rows[0].deletion_batch],
      );
      await tx.query(
        'UPDATE boards SET parent_id=NULL WHERE id=$1 AND parent_id IN (SELECT id FROM boards WHERE deleted_at IS NOT NULL)',
        [id],
      );
    });
    return { ok: true };
  });
  app.get('/api/v1/boards/:id/bootstrap', async (request) => {
    const user = await auth(request),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    await documents.refresh(id);
    const room = await documents.get(id);
    await db.query(
      'INSERT INTO board_visits(user_id,board_id) VALUES($1,$2) ON CONFLICT(user_id,board_id) DO UPDATE SET last_visited=now()',
      [user.id, id],
    );
    return {
      board: { ...access.board, role: access.role },
      ...(['owner', 'editor'].includes(access.role)
        ? { update: Buffer.from(Y.encodeStateAsUpdate(room.board.doc)).toString('base64') }
        : { state: await userReadModel(db, await documents.snapshot(id), user.id) }),
      epoch: room.epoch,
      sequence: room.sequence,
    };
  });
  app.post('/api/v1/boards/:id/commands', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params);
    const input = z
      .object({ update: z.string().max(3_000_000), epoch: z.number().int(), updateId: uuid })
      .parse(request.body);
    return documents.update(
      id,
      user.id,
      Buffer.from(input.update, 'base64'),
      input.epoch,
      input.updateId,
    );
  });
  app.get('/api/v1/boards/:id/history', async (request) => {
    const user = await auth(request),
      { id } = z.object({ id: uuid }).parse(request.params),
      { offset } = z
        .object({ offset: z.coerce.number().int().min(0).max(1_000_000).default(0) })
        .parse(request.query);
    const access = await boardRole(db, id, user.id);
    requireRole(access.role, 'editor');
    const result = await db.query(
      "SELECT c.id,c.actor_id,c.label,c.undone,(c.undo_record IS NOT NULL AND c.undo_record<>'null'::jsonb) AS undoable,(c.redo_record IS NOT NULL AND c.redo_record<>'null'::jsonb) AS redoable,c.created_at,u.display_name FROM board_commands c LEFT JOIN users u ON u.id=c.actor_id WHERE c.board_id=$1 AND c.created_at>now()-interval '30 days' ORDER BY c.created_at DESC,c.id DESC LIMIT 101 OFFSET $2",
      [id, offset],
    );
    const versions = await db.query(
      'SELECT id,description,sequence,created_at FROM board_versions WHERE board_id=$1 ORDER BY created_at DESC LIMIT 50',
      [id],
    );
    return {
      items: result.rows.slice(0, 100),
      versions: versions.rows,
      nextOffset: result.rows.length > 100 ? offset + 100 : null,
    };
  });
  app.post('/api/v1/boards/:id/history/step', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      input = z.object({ redo: z.boolean().default(false), updateId: uuid }).parse(request.body);
    const access = await boardRole(db, id, user.id);
    requireRole(access.role, 'editor');
    const record = input.redo ? 'redo_record' : 'undo_record',
      order = input.redo ? 'reverted_at' : 'created_at';
    const command = (
      await db.query<{ id: string }>(
        "SELECT id FROM board_commands WHERE board_id=$1 AND actor_id=$2 AND undone=$3 AND created_at>now()-interval '30 days' AND " +
          record +
          ' IS NOT NULL AND ' +
          record +
          "<>'null'::jsonb ORDER BY " +
          order +
          ' DESC,id DESC LIMIT 1',
        [id, user.id, input.redo],
      )
    ).rows[0];
    if (!command)
      throw new ApiError(
        409,
        'HISTORY_EMPTY',
        input.redo ? 'Nenhuma alteração para refazer.' : 'Nenhuma alteração para desfazer.',
      );
    return documents.revert(id, user.id, command.id, input.redo, input.updateId);
  });
  app.post('/api/v1/boards/:id/history/:commandId/revert', async (request) => {
    const user = await auth(request, true),
      { id, commandId } = z.object({ id: uuid, commandId: uuid }).parse(request.params),
      input = z.object({ redo: z.boolean().default(false), updateId: uuid }).parse(request.body);
    return documents.revert(id, user.id, commandId, input.redo, input.updateId);
  });
  app.post('/api/v1/boards/:id/checkpoints', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'editor');
    const input = z
      .object({ description: z.string().max(200).default('Versão salva') })
      .parse(request.body ?? {});
    await documents.refresh(id);
    const room = await documents.get(id),
      checkpoint = crypto.randomUUID();
    await db.query(
      'INSERT INTO board_versions(id,board_id,sequence,snapshot,actor_id,description) VALUES($1,$2,$3,$4,$5,$6)',
      [
        checkpoint,
        id,
        room.sequence,
        Buffer.from(Y.encodeStateAsUpdate(room.board.doc)),
        user.id,
        input.description,
      ],
    );
    return { id: checkpoint };
  });
  app.get('/api/v1/templates', async (request) => {
    const user = await auth(request);
    const { workspaceId } = z.object({ workspaceId: uuid.optional() }).parse(request.query);
    const custom = await db.query(
      'SELECT t.id,t.name,t.category FROM templates t JOIN workspace_members m ON m.workspace_id=t.workspace_id WHERE m.user_id=$1 AND ($2::uuid IS NULL OR t.workspace_id=$2)',
      [user.id, workspaceId ?? null],
    );
    return { items: [...BUILTIN_TEMPLATES, ...custom.rows] };
  });
  app.post('/api/v1/boards/:id/template', async (request) => {
    const user = await auth(request, true),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'editor');
    const input = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    const state = await documents.snapshot(id);
    const safe = {
      ...state,
      cards: state.cards.map((c) => ({
        ...c,
        content: { ...c.content, boardId: undefined, owned: undefined },
        layout: c.layout,
      })),
    };
    const templateId = crypto.randomUUID();
    await db.query(
      'INSERT INTO templates(id,workspace_id,owner_id,name,category,document) VALUES($1,$2,$3,$4,$5,$6)',
      [
        templateId,
        access.board.workspace_id,
        user.id,
        input.name,
        'Meus templates',
        JSON.stringify(safe),
      ],
    );
    return { id: templateId };
  });
  app.get('/api/v1/search', async (request) => {
    const user = await auth(request),
      input = z
        .object({
          q: z.string().max(200),
          workspaceId: uuid.optional(),
          type: z.string().optional(),
        })
        .parse(request.query);
    const query = input.q.trim().toLocaleLowerCase('pt-BR');
    if (!query) return { items: [] };
    const boards = await db.query<BoardRow>(
      'SELECT * FROM boards WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR workspace_id=$1)',
      [input.workspaceId ?? null],
    );
    const items = [];
    for (const board of boards.rows) {
      try {
        await boardRole(db, board.id, user.id);
      } catch {
        continue;
      }
      if (board.kind === 'unsorted' && board.owner_id !== user.id) continue;
      if (board.title.toLocaleLowerCase('pt-BR').includes(query))
        items.push({
          boardId: board.id,
          boardTitle: board.title,
          type: 'board',
          text: board.title,
        });
      const state = await documents.snapshot(board.id);
      for (const card of state.cards) {
        if (input.type && input.type !== card.type) continue;
        const text = [
          card.content.title,
          card.content.text,
          card.content.caption,
          card.content.url,
          card.content.filename,
          ...(card.content.tasks?.map((t) => t.text) ?? []),
        ]
          .filter(Boolean)
          .join(' ');
        if (text.toLocaleLowerCase('pt-BR').includes(query))
          items.push({
            boardId: board.id,
            boardTitle: board.title,
            cardId: card.id,
            type: card.type,
            text: text.slice(0, 240),
          });
      }
    }
    return { items: items.slice(0, 100) };
  });
}
