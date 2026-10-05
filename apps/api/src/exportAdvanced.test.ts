import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { BoardDocument } from '@atelier/domain';
import { createApp } from './app';
describe('exportação completa e paginada', () => {
  let instance: Awaited<ReturnType<typeof createApp>>,
    directory: string,
    headers: Record<string, string>,
    boardId: string,
    childId: string,
    drawingId: string;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'atelier-export-'));
    instance = await createApp({ settings: { dataDir: directory } });
    const registered = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'exports@example.test',
        password: 'SenhaSeguraDeTeste!',
        displayName: 'Exportações',
      },
    });
    const session = registered.json();
    headers = {
      cookie: registered.cookies.map((c) => c.name + '=' + c.value).join('; '),
      'x-csrf-token': session.csrfToken,
    };
    const root = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers,
      payload: { workspaceId: session.workspaceId, title: 'Exportação completa' },
    });
    boardId = root.json().id;
    const child = await instance.app.inject({
      method: 'POST',
      url: '/api/v1/boards',
      headers,
      payload: {
        workspaceId: session.workspaceId,
        parentId: boardId,
        title: 'Subquadro exportado',
      },
    });
    childId = child.json().id;
    for (const [current, root] of [
      [boardId, true],
      [childId, false],
    ] as const) {
      const document = new BoardDocument();
      const note = document.add('note', { x: root ? 4300 : 0, y: -30 });
      document.patch(note, {
        content: { text: root ? 'Nota fora da primeira região' : 'Texto do subquadro' },
      });
      if (root) {
        const nested = document.add('board', { x: -100, y: 0 });
        document.patch(nested, {
          content: { boardId: childId, title: 'Subquadro exportado', owned: true },
        });
        drawingId = document.add('drawing', { x: 240, y: 0 });
        document.putStroke(drawingId, {
          id: crypto.randomUUID(),
          color: '#A45040',
          width: 3,
          points: [
            { x: 10, y: 10 },
            { x: 90, y: 90 },
          ],
        });
      }
      await instance.documents.update(
        current,
        session.user.id,
        Y.encodeStateAsUpdate(document.doc),
        1,
        crypto.randomUUID(),
      );
      document.destroy();
    }
  }, 30000);
  afterAll(async () => {
    await instance?.app.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function exportFile(payload: Record<string, unknown>) {
    const result = await instance.app.inject({
      method: 'POST',
      url: `/api/v1/boards/${boardId}/exports`,
      headers,
      payload,
    });
    expect(result.statusCode).toBe(202);
    const jobId = result.json().id;
    await vi.waitFor(
      async () => {
        const job = (await instance.app.inject({ url: '/api/v1/jobs/' + jobId, headers })).json();
        if (job.status === 'failed') throw new Error(job.error);
        expect(job.status).toBe('ready');
      },
      { timeout: 20000, interval: 100 },
    );
    return instance.app.inject({ url: '/api/v1/jobs/' + jobId + '/download', headers });
  }
  it('gera blocos PNG decodificáveis, incluindo conteúdo fora do viewport', async () => {
    const result = await exportFile({ format: 'png-zip', background: 'transparent' });
    expect(result.statusCode).toBe(200);
    const zip = await JSZip.loadAsync(result.rawPayload),
      manifest = JSON.parse(await zip.file('manifesto.json')!.async('string'));
    expect(manifest.width).toBeGreaterThan(4300);
    expect(manifest.tiles).toHaveLength(2);
    for (const tile of manifest.tiles) {
      const image = await sharp(await zip.file(tile.file)!.async('nodebuffer')).metadata();
      expect(image.width).toBe(tile.width);
      expect(image.height).toBe(tile.height);
      expect(image.hasAlpha).toBe(true);
    }
  }, 30000);
  it('gera PDF A4 com páginas adicionais para o subquadro', async () => {
    const result = await exportFile({ format: 'pdf', pdfLayout: 'a4', includeDescendants: true });
    const pdf = await PDFDocument.load(result.rawPayload);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(6);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo((297 * 72) / 25.4, 0);
      expect(page.getHeight()).toBeCloseTo((210 * 72) / 25.4, 0);
    }
  }, 30000);
  it('gera ZIP recursivo com links relativos e desenhos presentes', async () => {
    const result = await exportFile({ format: 'zip', includeDescendants: true });
    const zip = await JSZip.loadAsync(result.rawPayload);
    const root = await zip.file('Exportação completa.md')!.async('string');
    expect(root).toContain('boards/' + childId + '.md');
    expect(await zip.file('boards/' + childId + '.md')!.async('string')).toContain(
      'Texto do subquadro',
    );
    expect(await zip.file('drawings/' + drawingId + '.svg')!.async('string')).toContain('<path');
  });
});
