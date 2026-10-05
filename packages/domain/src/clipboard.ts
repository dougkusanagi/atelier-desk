import { z } from 'zod';
import { cloneState } from './clone';
import { effectiveCards, bounds } from './geometry';
import type { BoardState, Card, Connector, Point } from './types';
import type { RichNode } from './rich';
const finite = z.number().finite().min(-1_000_000).max(1_000_000);
const color = z.string().regex(/^#[a-f0-9]{6}$/i);
const url = z
  .string()
  .max(4096)
  .refine((value) => !value || /^(https?:\/\/|\/api\/)/i.test(value));
const rich = z.custom<RichNode[]>((value) => {
  if (!Array.isArray(value)) return false;
  const pending = value.map((node) => ({ node, depth: 0 }));
  let count = 0;
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
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (!node || typeof node !== 'object' || ++count > 10000 || depth > 32) return false;
    if (node.kind === 'element') {
      if (
        !names.has(node.name) ||
        !node.attributes ||
        typeof node.attributes !== 'object' ||
        !Array.isArray(node.children) ||
        Object.values(node.attributes).some(
          (value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value),
        )
      )
        return false;
      pending.push(...node.children.map((node: unknown) => ({ node, depth: depth + 1 })));
    } else if (node.kind === 'text') {
      if (
        !Array.isArray(node.delta) ||
        node.delta.some((part: { insert?: unknown; attributes?: Record<string, unknown> }) => {
          const link = part.attributes?.link as { href?: unknown } | undefined;
          return (
            typeof part.insert !== 'string' ||
            (link?.href &&
              (typeof link.href !== 'string' || !/^(https?:\/\/|mailto:|tel:)/i.test(link.href)))
          );
        })
      )
        return false;
    } else return false;
  }
  return true;
});
const content = z.object({
  rich: rich.optional(),
  text: z.string().max(1_000_000).optional(),
  title: z.string().max(2000).optional(),
  caption: z.string().max(10000).optional(),
  alt: z.string().max(10000).optional(),
  description: z.string().max(10000).optional(),
  url: url.optional(),
  thumbnail: url.optional(),
  favicon: url.optional(),
  assetId: z.string().uuid().optional(),
  filename: z.string().max(1000).optional(),
  mime: z.string().max(160).optional(),
  bytes: z
    .number()
    .finite()
    .min(0)
    .max(500 * 1024 * 1024)
    .optional(),
  imageWidth: z.number().int().min(1).max(100000).optional(),
  imageHeight: z.number().int().min(1).max(100000).optional(),
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
    .refine((crop) => crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001)
    .optional(),
  tasks: z
    .array(
      z.object({
        id: z.string().max(80),
        text: z.string().max(10000),
        done: z.boolean(),
        order: z.number().finite(),
        dueDate: z.string().date().optional(),
        assignee: z.string().uuid().optional(),
      }),
    )
    .max(2000)
    .optional(),
  strokes: z
    .array(
      z.object({
        id: z.string().uuid(),
        color,
        width: z.number().finite().min(0.1).max(48),
        points: z
          .array(z.object({ x: finite, y: finite, pressure: z.number().min(0).max(1).optional() }))
          .min(1)
          .max(20000),
      }),
    )
    .max(2000)
    .optional(),
});
const card = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'note',
    'tasks',
    'image',
    'link',
    'file',
    'media',
    'color',
    'column',
    'board',
    'drawing',
  ]),
  x: finite,
  y: finite,
  width: z.number().finite().min(80).max(10000),
  height: z.number().finite().min(40).max(10000),
  z: z.number().finite(),
  color,
  content,
  layout: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('free') }),
    z.object({
      kind: z.literal('column'),
      columnId: z.string().uuid(),
      order: z.number().finite(),
    }),
  ]),
});
const point = z.object({ x: finite, y: finite });
const endpoint = z.union([
  point,
  z.object({ cardId: z.string().uuid(), side: z.enum(['top', 'right', 'bottom', 'left']) }),
]);
const connector = z.object({
  id: z.string().uuid(),
  source: endpoint,
  target: endpoint,
  label: z.string().max(500),
  color,
  width: z.number().finite().min(1).max(8),
  curved: z.boolean(),
  controls: z.tuple([point, point]).optional(),
  dashed: z.boolean(),
  arrows: z.enum(['none', 'end', 'both']),
});
export type Selection = { cards: Card[]; connectors: Connector[] };
export function readSelection(text: string): Selection | null {
  if (text.length > 5_000_000) throw new Error('A seleção excede 5 MB. Copie menos cartões.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !('atelier' in value)) return null;
  const parsed = z
    .object({
      atelier: z.literal(1),
      cards: z.array(card).max(1000),
      connectors: z.array(connector).max(2000),
    })
    .safeParse(value);
  if (!parsed.success) throw new Error('A seleção copiada contém dados inválidos.');
  const ids = new Set(parsed.data.cards.map((card) => card.id));
  if (
    ids.size !== parsed.data.cards.length ||
    parsed.data.cards.some((card) => {
      if (card.layout.kind !== 'column') return false;
      const columnId = card.layout.columnId;
      return (
        card.type === 'column' ||
        !parsed.data.cards.some((parent) => parent.id === columnId && parent.type === 'column')
      );
    }) ||
    parsed.data.connectors.some((line) =>
      [line.source, line.target].some(
        (endpoint) => 'cardId' in endpoint && !ids.has(endpoint.cardId),
      ),
    )
  )
    throw new Error('A seleção contém referências inválidas.');
  return { cards: parsed.data.cards as Card[], connectors: parsed.data.connectors as Connector[] };
}
export function copySelection(state: BoardState, selected: string[]): Selection {
  const ids = new Set(selected);
  for (const card of state.cards)
    if (!card.deletedAt && card.layout.kind === 'column' && ids.has(card.layout.columnId))
      ids.add(card.id);
  const positions = effectiveCards(
    state.cards.map((card) =>
      card.type === 'column' ? { ...card, content: { ...card.content, collapsed: false } } : card,
    ),
  );
  return {
    cards: positions
      .filter((card) => ids.has(card.id))
      .map((card) => ({
        ...structuredClone(card),
        layout:
          card.layout.kind === 'column' && ids.has(card.layout.columnId)
            ? card.layout
            : { kind: 'free' },
        ...(card.type === 'column'
          ? {
              content: {
                ...card.content,
                collapsed: state.cards.find((original) => original.id === card.id)?.content
                  .collapsed,
              },
            }
          : {}),
      })),
    connectors: state.connectors
      .filter(
        (line) =>
          !line.deletedAt &&
          (ids.has(line.id) ||
            ('cardId' in line.source &&
              ids.has(line.source.cardId) &&
              'cardId' in line.target &&
              ids.has(line.target.cardId))) &&
          [line.source, line.target].every((end) => !('cardId' in end) || ids.has(end.cardId)),
      )
      .map((line) => structuredClone(line)),
  };
}
export function pasteSelection(selection: Selection, at: Point): Selection {
  const state = cloneState({ ...selection, revision: 0 }),
    box = bounds(state.cards);
  const dx = at.x - (box?.x ?? 0),
    dy = at.y - (box?.y ?? 0);
  return {
    cards: state.cards.map((card) => ({
      ...card,
      x: card.x + dx,
      y: card.y + dy,
      content: {
        ...card.content,
        ...(card.type === 'board' ? { owned: false } : {}),
        ...(card.content.tasks
          ? { tasks: card.content.tasks.map((task) => ({ ...task, assignee: undefined })) }
          : {}),
      },
    })),
    connectors: state.connectors.map((line) => ({
      ...line,
      source:
        'cardId' in line.source ? line.source : { x: line.source.x + dx, y: line.source.y + dy },
      target:
        'cardId' in line.target ? line.target : { x: line.target.x + dx, y: line.target.y + dy },
    })),
  };
}
