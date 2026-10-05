import type { Card } from './types';
export type Arrangement =
  'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'horizontal' | 'vertical';
export function arrangeCards(
  cards: Card[],
  ids: string[],
  mode: Arrangement,
): Map<string, Partial<Card>> {
  const chosen = cards.filter(
    (card) =>
      ids.includes(card.id) &&
      !card.deletedAt &&
      !(card.layout.kind === 'column' && ids.includes(card.layout.columnId)),
  );
  const result = new Map<string, Partial<Card>>();
  if (chosen.length < (['horizontal', 'vertical'].includes(mode) ? 3 : 2)) return result;
  const left = Math.min(...chosen.map((c) => c.x)),
    right = Math.max(...chosen.map((c) => c.x + c.width)),
    top = Math.min(...chosen.map((c) => c.y)),
    bottom = Math.max(...chosen.map((c) => c.y + c.height));
  if (mode === 'horizontal' || mode === 'vertical') {
    const horizontal = mode === 'horizontal',
      sorted = chosen
        .slice()
        .sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y) || a.id.localeCompare(b.id));
    const first = sorted[0],
      last = sorted.at(-1)!,
      start = horizontal ? first.x : first.y,
      end = horizontal ? last.x + last.width : last.y + last.height;
    const gap =
      (end - start - sorted.reduce((sum, c) => sum + (horizontal ? c.width : c.height), 0)) /
      (sorted.length - 1);
    let position = start;
    for (const card of sorted) {
      result.set(card.id, { [horizontal ? 'x' : 'y']: position, layout: { kind: 'free' } });
      position += (horizontal ? card.width : card.height) + gap;
    }
    return result;
  }
  for (const card of chosen)
    result.set(card.id, {
      ...(mode === 'left'
        ? { x: left }
        : mode === 'center'
          ? { x: (left + right - card.width) / 2 }
          : mode === 'right'
            ? { x: right - card.width }
            : mode === 'top'
              ? { y: top }
              : mode === 'middle'
                ? { y: (top + bottom - card.height) / 2 }
                : { y: bottom - card.height }),
      layout: { kind: 'free' },
    });
  return result;
}
