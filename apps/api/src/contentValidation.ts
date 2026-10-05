import * as Y from 'yjs';
import { z } from 'zod';
import { ApiError } from './security';
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const task = z.object({
  id: z.string().min(1).max(80),
  text: z.string().max(10000),
  done: z.boolean(),
  order: z.number().finite(),
  assignee: z.string().uuid().optional(),
  dueDate: z.string().date().optional(),
});
const stroke = z.object({
  id: z.string().uuid(),
  color,
  width: z.number().finite().min(0.1).max(48),
  points: z
    .array(
      z.object({
        x: coordinate,
        y: coordinate,
        pressure: z.number().finite().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(20000),
});
const content = z
  .object({
    text: z.string().max(1_000_000).optional(),
    title: z.string().max(2000).optional(),
    caption: z.string().max(10000).optional(),
    alt: z.string().max(10000).optional(),
    description: z.string().max(10000).optional(),
    url: z.string().max(4096).optional(),
    thumbnail: z.string().max(4096).optional(),
    favicon: z.string().max(4096).optional(),
    assetId: z.string().uuid().optional(),
    filename: z.string().max(1000).optional(),
    mime: z.string().max(160).optional(),
    bytes: z
      .number()
      .finite()
      .nonnegative()
      .max(500 * 1024 * 1024)
      .optional(),
    imageWidth: z.number().int().positive().max(100000).optional(),
    imageHeight: z.number().int().positive().max(100000).optional(),
    hex: color.optional(),
    boardId: z.string().uuid().optional(),
    owned: z.boolean().optional(),
    collapsed: z.boolean().optional(),
    mediaKind: z.enum(['audio', 'video']).optional(),
    uploadState: z.enum(['pending', 'uploading', 'processing', 'ready', 'failed']).optional(),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().positive().max(1),
        height: z.number().positive().max(1),
      })
      .refine((c) => c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001)
      .optional(),
    taskItems: z.record(z.string(), task).optional(),
    strokeItems: z.record(z.string(), stroke).optional(),
  })
  .strict();
const names = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
  'hardBreak',
  'horizontalRule',
  'taskList',
  'taskItem',
]);
export function validateContent(doc: Y.Doc) {
  doc.getMap<Y.Map<unknown>>('cards').forEach((card) => {
    if (!(card instanceof Y.Map)) throw new ApiError(400, 'INVALID_CARD', 'Cartão inválido.');
    const value = card.get('content');
    if (!(value instanceof Y.Map)) throw new ApiError(400, 'INVALID_CONTENT', 'Conteúdo inválido.');
    const parsed = content.safeParse(value.toJSON());
    if (!parsed.success)
      throw new ApiError(
        400,
        'INVALID_CONTENT',
        'O cartão contém dados fora dos limites permitidos.',
      );
    for (const field of ['taskItems', 'strokeItems'] as const) {
      const entries = parsed.data[field];
      if (
        entries &&
        (Object.keys(entries).length > 2000 ||
          Object.entries(entries).some(([key, item]) => key !== item.id))
      )
        throw new ApiError(400, 'INVALID_CONTENT', 'IDs ou quantidade de itens inválidos.');
    }
  });
  let count = 0,
    textLength = 0;
  for (const [key, fragment] of doc.share)
    if (key.startsWith('rich:')) {
      if (!(fragment instanceof Y.XmlFragment))
        throw new ApiError(400, 'INVALID_RICH_TEXT', 'Documento de texto inválido.');
      const pending = fragment.toArray().map((node) => ({ node, depth: 0 }));
      while (pending.length) {
        const { node, depth } = pending.pop()!;
        if (++count > 100000 || depth > 32)
          throw new ApiError(413, 'RICH_TEXT_LIMIT', 'O texto excede os limites de estrutura.');
        if (node instanceof Y.XmlElement) {
          if (!names.has(node.nodeName))
            throw new ApiError(400, 'INVALID_RICH_TEXT', 'Bloco de texto não permitido.');
          pending.push(...node.toArray().map((node) => ({ node, depth: depth + 1 })));
        } else if (node instanceof Y.XmlText) {
          for (const item of node.toDelta()) {
            if (typeof item.insert !== 'string')
              throw new ApiError(400, 'INVALID_RICH_TEXT', 'Conteúdo de texto não permitido.');
            textLength += item.insert.length;
            const href = item.attributes?.link?.href;
            if (href && (typeof href !== 'string' || !/^(https?:\/\/|mailto:|tel:)/i.test(href)))
              throw new ApiError(400, 'UNSAFE_URL', 'O link no texto não é permitido.');
          }
        } else throw new ApiError(400, 'INVALID_RICH_TEXT', 'Nó de texto não permitido.');
        if (textLength > 10_000_000)
          throw new ApiError(413, 'RICH_TEXT_LIMIT', 'O quadro excede o limite de texto.');
      }
    }
}
