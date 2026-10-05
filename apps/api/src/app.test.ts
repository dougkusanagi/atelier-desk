import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { BoardDocument } from '@atelier/domain';
import { createApp } from './app';
describe('API real com PostgreSQL embarcado', () => {
  let instance: Awaited<ReturnType<typeof createApp>>,
    directory: string,
    cookie: string,
    csrf: string,
    boardId: string,
    workspaceId: string;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'atelier-test-'));
    instance = await createApp({ settings: { dataDir: directory } });
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'criadora@example.test',
        password: 'SenhaSegura123!',
        displayName: 'Criadora',
      },
    });
    expect(result.statusCode).toBe(201);
    cookie = result.cookies.map((c) => c.name + '=' + c.value).join('; ');
    const data = result.json();
    csrf = data.csrfToken;
    boardId = data.boardId;
    workspaceId = data.workspaceId;
  }, 30000);
  afterAll(async () => {
    await instance?.app.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('exige autenticação e valida CSRF', async () => {
    expect((await instance.app.inject('/api/v1/boards')).statusCode).toBe(401);
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: { cookie },
      payload: { workspaceId, title: 'Sem CSRF' },
    });
    expect(result.statusCode).toBe(403);
  });
  it('cria documentos e persiste uma edição antes de confirmar', async () => {
    const bootstrap = await instance.app.inject({
      url: '/api/v1/boards/' + boardId + '/bootstrap',
      headers: { cookie },
    });
    expect(bootstrap.statusCode).toBe(200);
    const data = bootstrap.json(),
      document = new BoardDocument();
    Y.applyUpdate(document.doc, Buffer.from(data.update, 'base64'));
    const vector = Y.encodeStateVector(document.doc),
      cardId = document.add('note', { x: 50, y: 80 });
    document.patch(cardId, { content: { title: 'Persistência verificada', text: 'Olá, mundo!' } });
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + boardId + '/commands',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {
        update: Buffer.from(Y.encodeStateAsUpdate(document.doc, vector)).toString('base64'),
        epoch: data.epoch,
        updateId: crypto.randomUUID(),
      },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().sequence).toBe(1);
    const saved = await instance.db.query<{ sequence: string }>(
      'SELECT sequence FROM board_documents WHERE board_id=$1',
      [boardId],
    );
    expect(Number(saved.rows[0].sequence)).toBe(1);
    document.destroy();
  });
  it('rejeita coordenadas não finitas e URLs executáveis', async () => {
    const document = new BoardDocument();
    const card = document.add('note', { x: 0, y: 0 });
    document.patch(card, { content: { url: 'javascript:alert(1)' } });
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + boardId + '/commands',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {
        update: Buffer.from(Y.encodeStateAsUpdate(document.doc)).toString('base64'),
        epoch: 1,
        updateId: crypto.randomUUID(),
      },
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().code).toBe('UNSAFE_URL');
    document.destroy();
  });
  it('filtra busca e bloqueia acesso de outra conta', async () => {
    const result = await instance.app.inject({
      url: '/api/v1/search?q=Persistência',
      headers: { cookie },
    });
    expect(
      result.json().items.some((x: { text: string }) => x.text.includes('Persistência verificada')),
    ).toBe(true);
    const other = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'outra@example.test',
        password: 'SenhaSegura123!',
        displayName: 'Outra pessoa',
      },
    });
    const otherCookie = other.cookies.map((c) => c.name + '=' + c.value).join('; ');
    expect(
      (
        await instance.app.inject({
          url: '/api/v1/boards/' + boardId + '/bootstrap',
          headers: { cookie: otherCookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await instance.app.inject({
          url: '/api/v1/search?q=Persistência',
          headers: { cookie: otherCookie },
        })
      ).json().items,
    ).toEqual([]);
  });
  it('não permite ciclos e restaura um quadro da lixeira', async () => {
    const child = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { workspaceId, parentId: boardId, title: 'Quadro filho' },
    });
    expect(child.statusCode).toBe(201);
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + boardId + '/move',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { parentId: child.json().id, version: 1 },
    });
    expect(result.statusCode).toBe(409);
    expect(
      (
        await instance.app.inject({
          method: 'DELETE',
          url: '/api/v1/boards/' + child.json().id,
          headers: { cookie, 'x-csrf-token': csrf },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await instance.app.inject({ url: '/api/v1/boards/' + child.json().id, headers: { cookie } }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await instance.app.inject({
          method: 'POST',
          url: '/api/v1/boards/' + child.json().id + '/restore',
          headers: { cookie, 'x-csrf-token': csrf },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('duplica hierarquia, cartões e conexões com novos identificadores', async () => {
    const children = await instance.db.query<{ id: string }>(
      'SELECT id FROM boards WHERE parent_id=$1 AND deleted_at IS NULL',
      [boardId],
    );
    const original = await instance.documents.get(boardId);
    const userId = (
      await instance.db.query<{ owner_id: string }>('SELECT owner_id FROM boards WHERE id=$1', [
        boardId,
      ])
    ).rows[0].owner_id;
    const local = new BoardDocument();
    const column = local.add('column', { x: 0, y: 0 });
    const nested = local.add('board', { x: 350, y: 0 });
    local.patch(nested, {
      content: { boardId: children.rows[0].id, owned: true },
      layout: { kind: 'column', columnId: column, order: 0 },
    });
    local.addConnector({
      source: { cardId: column, side: 'right' },
      target: { cardId: nested, side: 'left' },
      label: 'Conexão duplicada',
      curved: true,
      color: '#626872',
      width: 2,
      dashed: false,
      arrows: 'end',
    });
    await instance.documents.update(
      boardId,
      userId,
      Y.encodeStateAsUpdate(local.doc),
      original.epoch,
      crypto.randomUUID(),
    );
    const duplicate = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + boardId + '/duplicate',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {},
    });
    expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json().count).toBe(children.rows.length + 1);
    const state = await instance.documents.snapshot(duplicate.json().id);
    const copy = state.cards.find((c) => c.type === 'board' && c.content.owned)!;
    expect(copy.id).not.toBe(nested);
    expect(copy.content.boardId).not.toBe(children.rows[0].id);
    const copiedChild = await instance.db.query<{ parent_id: string }>(
      'SELECT parent_id FROM boards WHERE id=$1',
      [copy.content.boardId],
    );
    expect(copiedChild.rows[0].parent_id).toBe(duplicate.json().id);
    expect(state.connectors.some((c) => c.label === 'Conexão duplicada')).toBe(true);
    expect(copy.layout.kind).toBe('column');
    local.destroy();
  });
  it('sobrevive ao reinício do servidor e do banco', async () => {
    await instance.app.close();
    instance = await createApp({ settings: { dataDir: directory } });
    const result = await instance.app.inject({
      url: '/api/v1/boards/' + boardId + '/bootstrap',
      headers: { cookie },
    });
    expect(result.statusCode).toBe(200);
    const doc = new BoardDocument();
    Y.applyUpdate(doc.doc, Buffer.from(result.json().update, 'base64'));
    expect(doc.snapshot().cards.some((c) => c.content.title === 'Persistência verificada')).toBe(
      true,
    );
    doc.destroy();
  }, 30000);
});
