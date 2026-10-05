import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { BoardDocument } from '@atelier/domain';
import { createApp } from './app';
let instance: Awaited<ReturnType<typeof createApp>>,
  directory: string,
  boardId: string,
  noteId: string,
  localCommand: string,
  creationCommand: string;
let owner: { id: string; cookie: string; csrf: string }, editor: typeof owner;
const headers = (session: typeof owner) => ({
  cookie: session.cookie,
  'x-csrf-token': session.csrf,
});
async function register(name: string) {
  const result = await instance.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: name + '@example.test', password: 'SenhaSegura123!', displayName: name },
  });
  const data = result.json();
  return {
    id: data.user.id,
    cookie: result.cookies.map((c) => c.name + '=' + c.value).join('; '),
    csrf: data.csrfToken,
    boardId: data.boardId,
  };
}
async function clone() {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate((await instance.documents.get(boardId)).board.doc));
  return new BoardDocument(doc);
}
async function commit(board: BoardDocument, session: typeof owner) {
  const updateId = crypto.randomUUID();
  const result = await instance.app.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/commands`,
    headers: headers(session),
    payload: {
      update: Buffer.from(Y.encodeStateAsUpdate(board.doc)).toString('base64'),
      epoch: 1,
      updateId,
    },
  });
  expect(result.statusCode).toBe(200);
  return updateId;
}
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'atelier-history-'));
  instance = await createApp({ settings: { dataDir: directory } });
  const first = await register('autora');
  owner = first;
  boardId = first.boardId;
  editor = await register('editora');
  await instance.db.query(
    "INSERT INTO board_members(board_id,user_id,role) VALUES($1,$2,'editor')",
    [boardId, editor.id],
  );
  const board = await clone();
  noteId = board.add('note', { x: 1000, y: 1000 });
  board.patch(noteId, { content: { text: 'Base' } });
  creationCommand = await commit(board, owner);
  board.destroy();
});
afterAll(async () => {
  await instance?.app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('desfaz e refaz texto após reinício preservando inserção concorrente', async () => {
  const a = await clone(),
    b = await clone();
  const text = (board: BoardDocument) =>
    (board.doc.getXmlFragment('rich:' + noteId).get(0) as Y.XmlElement).get(0) as Y.XmlText;
  a.doc.transact(() => text(a).insert(4, ' local'));
  b.doc.transact(() => text(b).insert(4, ' remoto'));
  localCommand = await commit(a, owner);
  await commit(b, editor);
  a.destroy();
  b.destroy();
  await instance.app.close();
  instance = await createApp({ settings: { dataDir: directory } });
  const undo = await instance.app.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/history/${localCommand}/revert`,
    headers: headers(owner),
    payload: { updateId: crypto.randomUUID() },
  });
  expect(undo.statusCode, undo.body).toBe(200);
  const state = await instance.documents.snapshot(boardId),
    note = state.cards.find((c) => c.id === noteId)!;
  expect(note.content.text).toContain('remoto');
  expect(note.content.text).not.toContain('local');
  const redo = await instance.app.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/history/${localCommand}/revert`,
    headers: headers(owner),
    payload: { redo: true, updateId: crypto.randomUUID() },
  });
  expect(redo.statusCode, redo.body).toBe(200);
  expect(
    (await instance.documents.snapshot(boardId)).cards.find((c) => c.id === noteId)?.content.text,
  ).toContain('local');
});
it('não exclui um cartão criado por uma pessoa quando outra já editou seu conteúdo', async () => {
  const undo = await instance.app.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/history/${creationCommand}/revert`,
    headers: headers(owner),
    payload: { updateId: crypto.randomUUID() },
  });
  expect(undo.statusCode, undo.body).toBe(200);
  expect(undo.json().skipped).toBeGreaterThan(0);
  const note = (await instance.documents.snapshot(boardId)).cards.find((c) => c.id === noteId);
  expect(note?.content.text).toContain('remoto');
});
it('recusa desfazer a alteração de outra pessoa', async () => {
  const denied = await instance.app.inject({
    method: 'POST',
    url: `/api/v1/boards/${boardId}/history/${localCommand}/revert`,
    headers: headers(editor),
    payload: { updateId: crypto.randomUUID() },
  });
  expect(denied.statusCode).toBe(404);
});
