import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { BoardDocument } from '../../packages/domain/src/index';
import { createApp } from '../../apps/api/src/app';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error('Defina TEST_DATABASE_URL para um banco PostgreSQL de teste isolado.');
const directory = await mkdtemp(path.join(tmpdir(), 'atelier-postgres-'));
const settings = { databaseUrl, dataDir: directory, workerEnabled: false };
const a = await createApp({ settings }),
  b = await createApp({ settings });
try {
  const registered = await a.app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `${crypto.randomUUID()}@example.test`,
      password: 'SenhaSeguraDeTeste!',
      displayName: 'Teste PostgreSQL',
    },
  });
  assert.equal(registered.statusCode, 201);
  const { user, csrfToken, boardId } = registered.json();
  const headers = {
    cookie: registered.cookies.map((c) => c.name + '=' + c.value).join('; '),
    'x-csrf-token': csrfToken,
  };
  const bootstrap = (
    await a.app.inject({ url: `/api/v1/boards/${boardId}/bootstrap`, headers })
  ).json();
  await b.app.inject({ url: `/api/v1/boards/${boardId}/bootstrap`, headers });
  const first = new BoardDocument(),
    second = new BoardDocument();
  Y.applyUpdate(first.doc, Buffer.from(bootstrap.update, 'base64'));
  Y.applyUpdate(second.doc, Buffer.from(bootstrap.update, 'base64'));
  const firstId = first.add('note', { x: 100, y: 100 }),
    secondId = second.add('note', { x: 500, y: 100 });
  const commit = async (app: typeof a, board: BoardDocument) =>
    app.app.inject({
      method: 'POST',
      url: `/api/v1/boards/${boardId}/commands`,
      headers,
      payload: {
        update: Buffer.from(Y.encodeStateAsUpdate(board.doc)).toString('base64'),
        epoch: bootstrap.epoch,
        updateId: crypto.randomUUID(),
      },
    });
  const results = await Promise.all([commit(a, first), commit(b, second)]);
  assert.deepEqual(
    results.map((result) => result.statusCode),
    [200, 200],
  );
  const state = await b.documents.snapshot(boardId);
  assert(state.cards.some((card) => card.id === firstId));
  assert(state.cards.some((card) => card.id === secondId));
  assert.equal(
    (
      await a.db.query<{ sequence: string }>(
        'SELECT sequence FROM board_documents WHERE board_id=$1',
        [boardId],
      )
    ).rows[0].sequence,
    '2',
  );
  assert.equal((await b.app.inject({ url: '/api/v1/auth/me', headers })).json().user.id, user.id);
  first.destroy();
  second.destroy();
  console.log(
    'PostgreSQL externo: duas APIs, sessão compartilhada e duas escritas concorrentes preservadas.',
  );
} finally {
  await b.app.close();
  await a.app.close();
  await rm(directory, { recursive: true, force: true });
}
