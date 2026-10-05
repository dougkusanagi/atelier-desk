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
  format: 'png' | 'pdf' | 'markdown' | 'zip';
  scale: number;
  background: string;
};
async function exportHtml(payload: ExportPayload, db: Database, storage: Storage) {
  const cards = effectiveCards(payload.state.cards),
    box = bounds(cards) ?? { x: 0, y: 0, width: 600, height: 400 };
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
    else if (card.type === 'image')
      content =
        (images.has(card.id)
          ? '<img src="' + images.get(card.id) + '" alt="' + escape(c.alt ?? '') + '">'
          : '<p>Imagem indisponível</p>') +
        (c.caption ? '<p class="caption">' + escape(c.caption) + '</p>' : '');
    else if (card.type === 'drawing') content = drawingSvg(card);
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
      (card.type === 'column' ? 0 : card.z) +
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
      const a = endpointPoint(line.source, cards),
        b = endpointPoint(line.target, cards);
      return (
        '<g><path d="' +
        connectorPath(line, cards) +
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
    cards.map(render).join('') +
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
      try {
        await requireExport(this.db, job.board_id, job.user_id);
        const payload = job.payload,
          stem = payload.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'quadro';
        let data: Buffer,
          filename = stem + '.' + payload.format,
          mime = 'application/octet-stream';
        if (payload.format === 'markdown' || payload.format === 'zip') {
          const zip = new JSZip(),
            markdown = boardMarkdown(payload.state, payload.title, (card) =>
              card.content.assetId
                ? 'assets/' + card.content.assetId + '/' + (card.content.filename ?? 'arquivo')
                : (card.content.url ?? ''),
            );
          if (payload.format === 'markdown') {
            data = Buffer.from(markdown);
            filename = stem + '.md';
            mime = 'text/markdown; charset=utf-8';
          } else {
            zip.file(stem + '.md', markdown);
            for (const card of payload.state.cards) {
              if (card.type === 'drawing')
                zip.file('drawings/' + card.id + '.svg', drawingSvg(card));
              if (card.content.assetId) {
                const result = await this.db.query<{ storage_key: string; filename: string }>(
                  'SELECT storage_key,filename FROM assets WHERE id=$1',
                  [card.content.assetId],
                );
                if (result.rows[0])
                  zip.file(
                    'assets/' + card.content.assetId + '/' + result.rows[0].filename,
                    await this.storage.buffer(result.rows[0].storage_key),
                  );
              }
            }
            data = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
            filename = stem + '.zip';
            mime = 'application/zip';
          }
        } else {
          const rendered = await exportHtml(payload, this.db, this.storage);
          if (!this.browser) this.browser = await chromium.launch({ headless: true });
          const context = await this.browser.newContext({
            viewport: {
              width: Math.min(16384, rendered.width),
              height: Math.min(16384, rendered.height),
            },
            deviceScaleFactor: payload.scale,
            javaScriptEnabled: false,
          });
          try {
            await context.route(/^https?:\/\//, (route) => route.abort());
            const page = await context.newPage();
            await page.setContent(rendered.html, { waitUntil: 'load' });
            await page.evaluate(() => document.fonts.ready);
            await this.db.query('UPDATE jobs SET progress=65,updated_at=now() WHERE id=$1', [
              job.id,
            ]);
            if (payload.format === 'png') {
              if (
                rendered.width * payload.scale > 16384 ||
                rendered.height * payload.scale > 16384 ||
                rendered.width * rendered.height * payload.scale ** 2 > 100_000_000
              )
                throw new ApiError(
                  413,
                  'EXPORT_TOO_LARGE',
                  'Esta imagem excede 16.384px ou 100MP. Exporte uma seleção ou use PDF.',
                );
              data = await page.screenshot({
                type: 'png',
                fullPage: true,
                omitBackground: payload.background === 'transparent',
              });
              mime = 'image/png';
            } else {
              data = await page.pdf({
                width: rendered.width + 'px',
                height: rendered.height + 'px',
                printBackground: true,
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
                tagged: true,
              });
              mime = 'application/pdf';
            }
          } finally {
            await context.close();
          }
        }
        await requireExport(this.db, job.board_id, job.user_id);
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
          "UPDATE jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1",
          [job.id, error instanceof Error ? error.message : 'Falha na exportação'],
        );
      }
    } finally {
      this.busy = false;
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
        format: z.enum(['png', 'pdf', 'markdown', 'zip']),
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
          title: access.board.title,
          format: input.format,
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
      }>("SELECT * FROM jobs WHERE id=$1 AND user_id=$2 AND status='ready'", [id, user.id]),
      job = result.rows[0];
    if (!job) throw new ApiError(404, 'JOB_NOT_READY', 'Exportação não disponível.');
    await requireExport(db, job.board_id, user.id);
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
