import type { Camera, Card, Connector, Endpoint, Point, Rect } from './types';
export const MIN_ZOOM = 0.1,
  MAX_ZOOM = 4,
  WORLD_LIMIT = 1_000_000;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function worldToScreen(point: Point, camera: Camera): Point {
  return { x: camera.x + point.x * camera.zoom, y: camera.y + point.y * camera.zoom };
}
export function screenToWorld(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}
export function zoomAt(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM),
    world = screenToWorld(anchor, camera);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
export function bounds(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
/** Conservative hull includes curve controls, arrowheads and connector labels. */
export function boardBounds(
  cards: Card[],
  connectors: Connector[],
  originals: Card[] = cards,
): Rect | null {
  const rects: Rect[] = [...cards];
  for (const line of connectors.filter((line) => !line.deletedAt)) {
    const a = endpointPoint(line.source, cards, originals),
      b = endpointPoint(line.target, cards, originals);
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    const controls = line.controls ?? [
      { x: dx, y: 0 },
      { x: -dx, y: 0 },
    ];
    const points = [
      a,
      b,
      ...(line.curved
        ? [
            { x: a.x + controls[0].x, y: a.y + controls[0].y },
            { x: b.x + controls[1].x, y: b.y + controls[1].y },
          ]
        : []),
    ];
    const padding = Math.max(16, line.width * 7);
    for (const point of points)
      rects.push({
        x: point.x - padding,
        y: point.y - padding,
        width: padding * 2,
        height: padding * 2,
      });
    if (line.label)
      rects.push({
        x: (a.x + b.x) / 2 - line.label.length * 4,
        y: (a.y + b.y) / 2 - 26,
        width: line.label.length * 8,
        height: 32,
      });
  }
  return bounds(rects);
}
export function fitCamera(rects: Rect[], viewport: { width: number; height: number }): Camera {
  const box = bounds(rects);
  if (!box) return { x: 80, y: 80, zoom: 1 };
  const zoom = clamp(
    Math.min(
      (viewport.width - 96) / Math.max(box.width, 1),
      (viewport.height - 96) / Math.max(box.height, 1),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return {
    zoom,
    x: viewport.width / 2 - (box.x + box.width / 2) * zoom,
    y: viewport.height / 2 - (box.y + box.height / 2) * zoom,
  };
}
export function effectiveCards(cards: Card[]): Card[] {
  const columns = new Map(
    cards.filter((c) => c.type === 'column' && !c.deletedAt).map((c) => [c.id, c]),
  );
  const positions = new Map<string, Card>();
  for (const column of columns.values()) {
    let y = column.y + 64;
    for (const card of cards
      .filter((c) => !c.deletedAt && c.layout.kind === 'column' && c.layout.columnId === column.id)
      .sort(
        (a, b) =>
          (a.layout.kind === 'column' ? a.layout.order : 0) -
            (b.layout.kind === 'column' ? b.layout.order : 0) || a.id.localeCompare(b.id),
      )) {
      positions.set(card.id, { ...card, x: column.x + 16, y, width: column.width - 32 });
      y += card.height + 12;
    }
    positions.set(column.id, {
      ...column,
      height: column.content.collapsed ? 56 : Math.max(column.height, y - column.y + 4),
    });
  }
  return cards
    .filter(
      (c) =>
        !c.deletedAt &&
        !(c.layout.kind === 'column' && columns.get(c.layout.columnId)?.content.collapsed),
    )
    .map((c) => positions.get(c.id) ?? c);
}
export function endpointPoint(endpoint: Endpoint, cards: Card[], originals: Card[] = cards): Point {
  if (!('cardId' in endpoint)) return endpoint;
  let card = cards.find((c) => c.id === endpoint.cardId);
  if (!card) {
    const child = originals.find((c) => c.id === endpoint.cardId);
    if (child?.layout.kind === 'column') {
      const columnId = child.layout.columnId;
      card = cards.find((c) => c.id === columnId);
    }
  }
  if (!card) return { x: 0, y: 0 };
  if (endpoint.side === 'top') return { x: card.x + card.width / 2, y: card.y };
  if (endpoint.side === 'right') return { x: card.x + card.width, y: card.y + card.height / 2 };
  if (endpoint.side === 'bottom') return { x: card.x + card.width / 2, y: card.y + card.height };
  return { x: card.x, y: card.y + card.height / 2 };
}
export function connectorPath(line: Connector, cards: Card[], originals: Card[] = cards): string {
  const a = endpointPoint(line.source, cards, originals),
    b = endpointPoint(line.target, cards, originals);
  if (!line.curved) return 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  const c1 = line.controls?.[0] ?? { x: dx, y: 0 },
    c2 = line.controls?.[1] ?? { x: -dx, y: 0 };
  return (
    'M ' +
    a.x +
    ' ' +
    a.y +
    ' C ' +
    (a.x + c1.x) +
    ' ' +
    (a.y + c1.y) +
    ' ' +
    (b.x + c2.x) +
    ' ' +
    (b.y + c2.y) +
    ' ' +
    b.x +
    ' ' +
    b.y
  );
}
export function snapRect(moving: Rect, targets: Rect[], zoom: number, disabled = false) {
  if (disabled)
    return { x: moving.x, y: moving.y, guides: [] as { axis: 'x' | 'y'; value: number }[] };
  let x = moving.x,
    y = moving.y,
    bestX = 6 / zoom,
    bestY = 6 / zoom;
  const guides: { axis: 'x' | 'y'; value: number }[] = [];
  for (const target of targets) {
    for (const [offset, source] of [
      [0, moving.x],
      [moving.width / 2, moving.x + moving.width / 2],
      [moving.width, moving.x + moving.width],
    ]) {
      for (const value of [target.x, target.x + target.width / 2, target.x + target.width]) {
        const delta = Math.abs(value - source);
        if (delta < bestX) {
          bestX = delta;
          x = value - offset;
          guides[0] = { axis: 'x', value };
        }
      }
    }
    for (const [offset, source] of [
      [0, moving.y],
      [moving.height / 2, moving.y + moving.height / 2],
      [moving.height, moving.y + moving.height],
    ]) {
      for (const value of [target.y, target.y + target.height / 2, target.y + target.height]) {
        const delta = Math.abs(value - source);
        if (delta < bestY) {
          bestY = delta;
          y = value - offset;
          guides[1] = { axis: 'y', value };
        }
      }
    }
  }
  return { x, y, guides: guides.filter(Boolean) };
}
