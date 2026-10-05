import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import * as Y from 'yjs';
import { BoardDocument } from '@atelier/domain';
import { createApp } from './app';
import { publicAddress } from './previews';
import { Documents } from './documents';
type Session = { cookie: string; csrf: string; id: string; boardId: string };
describe('compartilhamento, arquivos, comentários e exportações', () => {
  let instance: Awaited<ReturnType<typeof createApp>>,
    directory: string,
    owner: Session,
    reader: Session,
    linkId: string,
    viewToken: string,
    assetId: string;
  const headers = (session: Session) => ({ cookie: session.cookie, 'x-csrf-token': session.csrf });
  async function register(email: string, name: string): Promise<Session> {
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'SenhaSegura123!', displayName: name },
    });
    expect(result.statusCode).toBe(201);
    const data = result.json();
    await instance.db.query('UPDATE users SET verified_at=now() WHERE id=$1', [data.user.id]);
    return {
      cookie: result.cookies.map((c) => c.name + '=' + c.value).join('; '),
      csrf: data.csrfToken,
      id: data.user.id,
      boardId: data.boardId,
    };
  }
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'atelier-features-'));
    instance = await createApp({ settings: { dataDir: directory } });
    owner = await register('owner@example.test', 'Proprietária');
    reader = await register('reader@example.test', 'Leitora');
  }, 30000);
  afterAll(async () => {
    await instance?.app.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it('publica snapshot sanitizado sem histórico, membros ou comentários', async () => {
    const created = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/shares',
      headers: headers(owner),
      payload: { role: 'viewer' },
    });
    expect(created.statusCode).toBe(200);
    viewToken = created.json().token;
    linkId = created.json().id;
    const result = await instance.app.inject('/api/v1/shares/' + viewToken);
    expect(result.statusCode).toBe(200);
    expect(result.json().state.cards).toHaveLength(7);
    expect(result.json().update).toBeUndefined();
    expect(result.json().members).toBeUndefined();
    expect(result.body).not.toContain('owner@example.test');
  });
  it('encerra permissões aceitas quando o link vence', async () => {
    const grant = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/shares',
      headers: headers(owner),
      payload: { role: 'editor' },
    });
    await instance.app.inject({
      method: 'POST',
      url: '/api/v1/shares/' + grant.json().token + '/accept',
      headers: headers(reader),
      payload: {},
    });
    await instance.db.query(
      "UPDATE share_links SET expires_at=now()-interval '1 second' WHERE id=$1",
      [grant.json().id],
    );
    const denied = await instance.app.inject({
      url: '/api/v1/boards/' + owner.boardId,
      headers: headers(reader),
    });
    expect(denied.statusCode).toBe(404);
    await instance.db.query('DELETE FROM board_members WHERE board_id=$1 AND user_id=$2', [
      owner.boardId,
      reader.id,
    ]);
  });
  it('preserva o acesso direto ao aceitar um link mais restrito', async () => {
    await instance.db.query(
      "INSERT INTO board_members(board_id,user_id,role) VALUES($1,$2,'editor')",
      [owner.boardId, reader.id],
    );
    await instance.app.inject({
      method: 'POST',
      url: '/api/v1/shares/' + viewToken + '/accept',
      headers: headers(reader),
      payload: {},
    });
    const access = await instance.app.inject({
      url: '/api/v1/boards/' + owner.boardId,
      headers: headers(reader),
    });
    expect(access.json().role).toBe('editor');
    await instance.db.query('DELETE FROM board_members WHERE board_id=$1 AND user_id=$2', [
      owner.boardId,
      reader.id,
    ]);
  });
  it('limita navegação pública ao conjunto explícito de descendentes', async () => {
    const child = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers: headers(owner),
      payload: {
        workspaceId: (
          await instance.app.inject({
            url: '/api/v1/boards/' + owner.boardId,
            headers: headers(owner),
          })
        ).json().workspace_id,
        parentId: owner.boardId,
        title: 'Quadro filho',
      },
    });
    const privateChild = await instance.app.inject(
      '/api/v1/shares/' + viewToken + '?boardId=' + child.json().id,
    );
    expect(privateChild.statusCode).toBe(404);
    const grant = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/shares',
      headers: headers(owner),
      payload: { includeDescendants: true },
    });
    const visible = await instance.app.inject(
      '/api/v1/shares/' + grant.json().token + '?boardId=' + child.json().id,
    );
    expect(visible.statusCode).toBe(200);
    expect(visible.json().board.title).toBe('Quadro filho');
  });
  it('serializa escritores independentes e conserva as duas alterações', async () => {
    const second = new Documents(instance.db),
      a = new BoardDocument(),
      b = new BoardDocument();
    const snapshot = Y.encodeStateAsUpdate((await instance.documents.get(owner.boardId)).board.doc);
    Y.applyUpdate(a.doc, snapshot);
    Y.applyUpdate(b.doc, snapshot);
    await second.get(owner.boardId);
    const aa = a.add('note', { x: 1000, y: 1000 }),
      bb = b.add('note', { x: 1400, y: 1000 });
    await Promise.all([
      instance.documents.update(
        owner.boardId,
        owner.id,
        Y.encodeStateAsUpdate(a.doc),
        1,
        crypto.randomUUID(),
      ),
      second.update(owner.boardId, owner.id, Y.encodeStateAsUpdate(b.doc), 1, crypto.randomUUID()),
    ]);
    const state = await instance.documents.snapshot(owner.boardId);
    expect(state.cards.map((c) => c.id)).toContain(aa);
    expect(state.cards.map((c) => c.id)).toContain(bb);
    second.close();
    a.destroy();
    b.destroy();
  });
  it('impede mutações de uma conta com acesso somente leitura', async () => {
    const accepted = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/shares/' + viewToken + '/accept',
      headers: headers(reader),
      payload: {},
    });
    expect(accepted.statusCode).toBe(200);
    const document = new BoardDocument();
    document.add('note', { x: 0, y: 0 });
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/commands',
      headers: headers(reader),
      payload: {
        update: Buffer.from(Y.encodeStateAsUpdate(document.doc)).toString('base64'),
        epoch: 1,
        updateId: crypto.randomUUID(),
      },
    });
    expect(result.statusCode).toBe(403);
    document.destroy();
    const meta = await instance.app.inject({
      url: '/api/v1/boards/' + owner.boardId,
      headers: headers(reader),
    });
    expect(meta.json().role).toBe('viewer');
  });
  it('permite comentários e cria uma notificação por menção', async () => {
    const grant = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/shares',
      headers: headers(owner),
      payload: { role: 'commenter' },
    });
    await instance.app.inject({
      method: 'POST',
      url: '/api/v1/shares/' + grant.json().token + '/accept',
      headers: headers(reader),
      payload: {},
    });
    const comment = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/comments',
      headers: headers(owner),
      payload: { body: 'Uma nova direção para discutirmos.', mentions: [reader.id, reader.id] },
    });
    expect(comment.statusCode).toBe(200);
    const notifications = await instance.app.inject({
      url: '/api/v1/notifications',
      headers: headers(reader),
    });
    expect(notifications.json().items).toHaveLength(1);
    const publicResult = await instance.app.inject('/api/v1/shares/' + viewToken);
    expect(publicResult.body).not.toContain('Uma nova direção para discutirmos.');
  });
  it('não permite mencionar pessoas sem acesso', async () => {
    const outsider = await register('outsider@example.test', 'Outra pessoa');
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/comments',
      headers: headers(owner),
      payload: { body: 'Menção inválida', mentions: [outsider.id] },
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().code).toBe('MENTION_FORBIDDEN');
  });
  it('revoga link e acesso concedido por ele', async () => {
    const result = await instance.app.inject({
      method: 'DELETE',
      url: '/api/v1/boards/' + owner.boardId + '/shares/' + linkId,
      headers: headers(owner),
    });
    expect(result.statusCode).toBe(200);
    expect((await instance.app.inject('/api/v1/shares/' + viewToken)).statusCode).toBe(404);
  });
  it('exige senha e não deixa a senha aparecer na resposta', async () => {
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/shares',
      headers: headers(owner),
      payload: { role: 'viewer', password: 'SenhaDoQuadro!' },
    });
    const raw = result.json().token;
    expect((await instance.app.inject('/api/v1/shares/' + raw)).statusCode).toBe(401);
    const unlocked = await instance.app.inject({
      url: '/api/v1/shares/' + raw,
      headers: { 'x-share-password': 'SenhaDoQuadro!' },
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.body).not.toContain('SenhaDoQuadro!');
  });
  it('verifica MIME e serve um upload somente a quem tem acesso', async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#A8B6A0' },
    })
      .png()
      .toBuffer();
    const boundary = 'atelier-test-boundary',
      payload = Buffer.concat([
        Buffer.from(
          '--' +
            boundary +
            '\r\nContent-Disposition: form-data; name="file"; filename="referencia.png"\r\nContent-Type: image/jpeg\r\n\r\n',
        ),
        png,
        Buffer.from('\r\n--' + boundary + '--\r\n'),
      ]);
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/assets/uploads?boardId=' + owner.boardId,
      headers: { ...headers(owner), 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload,
    });
    expect(result.statusCode).toBe(201);
    expect(result.json().mime).toBe('image/png');
    assetId = result.json().id;
    expect((await instance.app.inject('/api/v1/assets/' + assetId + '/content')).statusCode).toBe(
      401,
    );
    const downloaded = await instance.app.inject({
      url: '/api/v1/assets/' + assetId + '/content',
      headers: headers(owner),
    });
    expect(downloaded.statusCode).toBe(200);
    expect((await sharp(downloaded.rawPayload).metadata()).width).toBe(32);
    const bootstrap = await instance.app.inject({
      url: '/api/v1/boards/' + owner.boardId + '/bootstrap',
      headers: headers(owner),
    });
    const doc = new BoardDocument();
    Y.applyUpdate(doc.doc, Buffer.from(bootstrap.json().update, 'base64'));
    const vector = Y.encodeStateVector(doc.doc);
    const card = doc.add('image', { x: 0, y: 560 });
    doc.patch(card, {
      content: {
        assetId,
        filename: 'referencia.png',
        mime: 'image/png',
        bytes: png.length,
        caption: 'Uma referência original',
      },
    });
    const updated = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards/' + owner.boardId + '/commands',
      headers: headers(owner),
      payload: {
        update: Buffer.from(Y.encodeStateAsUpdate(doc.doc, vector)).toString('base64'),
        epoch: 1,
        updateId: crypto.randomUUID(),
      },
    });
    expect(updated.statusCode).toBe(200);
    doc.destroy();
  });
  it('bloqueia SSRF antes de buscar endereços locais', async () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.2',
      '169.254.169.254',
      '::1',
      'fc00::1',
    ])
      expect(publicAddress(address)).toBe(false);
    const result = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/link-previews',
      headers: headers(owner),
      payload: { url: 'http://127.0.0.1:3001/api/v1/health', boardId: owner.boardId },
    });
    expect(result.statusCode).toBe(400);
    expect(result.json().code).toBe('URL_DENIED');
  });
  it.each(['markdown', 'zip', 'png', 'pdf'])(
    'gera e permite baixar um arquivo %s válido',
    async (format) => {
      const result = await instance.app.inject({
        method: 'POST',
        url: '/api/v1/boards/' + owner.boardId + '/exports',
        headers: headers(owner),
        payload: { format },
      });
      expect(result.statusCode).toBe(202);
      const jobId = result.json().id;
      await vi.waitFor(
        async () => {
          const job = await instance.app.inject({
            url: '/api/v1/jobs/' + jobId,
            headers: headers(owner),
          });
          if (job.json().status === 'failed') throw new Error(job.json().error);
          expect(job.json().status).toBe('ready');
        },
        { timeout: 15000, interval: 100 },
      );
      const download = await instance.app.inject({
        url: '/api/v1/jobs/' + jobId + '/download',
        headers: headers(owner),
      });
      expect(download.statusCode).toBe(200);
      if (format === 'markdown') expect(download.body).toContain('Campanha de primavera');
      if (format === 'zip') expect(download.rawPayload.subarray(0, 2).toString()).toBe('PK');
      if (format === 'png')
        expect((await sharp(download.rawPayload).metadata()).width).toBeGreaterThan(300);
      if (format === 'pdf') expect(download.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    },
    20000,
  );
});
