import * as Y from 'yjs';
import { BoardDocument, type BoardState } from '@atelier/domain';
import { z } from 'zod';
import type { Database } from './db';
import { ApiError, boardRole } from './security';
const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const cardSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'note',
    'tasks',
    'image',
    'link',
    'file',
    'media',
    'color',
    'column',
    'board',
    'drawing',
  ]),
  x: finite,
  y: finite,
  width: z.number().finite().min(80).max(10000),
  height: z.number().finite().min(40).max(10000),
  z: z.number().finite(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  layout: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free') }),
    z.object({
      kind: z.literal('column'),
      columnId: z.string().uuid(),
      order: z.number().finite(),
    }),
  ]),
  content: z.record(z.string(), z.unknown()),
  deletedAt: z.string().datetime().optional(),
});
export function validateDocument(doc: Y.Doc) {
  for (const key of doc.share.keys())
    if (!['cards', 'connectors'].includes(key) && !key.startsWith('rich:'))
      throw new ApiError(400, 'INVALID_DOCUMENT', 'Estrutura de documento inválida.');
  const cards = doc.getMap<Y.Map<unknown>>('cards');
  if (cards.size > 10000 || doc.getMap('connectors').size > 20000)
    throw new ApiError(413, 'BOARD_LIMIT', 'Este quadro atingiu o limite de conteúdo.');
  cards.forEach((value, key) => {
    if (!(value instanceof Y.Map)) throw new ApiError(400, 'INVALID_CARD', 'Cartão inválido.');
    const result = cardSchema.safeParse(value.toJSON());
    if (!result.success || result.data.id !== key)
      throw new ApiError(400, 'INVALID_CARD', 'Cartão com dados inválidos.');
    const card = result.data;
    if (card.layout.kind === 'column') {
      const parent = cards.get(card.layout.columnId);
      if (card.type === 'column' || parent?.get('type') !== 'column')
        throw new ApiError(400, 'INVALID_COLUMN', 'Agrupamento de coluna inválido.');
    }
    if (JSON.stringify(card.content).length > 1_000_000)
      throw new ApiError(413, 'CARD_LIMIT', 'O conteúdo do cartão excede o limite.');
    for (const key of ['url', 'thumbnail', 'favicon']) {
      const value = card.content[key];
      if (
        typeof value === 'string' &&
        value &&
        !/^https?:\/\//i.test(value) &&
        !value.startsWith('/api/')
      )
        throw new ApiError(400, 'UNSAFE_URL', 'URL não permitida.');
    }
    if (card.type === 'color' && !/^#[0-9A-Fa-f]{6}$/.test(String(card.content.hex)))
      throw new ApiError(400, 'INVALID_COLOR', 'Informe uma cor HEX válida.');
  });
  doc.getMap<Y.Map<unknown>>('connectors').forEach((value, key) => {
    if (!(value instanceof Y.Map) || value.get('id') !== key)
      throw new ApiError(400, 'INVALID_CONNECTOR', 'Conexão inválida.');
    for (const side of ['source', 'target']) {
      const end = value.get(side) as { cardId?: string; x?: number; y?: number };
      if (
        !end ||
        (end.cardId && !cards.has(end.cardId)) ||
        (!end.cardId && (!finite.safeParse(end.x).success || !finite.safeParse(end.y).success))
      )
        throw new ApiError(400, 'INVALID_ENDPOINT', 'Extremidade de conexão inválida.');
    }
  });
}
export type DocumentRoom = {
  board: BoardDocument;
  epoch: number;
  sequence: number;
  queue: Promise<unknown>;
  listeners: Set<(event: Record<string, unknown>) => void>;
};
export class Documents {
  rooms = new Map<string, DocumentRoom>();
  constructor(readonly db: Database) {}
  async get(boardId: string): Promise<DocumentRoom> {
    const existing = this.rooms.get(boardId);
    if (existing) return existing;
    const result = await this.db.query<{ snapshot: Uint8Array; epoch: number; sequence: string }>(
      'SELECT * FROM board_documents WHERE board_id=$1',
      [boardId],
    );
    if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Documento não encontrado.');
    const doc = new Y.Doc({ gc: false });
    Y.applyUpdate(doc, new Uint8Array(result.rows[0].snapshot));
    const room: DocumentRoom = {
      board: new BoardDocument(doc),
      epoch: result.rows[0].epoch,
      sequence: Number(result.rows[0].sequence),
      queue: Promise.resolve(),
      listeners: new Set(),
    };
    const raced = this.rooms.get(boardId);
    if (raced) {
      room.board.destroy();
      return raced;
    }
    this.rooms.set(boardId, room);
    return room;
  }
  async create(database: Database, boardId: string, state: BoardState) {
    const board = new BoardDocument(new Y.Doc({ gc: false }));
    board.insert(state.cards, state.connectors);
    await database.query('INSERT INTO board_documents(board_id,snapshot) VALUES($1,$2)', [
      boardId,
      Buffer.from(Y.encodeStateAsUpdate(board.doc)),
    ]);
    board.destroy();
  }
  async update(
    boardId: string,
    userId: string,
    update: Uint8Array,
    epoch: number,
    updateId: string,
  ) {
    const room = await this.get(boardId);
    const operation = room.queue.then(async () => {
      if (update.byteLength > 2 * 1024 * 1024)
        throw new ApiError(413, 'UPDATE_LIMIT', 'Atualização excede 2MB.');
      const result = await this.db.transaction(async (tx) => {
        // PostgreSQL serializes writers across every API instance, not only this process.
        const stored = (
          await tx.query<{ snapshot: Uint8Array; epoch: number; sequence: string }>(
            'SELECT * FROM board_documents WHERE board_id=$1 FOR UPDATE',
            [boardId],
          )
        ).rows[0];
        if (!stored) throw new ApiError(404, 'NOT_FOUND', 'Documento indisponível.');
        const access = await boardRole(tx, boardId, userId);
        if (!['owner', 'editor'].includes(access.role))
          throw new ApiError(403, 'FORBIDDEN', 'Este quadro é somente leitura.');
        if (epoch !== stored.epoch)
          throw new ApiError(
            409,
            'STALE_DOCUMENT',
            'O documento local precisa ser recuperado antes de sincronizar.',
          );
        const repeated = (
          await tx.query<{ sequence: string }>(
            'SELECT sequence FROM board_updates WHERE id=$1 AND board_id=$2',
            [updateId, boardId],
          )
        ).rows[0];
        if (repeated)
          return { sequence: Number(repeated.sequence), epoch, snapshot: stored.snapshot };
        const candidate = new Y.Doc({ gc: false });
        const next = new BoardDocument(candidate);
        try {
          Y.applyUpdate(candidate, new Uint8Array(stored.snapshot), 'remote');
          const before = next.snapshot();
          Y.applyUpdate(candidate, update, 'remote');
          validateDocument(candidate);
          const after = next.snapshot(),
            changes: unknown[] = [];
          for (const [collection, previousItems, nextItems] of [
            ['cards', before.cards, after.cards],
            ['connectors', before.connectors, after.connectors],
          ] as const) {
            const old = new Map(previousItems.map((c) => [c.id, c]));
            for (const item of nextItems) {
              const previous = old.get(item.id);
              if (JSON.stringify(previous) === JSON.stringify(item)) continue;
              const fields: Record<string, unknown> = {};
              if (!previous) fields.created = { before: null, after: item };
              else
                for (const key of Object.keys(item)) {
                  const a = (previous as unknown as Record<string, unknown>)[key],
                    b = (item as unknown as Record<string, unknown>)[key];
                  if (JSON.stringify(a) !== JSON.stringify(b))
                    fields[key] = { before: a ?? null, after: b ?? null };
                }
              changes.push({ id: item.id, collection, fields });
            }
          }
          const assetIds = after.cards
            .map((c) => c.content.assetId)
            .filter((v): v is string => Boolean(v));
          for (const assetId of new Set(assetIds)) {
            const valid = await tx.query(
              'SELECT id FROM assets WHERE id=$1 AND workspace_id=$2 AND status IN ($3,$4)',
              [assetId, access.board.workspace_id, 'ready', 'unscanned-development'],
            );
            if (!valid.rows.length)
              throw new ApiError(403, 'ASSET_FORBIDDEN', 'Arquivo não disponível neste espaço.');
          }
          const sequence = Number(stored.sequence) + 1,
            snapshot = Buffer.from(Y.encodeStateAsUpdate(candidate));
          await tx.query(
            'INSERT INTO board_updates(id,board_id,epoch,sequence,actor_id,bytes,command_id) VALUES($1,$2,$3,$4,$5,$6,$1)',
            [updateId, boardId, epoch, sequence, userId, Buffer.from(update)],
          );
          await tx.query(
            'UPDATE board_documents SET snapshot=$2,sequence=$3,updated_at=now() WHERE board_id=$1',
            [boardId, snapshot, sequence],
          );
          await tx.query('UPDATE boards SET updated_at=now() WHERE id=$1', [boardId]);
          if (changes.length)
            await tx.query(
              'INSERT INTO board_commands(id,board_id,actor_id,label,changes) VALUES($1,$2,$3,$4,$5)',
              [updateId, boardId, userId, 'Edição do quadro', JSON.stringify(changes)],
            );
          await tx.query('DELETE FROM asset_references WHERE board_id=$1', [boardId]);
          for (const card of after.cards)
            if (card.content.assetId)
              await tx.query(
                'INSERT INTO asset_references(asset_id,board_id,card_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
                [card.content.assetId, boardId, card.id],
              );
          if (sequence % 500 === 0)
            await tx.query(
              'INSERT INTO board_versions(id,board_id,sequence,snapshot,actor_id,description) VALUES($1,$2,$3,$4,$5,$6)',
              [crypto.randomUUID(), boardId, sequence, snapshot, userId, 'Checkpoint automático'],
            );
          return { sequence, epoch, snapshot };
        } finally {
          next.destroy();
        }
      });
      const delta = Y.diffUpdate(
        new Uint8Array(result.snapshot),
        Y.encodeStateVector(room.board.doc),
      );
      Y.applyUpdate(room.board.doc, delta, 'remote');
      room.sequence = Math.max(room.sequence, result.sequence);
      room.epoch = result.epoch;
      room.listeners.forEach((fn) =>
        fn({
          type: 'update',
          update: Buffer.from(delta).toString('base64'),
          sequence: room.sequence,
          epoch,
          updateId,
        }),
      );
      return { sequence: result.sequence, epoch };
    });
    room.queue = operation.catch(() => {});
    return operation;
  }
  async refresh(boardId: string) {
    const room = await this.get(boardId);
    const operation = room.queue.then(async () => {
      const stored = (
        await this.db.query<{ snapshot: Uint8Array; epoch: number; sequence: string }>(
          'SELECT snapshot,epoch,sequence FROM board_documents WHERE board_id=$1',
          [boardId],
        )
      ).rows[0];
      if (!stored || (Number(stored.sequence) <= room.sequence && stored.epoch === room.epoch))
        return;
      if (stored.epoch !== room.epoch) {
        room.listeners.forEach((fn) =>
          fn({
            type: 'error',
            code: 'STALE_DOCUMENT',
            message: 'Uma versão anterior foi restaurada. Reabra o quadro.',
          }),
        );
        return;
      }
      const delta = Y.diffUpdate(
        new Uint8Array(stored.snapshot),
        Y.encodeStateVector(room.board.doc),
      );
      Y.applyUpdate(room.board.doc, delta, 'remote');
      room.sequence = Number(stored.sequence);
      room.listeners.forEach((fn) =>
        fn({
          type: 'update',
          update: Buffer.from(delta).toString('base64'),
          sequence: room.sequence,
          epoch: room.epoch,
        }),
      );
    });
    room.queue = operation.catch(() => {});
    await operation;
  }
  async snapshot(boardId: string) {
    await this.refresh(boardId);
    const room = await this.get(boardId);
    const state = room.board.snapshot();
    return {
      cards: state.cards.filter((c) => !c.deletedAt),
      connectors: state.connectors.filter((c) => !c.deletedAt),
      revision: room.sequence,
    };
  }
  close() {
    this.rooms.forEach((room) => room.board.destroy());
    this.rooms.clear();
  }
}
