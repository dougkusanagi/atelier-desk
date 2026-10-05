import { PDFDocument } from 'pdf-lib';
import { paginatedPdf, tiledPng } from './exportPages';
import { userReadModel } from './readModel';
import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright';
import JSZip from 'jszip';
import { z } from 'zod';
import {
  type BoardState,
  effectiveCards,
  bounds,
  connectorPath,
  endpointPoint,
  richHtml,
  boardMarkdown,
  drawingSvg,
} from '@atelier/domain';
import type { Database } from './db';
import { Documents } from './documents';
import { Storage } from './storage';
import { ApiError, requireExport, currentUser, requireRole, uuid, verifyCsrf } from './security';
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const require = createRequire(import.meta.url);
type ExportPayload = {
  state: BoardState;
  title: string;
  format: 'png' | 'png-zip' | 'pdf' | 'markdown' | 'zip';
  pdfLayout?: 'whole' | 'a4';
  boardId?: string;
  related?: Array<{ boardId: string; title: string; state: BoardState }>;
  scale: number;
  background: string;
};
async function exportHtml(payload: ExportPayload, db: Database, storage: Storage) {
  const cards = effectiveCards(payload.state.cards),
    box = bounds(cards) ?? { x: 0, y: 0, width: 600, height: 400 };
  const layers = new Map(
    [...cards].sort((a, b) => a.z - b.z || a.id.localeCompare(b.id)).map((c, i) => [c.id, i + 1]),
  );
  const width = Math.ceil(box.width + 64),
    height = Math.ceil(box.height + 64),
    images = new Map<string, string>();
  for (const card of cards.filter((c) => c.content.assetId && c.type === 'image')) {
    const result = await db.query<{ storage_key: string; mime: string }>(
      'SELECT storage_key,mime FROM assets WHERE id=$1',
      [card.content.assetId],
    );
    if (result.rows[0]) {
      const image = await storage.buffer(result.rows[0].storage_key);
      images.set(card.id, 'data:' + result.rows[0].mime + ';base64,' + image.toString('base64'));
    }
  }
  const font = await readFile(
    require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff2'),
  );
  const bold = await readFile(
    require.resolve('@fontsource/inter/files/inter-latin-600-normal.woff2'),
  );
  const render = (card: (typeof cards)[number]) => {
    const c = card.content,
      title = c.title ? '<h2>' + escape(c.title) + '</h2>' : '';
    let content: string;
    if (card.type === 'note')
      content =
        title +
        (c.rich ? richHtml(c.rich) : '<p>' + escape(c.text ?? '').replace(/\n/g, '<br>') + '</p>');
    else if (card.type === 'tasks')
      content =
        title +
        (c.tasks ?? [])
          .map(
            (t) =>
              '<div class="task">' +
              (t.done ? '☑' : '☐') +
              ' <span style="' +
              (t.done ? 'text-decoration:line-through;opacity:.65' : '') +
              '">' +
              escape(t.text) +
              '</span></div>',
          )
          .join('');
    else if (card.type === 'color')
      content = '<div class="swatch">' + title + '<span>' + escape(c.hex ?? '') + '</span></div>';
    else if (card.type === 'image') {
      const crop = c.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      content =
        (images.has(card.id)
          ? '<div style="position:relative;overflow:hidden;height:' +
            Math.max(80, card.height - 48) +
            'px"><img style="position:absolute;max-width:none;width:' +
            100 / crop.width +
            '%;height:' +
            100 / crop.height +
            '%;left:' +
            (-100 * crop.x) / crop.width +
            '%;top:' +
            (-100 * crop.y) / crop.height +
            '%;object-fit:fill" src="' +
            images.get(card.id) +
            '" alt="' +
            escape(c.alt ?? '') +
            '"></div>'
          : '<p>Imagem indisponível</p>') +
        (c.caption ? '<p class="caption">' + escape(c.caption) + '</p>' : '');
    } else if (card.type === 'drawing') content = drawingSvg(card);
    else if (card.type === 'column') content = '<h2>' + escape(c.title ?? 'Coluna') + '</h2>';
    else if (card.type === 'link')
      content =
        title +
        '<p>' +
        escape(c.description ?? '') +
        '</p><a href="' +
        escape(c.url ?? '') +
        '">' +
        escape(c.url ?? '') +
        '</a>';
    else if (card.type === 'board') content = title + '<p>Quadro aninhado</p>';
    else
      content =
        title +
        '<p>' +
        escape(c.filename ?? c.url ?? 'Mídia') +
        '</p><p>' +
        escape(c.caption ?? '') +
        '</p>';
    return (
      '<article class="card ' +
      card.type +
      '" style="left:' +
      (card.x - box.x + 32) +
      'px;top:' +
      (card.y - box.y + 32) +
      'px;width:' +
      card.width +
      'px;min-height:' +
      card.height +
      'px;z-index:' +
      (card.type === 'column' ? 0 : layers.get(card.id)) +
      ';background:' +
      escape(card.type === 'color' ? (c.hex ?? '#FFFFFF') : card.color) +
      '">' +
      content +
      '</article>'
    );
  };
  const lines = payload.state.connectors
    .filter((c) => !c.deletedAt)
    .map((line) => {
      const a = endpointPoint(line.source, cards, payload.state.cards),
        b = endpointPoint(line.target, cards, payload.state.cards);
      return (
        '<g><path d="' +
        connectorPath(line, cards, payload.state.cards) +
        '" fill="none" stroke="' +
        escape(line.color) +
        '" stroke-width="' +
        line.width +
        '" ' +
        (line.dashed ? 'stroke-dasharray="8 6" ' : '') +
        (line.arrows !== 'none' ? 'marker-end="url(#arrow)"' : '') +
        '/><text x="' +
        (a.x + b.x) / 2 +
        '" y="' +
        ((a.y + b.y) / 2 - 8) +
        '" text-anchor="middle">' +
        escape(line.label) +
        '</text></g>'
      );
    })
    .join('');
  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><style>@font-face{font-family:Inter;src:url(data:font/woff2;base64,' +
    font.toString('base64') +
    ');font-weight:400}@font-face{font-family:Inter;src:url(data:font/woff2;base64,' +
    bold.toString('base64') +
    ');font-weight:600}*{box-sizing:border-box}body{margin:0;font-family:Inter,sans-serif;color:#24272D;background:' +
    escape(payload.background) +
    '}.board{position:relative;width:' +
    width +
    'px;height:' +
    height +
    'px}.card{position:absolute;border-radius:6px;padding:16px;box-shadow:0 1px 3px #00000018;font-size:14px;line-height:1.7;overflow:hidden}h2{font-size:17px;font-weight:600;line-height:1.4;margin:0 0 12px}p{margin:0 0 10px}h1{font-size:24px}ul,ol{padding-left:20px}.column{background:#ECEEE8!important;box-shadow:none;border:1px solid #D9DFD2}.image{padding:0}.image img{display:block;width:100%;object-fit:contain}.caption{padding:8px 16px;font-size:12px}.color{display:flex;align-items:flex-end}.swatch span{font-size:12px}pre{background:#EEF0E9;padding:10px;white-space:pre-wrap}a{color:#315BCB;font-size:12px;overflow-wrap:anywhere}.task{padding:5px 0}.drawing{padding:0}.drawing svg{width:100%}text{font-size:12px;fill:#626872;paint-order:stroke;stroke:#F5F4F0;stroke-width:4px;stroke-linejoin:round}.lines{position:absolute;inset:0;overflow:visible;width:1px;height:1px}</style></head><body><div class="board"><svg class="lines" style="left:' +
    (32 - box.x) +
    'px;top:' +
    (32 - box.y) +
    'px"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#747B86"/></marker></defs>' +
    lines +
    '</svg>' +
    (cards.length
      ? cards.map(render).join('')
      : '<p style="padding:32px">Este quadro ainda não contém cartões.</p>') +
    '</div></body></html>';
  return { html, width, height };
}
export class ExportWorker {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private browser?: Browser;
  constructor(
    readonly db: Database,
    readonly documents: Documents,
    readonly storage: Storage,
  ) {}
  async start() {
    await this.db.query(
      "UPDATE jobs SET status='queued' WHERE status='processing' AND updated_at<now()-interval '10 minutes'",
    );
    this.timer = setInterval(() => void this.tick(), 1000);
    void this.tick();
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.db.query(
        "UPDATE jobs SET status='queued' WHERE status='processing' AND updated_at<now()-interval '10 minutes'",
      );
      const job = await this.db.transaction(async (tx) => {
        const result = await tx.query<{
          id: string;
          user_id: string;
          board_id: string;
          payload: ExportPayload;
        }>(
          "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
        );
        if (!result.rows[0]) return null;
        await tx.query(
          "UPDATE jobs SET status='processing',progress=10,updated_at=now() WHERE id=$1",
          [result.rows[0].id],
        );
        return result.rows[0];
      });
      if (!job) return;
      const heartbeat = setInterval(() => {
        void this.db
          .query("UPDATE jobs SET updated_at=now() WHERE id=$1 AND status='processing'", [job.id])
          .catch(() => {});
      }, 30000);
      try {
        await requireExport(this.db, job.board_id, job.user_id);
        const payload = job.payload,
          stem = payload.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'quadro';
        let data: Buffer,
          filename = stem + '.' + payload.format,
          mime = 'application/octet-stream';
        for (const related of payload.related ?? [])
          await requireExport(this.db, related.boardId, job.user_id);
        const records = [
          { boardId: payload.boardId ?? job.board_id, title: payload.title, state: payload.state },
          ...(payload.related ?? []),
        ];
        if (payload.format === 'markdown' || payload.format === 'zip') {
          const zip = new JSZip();
          const assets = new Map<string, { storage_key: string; filename: string }>();
          for (const record of records)
            for (const card of record.state.cards)
              if (card.content.assetId && !assets.has(card.content.assetId)) {
                const asset = (
                  await this.db.query<{ storage_key: string; filename: string }>(
                    'SELECT storage_key,filename FROM assets WHERE id=$1',
                    [card.content.assetId],
                  )
                ).rows[0];
                if (asset)
                  assets.set(card.content.assetId, {
                    ...asset,
                    filename:
                      asset.filename.replace(/[\\/]/g, '_').replace(/^\.+/, '') || 'arquivo',
                  });
              }
          const markdown = (record: (typeof records)[number], root: boolean) =>
            boardMarkdown(
              record.state,
              record.title,
              (card) =>
                card.content.assetId
                  ? payload.format === 'markdown'
                    ? this.storage.settings.origin +
                      '/api/v1/assets/' +
                      card.content.assetId +
                      '/content?download=1'
                    : (root ? '' : '../') +
                      'assets/' +
                      card.content.assetId +
                      '/' +
                      encodeURIComponent(assets.get(card.content.assetId)?.filename ?? 'arquivo')
                  : (card.content.url ?? ''),
              {
                boardPath: (card) =>
                  records.some((record) => record.boardId === card.content.boardId)
                    ? card.content.boardId === payload.boardId
                      ? (root ? '' : '../') + encodeURIComponent(stem) + '.md'
                      : (root ? 'boards/' : '') + card.content.boardId + '.md'
                    : undefined,
                drawingPath: (card) => (root ? '' : '../') + 'drawings/' + card.id + '.svg',
              },
            );
          if (payload.format === 'markdown') {
            data = Buffer.from(markdown(records[0], true));
            filename = stem + '.md';
            mime = 'text/markdown; charset=utf-8';
          } else {
            for (const [index, record] of records.entries()) {
              zip.file(
                index === 0 ? stem + '.md' : 'boards/' + record.boardId + '.md',
                markdown(record, index === 0),
              );
              for (const card of record.state.cards)
                if (card.type === 'drawing')
                  zip.file('drawings/' + card.id + '.svg', drawingSvg(card));
            }
            for (const [assetId, asset] of assets)
              zip.file(
                'assets/' + assetId + '/' + asset.filename,
                await this.storage.buffer(asset.storage_key),
              );
            data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
            filename = stem + '.zip';
            mime = 'application/zip';
          }
        } else {
          const rendered = await this.renderVisual(payload, job.id);
          data = rendered.data;
          mime = rendered.mime;
          filename = stem + '.' + rendered.extension;
          if (payload.format === 'pdf' && records.length > 1) {
            const combined = await PDFDocument.load(data);
            for (const record of records.slice(1)) {
              const part = await this.renderVisual(
                { ...payload, title: record.title, state: record.state },
                job.id,
              );
              const document = await PDFDocument.load(part.data);
              for (const page of await combined.copyPages(document, document.getPageIndices()))
                combined.addPage(page);
            }
            combined.setTitle(payload.title);
            data = Buffer.from(await combined.save());
          }
        }
        await requireExport(this.db, job.board_id, job.user_id);
        for (const related of payload.related ?? [])
          await requireExport(this.db, related.boardId, job.user_id);
        const current = await this.db.query<{ status: string }>(
          'SELECT status FROM jobs WHERE id=$1',
          [job.id],
        );
        if (current.rows[0]?.status === 'canceled') return;
        const key = 'exports/' + job.id + '/output';
        await this.storage.put(key, data, mime);
        await this.db.query(
          "UPDATE jobs SET status='ready',progress=100,output_key=$2,filename=$3,mime=$4,updated_at=now() WHERE id=$1",
          [job.id, key, filename, mime],
        );
      } catch (error) {
        await this.db.query(
          "UPDATE jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1 AND status<>'canceled'",
          [job.id, error instanceof Error ? error.message : 'Falha na exportação'],
        );
      } finally {
        clearInterval(heartbeat);
      }
    } finally {
      this.busy = false;
    }
  }
  private async renderVisual(payload: ExportPayload, jobId: string) {
    const rendered = await exportHtml(payload, this.db, this.storage);
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({
      viewport: { width: Math.min(4096, rendered.width), height: Math.min(4096, rendered.height) },
      deviceScaleFactor: payload.scale,
      javaScriptEnabled: false,
    });
    try {
      await context.route(/^https?:\/\//, (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(rendered.html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const measured = await page.evaluate(() => {
        const board = document.querySelector<HTMLElement>('.board')!,
          rect = board.getBoundingClientRect();
        let width = rect.width,
          height = rect.height;
        for (const card of board.querySelectorAll('article.card')) {
          const cardRect = card.getBoundingClientRect();
          width = Math.max(width, cardRect.right + 32);
          height = Math.max(height, cardRect.bottom + 32);
        }
        board.style.width = Math.ceil(width) + 'px';
        board.style.height = Math.ceil(height) + 'px';
        return { width: Math.ceil(width), height: Math.ceil(height) };
      });
      await this.db.query('UPDATE jobs SET progress=65,updated_at=now() WHERE id=$1', [jobId]);
      if (payload.format === 'pdf') {
        const paginated =
          payload.pdfLayout === 'a4' || measured.width > 16384 || measured.height > 16384;
        return {
          data: paginated
            ? await paginatedPdf(page, measured.width, measured.height, payload.title)
            : await page.pdf({
                width: measured.width + 'px',
                height: measured.height + 'px',
                printBackground: true,
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
                tagged: true,
              }),
          mime: 'application/pdf',
          extension: 'pdf',
        };
      }
      if (
        payload.format === 'png-zip' ||
        measured.width * payload.scale > 16384 ||
        measured.height * payload.scale > 16384 ||
        measured.width * measured.height * payload.scale ** 2 > 100_000_000
      ) {
        const data = await tiledPng(
          page,
          measured.width,
          measured.height,
          payload.scale,
          payload.background === 'transparent',
          async (done, total) => {
            const status = (
              await this.db.query<{ status: string }>('SELECT status FROM jobs WHERE id=$1', [
                jobId,
              ])
            ).rows[0]?.status;
            if (status === 'canceled')
              throw new ApiError(409, 'EXPORT_CANCELED', 'Exportação cancelada.');
            await this.db.query('UPDATE jobs SET progress=$2,updated_at=now() WHERE id=$1', [
              jobId,
              65 + Math.floor((30 * done) / total),
            ]);
          },
        );
        return { data, mime: 'application/zip', extension: 'blocos.zip' };
      }
      return {
        data: await page.screenshot({
          type: 'png',
          fullPage: true,
          omitBackground: payload.background === 'transparent',
        }),
        mime: 'image/png',
        extension: 'png',
      };
    } finally {
      await context.close();
    }
  }
  async close() {
    clearInterval(this.timer);
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 50));
    await this.browser?.close();
  }
}
export function registerExports(
  app: FastifyInstance,
  db: Database,
  documents: Documents,
  storage: Storage,
  enabled = true,
) {
  const worker = new ExportWorker(db, documents, storage);
  if (enabled) app.addHook('onReady', () => worker.start());
  app.post('/api/v1/boards/:id/exports', async (request, reply) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params),
      access = await requireExport(db, id, user.id);
    requireRole(access.role, 'viewer');
    const input = z
      .object({
        format: z.enum(['png', 'png-zip', 'pdf', 'markdown', 'zip']),
        pdfLayout: z.enum(['whole', 'a4']).default('whole'),
        includeDescendants: z.boolean().default(false),
        scale: z.union([z.literal(1), z.literal(2)]).default(1),
        selection: z.array(uuid).max(10000).optional(),
        background: z.enum(['#F5F4F0', '#FFFFFF', '#191B1F', 'transparent']).default('#F5F4F0'),
      })
      .parse(request.body);
    let state = await userReadModel(db, await documents.snapshot(id), user.id);
    if (input.selection) {
      const ids = new Set(input.selection);
      state = {
        ...state,
        cards: state.cards.filter(
          (c) => ids.has(c.id) || (c.layout.kind === 'column' && ids.has(c.layout.columnId)),
        ),
        connectors: state.connectors.filter(
          (c) =>
            ids.has(c.id) ||
            ('cardId' in c.source &&
              'cardId' in c.target &&
              ids.has(c.source.cardId) &&
              ids.has(c.target.cardId)),
        ),
      };
    }
    const related: NonNullable<ExportPayload['related']> = [];
    if (input.includeDescendants) {
      if (input.selection || ['png', 'png-zip'].includes(input.format))
        throw new ApiError(
          400,
          'EXPORT_SCOPE',
          'Use PDF ou ZIP do quadro inteiro para incluir descendentes.',
        );
      const tree = await db.query<{ id: string }>(
        `WITH RECURSIVE tree AS (SELECT id,parent_id,0 AS depth FROM boards WHERE id=$1 AND deleted_at IS NULL UNION ALL SELECT b.id,b.parent_id,tree.depth+1 FROM boards b JOIN tree ON b.parent_id=tree.id WHERE b.deleted_at IS NULL AND tree.depth<49) SELECT id FROM tree WHERE id<>$1 ORDER BY depth`,
        [id],
      );
      if (tree.rows.length > 99)
        throw new ApiError(413, 'EXPORT_LIMIT', 'Exporte até 100 quadros por operação.');
      for (const child of tree.rows) {
        try {
          const access = await requireExport(db, child.id, user.id);
          related.push({
            boardId: child.id,
            title: access.board.title,
            state: await userReadModel(db, await documents.snapshot(child.id), user.id),
          });
        } catch (error) {
          if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
        }
      }
    }
    if (Buffer.byteLength(JSON.stringify([state, related])) > 50 * 1024 * 1024)
      throw new ApiError(
        413,
        'EXPORT_LIMIT',
        'O conteúdo excede 50MB de dados estruturados. Exporte uma seleção menor.',
      );
    const jobId = crypto.randomUUID();
    await db.query(
      'INSERT INTO jobs(id,user_id,board_id,type,status,payload) VALUES($1,$2,$3,$4,$5,$6)',
      [
        jobId,
        user.id,
        id,
        'export',
        'queued',
        JSON.stringify({
          state,
          related,
          boardId: id,
          title: access.board.title,
          format: input.includeDescendants && input.format === 'markdown' ? 'zip' : input.format,
          pdfLayout: input.pdfLayout,
          scale: input.scale,
          background: input.background,
        }),
      ],
    );
    if (enabled) void worker.tick();
    return reply.code(202).send({ id: jobId });
  });
  app.get('/api/v1/jobs/:id', async (request) => {
    const user = await currentUser(db, request),
      { id } = z.object({ id: uuid }).parse(request.params);
    const result = await db.query(
      'SELECT id,status,progress,filename,error FROM jobs WHERE id=$1 AND user_id=$2',
      [id, user.id],
    );
    if (!result.rows[0]) throw new ApiError(404, 'JOB_NOT_FOUND', 'Exportação não encontrada.');
    return result.rows[0];
  });
  app.delete('/api/v1/jobs/:id', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params);
    await db.query(
      "UPDATE jobs SET status='canceled' WHERE id=$1 AND user_id=$2 AND status IN ('queued','processing')",
      [id, user.id],
    );
    return { ok: true };
  });
  app.get('/api/v1/jobs/:id/download', async (request, reply) => {
    const user = await currentUser(db, request),
      { id } = z.object({ id: uuid }).parse(request.params);
    const result = await db.query<{
        board_id: string;
        output_key: string;
        filename: string;
        mime: string;
        payload: ExportPayload;
      }>("SELECT * FROM jobs WHERE id=$1 AND user_id=$2 AND status='ready'", [id, user.id]),
      job = result.rows[0];
    if (!job) throw new ApiError(404, 'JOB_NOT_READY', 'Exportação não disponível.');
    await requireExport(db, job.board_id, user.id);
    for (const related of job.payload.related ?? [])
      await requireExport(db, related.boardId, user.id);
    const file = await storage.stream(job.output_key);
    return reply
      .header('Cache-Control', 'private, no-store')
      .header(
        'Content-Disposition',
        "attachment; filename*=UTF-8''" + encodeURIComponent(job.filename),
      )
      .type(job.mime)
      .send(file.stream);
  });
  return worker;
}
