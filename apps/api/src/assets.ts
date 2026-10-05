import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import sharp from 'sharp';
import { fileTypeFromFile } from 'file-type';
import type { Database } from './db';
import type { Config } from './config';
import { Storage } from './storage';
import { ApiError, currentUser, boardRole, requireRole, uuid, verifyCsrf } from './security';
import { resolveShare, shareContains } from './sharing';
type Asset = {
  id: string;
  workspace_id: string;
  uploader_id: string;
  storage_key: string;
  filename: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  status: string;
};
async function scan(data: Buffer, settings: Config) {
  if (data.subarray(0, 1024 * 1024).includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')))
    throw new ApiError(
      400,
      'MALWARE_DETECTED',
      'Este arquivo foi rejeitado pela verificação de segurança.',
    );
  if (!settings.clamavHost) {
    if (settings.production)
      throw new ApiError(
        503,
        'SCANNER_UNAVAILABLE',
        'O scanner de arquivos está indisponível. Tente novamente.',
      );
    return 'unscanned-development';
  }
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: settings.clamavHost!, port: settings.clamavPort }),
      parts: Buffer[] = [];
    socket.setTimeout(60000, () => {
      socket.destroy();
      reject(new ApiError(503, 'SCAN_TIMEOUT', 'A verificação excedeu o prazo.'));
    });
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      parts.push(buffer);
      if (buffer.includes(0)) {
        const message = Buffer.concat(parts).toString();
        socket.end();
        if (message.includes('FOUND'))
          reject(new ApiError(400, 'MALWARE_DETECTED', 'Arquivo bloqueado pelo scanner.'));
        else if (message.includes('OK')) resolve();
        else reject(new ApiError(503, 'SCAN_FAILED', 'Não foi possível verificar o arquivo.'));
      }
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < data.length; offset += 65536) {
        const chunk = data.subarray(offset, offset + 65536),
          length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
  return 'ready';
}
export function registerAssets(
  app: FastifyInstance,
  db: Database,
  storage: Storage,
  settings: Config,
) {
  async function access(assetId: string, request: FastifyRequest): Promise<Asset> {
    const result = await db.query<Asset>('SELECT * FROM assets WHERE id=$1', [assetId]),
      asset = result.rows[0];
    if (!asset || !['ready', 'unscanned-development'].includes(asset.status))
      throw new ApiError(404, 'ASSET_NOT_FOUND', 'Arquivo não disponível.');
    const refs = await db.query<{ board_id: string }>(
      'SELECT board_id FROM asset_references WHERE asset_id=$1',
      [assetId],
    );
    const query = request.query as { share?: string };
    if (query.share) {
      let grant;
      try {
        grant = await resolveShare(db, query.share, request);
      } catch {
        grant = await resolveShare(db, query.share, request, undefined, true);
      }
      for (const ref of refs.rows) if (await shareContains(db, grant, ref.board_id)) return asset;
    } else {
      const user = await currentUser(db, request);
      for (const ref of refs.rows) {
        try {
          await boardRole(db, ref.board_id, user.id);
          return asset;
        } catch {
          /* Tentar outra referência acessível. */
        }
      }
    }
    throw new ApiError(404, 'ASSET_NOT_FOUND', 'Arquivo não disponível.');
  }
  app.post('/api/v1/assets/uploads', async (request, reply) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const input = z.object({ boardId: uuid, assetId: uuid.optional() }).parse(request.query),
      permission = await boardRole(db, input.boardId, user.id);
    requireRole(permission.role, 'editor');
    const assetId = input.assetId ?? crypto.randomUUID();
    const existing = await db.query<Asset>('SELECT * FROM assets WHERE id=$1 AND uploader_id=$2', [
      assetId,
      user.id,
    ]);
    if (existing.rows[0]) return existing.rows[0];
    const file = await request.file();
    if (!file) throw new ApiError(400, 'FILE_REQUIRED', 'Escolha um arquivo.');
    const tmp = path.join(settings.dataDir, 'uploads');
    await mkdir(tmp, { recursive: true });
    const temporary = path.join(tmp, assetId);
    try {
      await pipeline(file.file, createWriteStream(temporary, { mode: 0o600 }));
      if (file.file.truncated) throw new ApiError(413, 'FILE_TOO_LARGE', 'O arquivo excede 500MB.');
      const info = await stat(temporary);
      if (info.size === 0) throw new ApiError(400, 'EMPTY_FILE', 'O arquivo está vazio.');
      const detected = await fileTypeFromFile(temporary);
      let mime = detected?.mime ?? 'application/octet-stream',
        data = await readFile(temporary);
      if (
        !detected &&
        !data.subarray(0, 65536).includes(0) &&
        /\.(txt|md|csv|json)$/i.test(file.filename)
      )
        mime = 'text/plain';
      const status = await scan(data, settings);
      let width: number | null = null,
        height: number | null = null,
        thumbnail: Buffer | undefined;
      if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
        if (info.size > 100 * 1024 * 1024)
          throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Imagens devem ter até 100MB.');
        try {
          const image = sharp(data, {
              limitInputPixels: 100_000_000,
              animated: mime === 'image/gif',
            }),
            metadata = await image.metadata();
          width = metadata.width ?? null;
          height = metadata.pageHeight ?? metadata.height ?? null;
          thumbnail = await sharp(data, { limitInputPixels: 100_000_000 })
            .rotate()
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp')
            data = await sharp(data, { limitInputPixels: 100_000_000 }).rotate().toBuffer();
        } catch (error) {
          if (error instanceof ApiError) throw error;
          throw new ApiError(
            415,
            'IMAGE_UNSUPPORTED',
            'Não foi possível processar esta imagem. Use JPEG, PNG ou WebP.',
          );
        }
      }
      const storageKey = 'assets/' + assetId + '/original',
        filename =
          path
            .basename(file.filename)
            .replace(/[\r\n]/g, '')
            .split(String.fromCharCode(0))
            .join('')
            .slice(0, 240) || 'arquivo';
      await storage.put(storageKey, data, mime);
      if (thumbnail) await storage.put(storageKey + '.thumb.jpg', thumbnail, 'image/jpeg');
      await db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO assets(id,workspace_id,uploader_id,storage_key,filename,mime,bytes,hash,width,height,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            assetId,
            permission.board.workspace_id,
            user.id,
            storageKey,
            filename,
            mime,
            data.length,
            createHash('sha256').update(data).digest('hex'),
            width,
            height,
            status,
          ],
        );
        await tx.query('INSERT INTO asset_references(asset_id,board_id,card_id) VALUES($1,$2,$3)', [
          assetId,
          input.boardId,
          '__upload',
        ]);
      });
      return reply
        .code(201)
        .send({ id: assetId, filename, mime, bytes: data.length, width, height, status });
    } finally {
      await rm(temporary, { force: true });
    }
  });
  app.get('/api/v1/assets/:id/content', async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params),
      asset = await access(id, request),
      query = request.query as { variant?: string; download?: string };
    const thumbnail = query.variant === 'thumbnail',
      key = asset.storage_key + (thumbnail ? '.thumb.jpg' : '');
    const mime = thumbnail ? 'image/jpeg' : asset.mime;
    let range: { start: number; end: number } | undefined;
    if (!thumbnail && request.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
      if (!match) throw new ApiError(416, 'RANGE_INVALID', 'Intervalo inválido.');
      const total = Number(asset.bytes),
        start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2])),
        end = match[1] ? (match[2] ? Math.min(total - 1, Number(match[2])) : total - 1) : total - 1;
      if (start > end || start >= total)
        throw new ApiError(416, 'RANGE_INVALID', 'Intervalo inválido.');
      range = { start, end };
      reply.code(206).header('Content-Range', 'bytes ' + start + '-' + end + '/' + total);
    }
    const object = await storage.stream(key, range);
    reply
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Length', object.size);
    const safeInline =
      /^(image\/(jpeg|png|webp|gif|avif)|audio\/|video\/|application\/pdf|text\/plain)/.test(mime);
    if (query.download === '1' || !safeInline)
      reply.header(
        'Content-Disposition',
        "attachment; filename*=UTF-8''" + encodeURIComponent(asset.filename),
      );
    return reply.type(safeInline ? mime : 'application/octet-stream').send(object.stream);
  });
}
