import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { Database } from './db';
import { ApiError, boardRole, currentUser, requireRole, uuid, verifyCsrf } from './security';
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return !(
      p[0] === 0 ||
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] >= 224 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      (p[0] === 198 && [18, 19].includes(p[1])) ||
      (p[0] === 192 && p[1] === 0) ||
      (p[0] === 198 && p[1] === 51) ||
      (p[0] === 203 && p[1] === 0)
    );
  }
  if (isIP(ip) === 6) return !/^::|^fc|^fd|^fe[89ab]|^ff|^2001:db8/i.test(ip);
  return false;
}
export async function safeFetch(
  raw: string,
  redirects = 0,
): Promise<{ body: string; url: string }> {
  const url = new URL(raw);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    throw new ApiError(400, 'URL_DENIED', 'Este endereço não pode gerar uma prévia.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new ApiError(400, 'URL_DENIED', 'Endereços locais e privados não são permitidos.');
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        headers: { 'User-Agent': 'AtelierDeskPreview/1.0', Accept: 'text/html' },
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        timeout: 8000,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 4) {
            reject(new ApiError(400, 'REDIRECT_LIMIT', 'Redirecionamentos em excesso.'));
            return;
          }
          safeFetch(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
          return;
        }
        if (
          !res.statusCode ||
          res.statusCode >= 400 ||
          !res.headers['content-type']?.includes('text/html')
        ) {
          res.resume();
          reject(
            new ApiError(
              422,
              'PREVIEW_UNAVAILABLE',
              'Prévia indisponível. O link continua utilizável.',
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            req.destroy();
            reject(new ApiError(413, 'PREVIEW_TOO_LARGE', 'Página excede o limite de prévia.'));
          } else chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ body: Buffer.concat(chunks).toString('utf8'), url: url.href }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Tempo limite da prévia excedido.')));
    req.on('error', reject);
    req.end();
  });
}
export function registerPreviews(app: FastifyInstance, db: Database) {
  app.post('/api/v1/link-previews', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const input = z.object({ url: z.string().url().max(4096), boardId: uuid }).parse(request.body),
      access = await boardRole(db, input.boardId, user.id);
    requireRole(access.role, 'editor');
    const result = await safeFetch(input.url);
    const decode = (value: string) =>
      value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
    const meta = (name: string) => {
      for (const match of result.body.matchAll(/<meta\s+[^>]*>/gi)) {
        const attrs = Object.fromEntries(
          [...match[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
            m[1].toLowerCase(),
            m[2],
          ]),
        );
        if (attrs.property === name || attrs.name === name) return decode(attrs.content ?? '');
      }
      return '';
    };
    const title =
      meta('og:title') ||
      decode(
        /<title[^>]*>([\s\S]*?)<\/title>/i.exec(result.body)?.[1] ?? new URL(result.url).hostname,
      );
    const safeUrl = (value: string) => {
      try {
        const url = new URL(value, result.url);
        return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
      } catch {
        return undefined;
      }
    };
    return {
      title: title.slice(0, 300),
      description: (meta('og:description') || meta('description')).slice(0, 1000),
      thumbnail: safeUrl(meta('og:image')),
      favicon: new URL('/favicon.ico', result.url).href,
    };
  });
}
