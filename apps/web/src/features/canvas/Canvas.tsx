import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import RBush from 'rbush';
import {
  ArrowDownToLine,
  ChevronDown,
  Copy,
  Maximize,
  Minus,
  Plus,
  Trash2,
  ZoomIn,
  MousePointer2,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  type BoardDocument,
  type Card,
  type CardType,
  type Camera,
  type Point,
  type Rect,
  type Connector,
  effectiveCards,
  fitCamera,
  screenToWorld,
  zoomAt,
  snapRect,
  clamp,
  WORLD_LIMIT,
  connectorPath,
  endpointPoint,
  worldToScreen,
  id,
} from '@atelier/domain';
import { useCanvas } from './state';
import type { Presence } from '../../lib/sync';
import { ConnectorEditor } from '../../components/ConnectorEditor';
type SpatialItem = { minX: number; minY: number; maxX: number; maxY: number; id: string };
type Gesture = {
  kind: 'pending' | 'drag' | 'pan' | 'marquee' | 'resize';
  start: Point;
  last: Point;
  camera: Camera;
  originals: Map<string, Card>;
  cardId?: string;
  additive: string[];
  moved: boolean;
};
let clipboard: { cards: Card[]; connectors: Connector[] } | null = null;
export function Canvas({
  board,
  renderCard,
  readOnly = false,
  onFiles,
  onCreate,
  onPresence,
  collaborators = [],
}: {
  board: BoardDocument;
  renderCard: (card: Card) => ReactNode;
  readOnly?: boolean;
  onFiles?: (files: File[], point: Point) => void;
  onCreate?: (type: CardType, point: Point) => void;
  onPresence?: (point: Point, selection: string[]) => void;
  collaborators?: Presence[];
}) {
  const state = useSyncExternalStore(board.subscribe, board.snapshot);
  const camera = useCanvas((s) => s.camera),
    selected = useCanvas((s) => s.selected),
    tool = useCanvas((s) => s.tool);
  const { setCamera, setSelected, setPointer, setTool, notify } = useCanvas.getState();
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; camera: Camera; midpoint: Point } | null>(null);
  const space = useRef(false),
    frame = useRef(0),
    touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<Map<string, Partial<Card>>>(new Map());
  const [marquee, setMarquee] = useState<Rect | null>(null),
    [size, setSize] = useState({ width: 1200, height: 800 });
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; value: number }[]>([]);
  const [context, setContext] = useState<Point | null>(null),
    [connecting, setConnecting] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const lineDrag = useRef<{
    id: string;
    handle: 'source' | 'target' | 'first' | 'second';
    original: Connector;
    patch: Partial<Connector>;
  } | null>(null);
  const [linePreview, setLinePreview] = useState<{ id: string; patch: Partial<Connector> } | null>(
    null,
  );
  const cards = useMemo(
    () =>
      effectiveCards(
        state.cards.map((c) => (preview.has(c.id) ? { ...c, ...preview.get(c.id) } : c)),
      ),
    [state.cards, preview],
  );
  const layers = useMemo(
    () =>
      new Map(
        [...state.cards]
          .sort((a, b) => a.z - b.z || a.id.localeCompare(b.id))
          .map((c, i) => [c.id, i + 1]),
      ),
    [state.cards],
  );
  const index = useMemo(() => {
    const tree = new RBush<SpatialItem>();
    tree.load(
      cards.map((c) => ({
        minX: c.x,
        minY: c.y,
        maxX: c.x + c.width,
        maxY: c.y + c.height,
        id: c.id,
      })),
    );
    return tree;
  }, [cards]);
  const visible = useMemo(() => {
    const a = screenToWorld({ x: -400, y: -400 }, camera),
      b = screenToWorld({ x: size.width + 400, y: size.height + 400 }, camera);
    const ids = new Set(
      index.search({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }).map((c) => c.id),
    );
    const focused = document.activeElement?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
    return cards.filter((c) => ids.has(c.id) || selected.includes(c.id) || c.id === focused);
  }, [cards, camera, size, selected, index]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('[data-scrollable]')) return;
      event.preventDefault();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const current = useCanvas.getState().camera;
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect();
        setCamera(
          zoomAt(
            current,
            { x: event.clientX - box.left, y: event.clientY - box.top },
            current.zoom * Math.exp(-event.deltaY * factor * 0.006),
          ),
        );
      } else
        setCamera({
          ...current,
          x: current.x - event.deltaX * factor,
          y: current.y - event.deltaY * factor,
        });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frame.current);
    };
  }, [setCamera]);
  const point = (event: { clientX: number; clientY: number }) => {
    const box = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const cancel = useCallback(() => {
    gesture.current = null;
    lineDrag.current = null;
    setLinePreview(null);
    pinch.current = null;
    pointers.current.clear();
    setPreview(new Map());
    setMarquee(null);
    setGuides([]);
    if (touchTimer.current) clearTimeout(touchTimer.current);
  }, []);
  const remove = useCallback(() => {
    if (readOnly || !selected.length) return;
    board.transact(() => {
      for (const column of state.cards.filter(
        (c) => selected.includes(c.id) && c.type === 'column',
      )) {
        for (const child of cards.filter(
          (c) =>
            c.layout.kind === 'column' &&
            c.layout.columnId === column.id &&
            !selected.includes(c.id),
        )) {
          board.patch(child.id, {
            x: child.x,
            y: child.y,
            width: child.width,
            layout: { kind: 'free' },
          });
        }
      }
      board.remove(selected);
    });
    setSelected([]);
    notify('Itens movidos para a lixeira. Desfazer');
  }, [board, selected, state.cards, cards, readOnly, setSelected, notify]);
  const copy = useCallback(() => {
    clipboard = {
      cards: cards.filter((c) => selected.includes(c.id)),
      connectors: state.connectors.filter(
        (c) =>
          !c.deletedAt &&
          'cardId' in c.source &&
          'cardId' in c.target &&
          selected.includes(c.source.cardId) &&
          selected.includes(c.target.cardId),
      ),
    };
    void navigator.clipboard
      ?.writeText(JSON.stringify({ atelier: 1, ...clipboard }))
      .catch(() => notify('Copiado no Atelier. Use Colar no menu.'));
    notify('Seleção copiada');
  }, [cards, selected, state.connectors, notify]);
  const paste = useCallback(async () => {
    if (readOnly) return;
    let data = clipboard;
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as {
        atelier?: number;
        cards?: Card[];
        connectors?: Connector[];
      };
      if (parsed.atelier === 1 && Array.isArray(parsed.cards))
        data = { cards: parsed.cards, connectors: parsed.connectors ?? [] };
    } catch {
      /* Clipboard interno permanece disponível. */
    }
    if (!data?.cards.length) return;
    const map = new Map(data.cards.map((c) => [c.id, id()]));
    const copies = data.cards.map((c) => ({
      ...structuredClone(c),
      id: map.get(c.id)!,
      x: c.x + 24,
      y: c.y + 24,
      layout:
        c.layout.kind === 'column' && map.has(c.layout.columnId)
          ? { ...c.layout, columnId: map.get(c.layout.columnId)! }
          : { kind: 'free' as const },
    }));
    const lines = data.connectors.map((c) => ({
      ...structuredClone(c),
      id: id(),
      source: 'cardId' in c.source ? { ...c.source, cardId: map.get(c.source.cardId)! } : c.source,
      target: 'cardId' in c.target ? { ...c.target, cardId: map.get(c.target.cardId)! } : c.target,
    }));
    board.insert(copies, lines);
    setSelected(copies.map((c) => c.id));
  }, [board, readOnly, setSelected]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement;
      if (
        event.isComposing ||
        element.closest('input, textarea, [contenteditable="true"], [role="dialog"]')
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        space.current = true;
      }
      if (!viewport.current?.contains(element)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === 'Escape') {
        cancel();
        setSelected([]);
        setConnecting(null);
        setContext(null);
        setTool('select');
      } else if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(cards.map((c) => c.id));
      } else if (mod && event.key.toLowerCase() === 'z' && !readOnly) {
        event.preventDefault();
        event.shiftKey ? board.redo() : board.undo();
      } else if (mod && event.key.toLowerCase() === 'y' && !readOnly) {
        event.preventDefault();
        board.redo();
      } else if (mod && event.key.toLowerCase() === 'd' && !readOnly) {
        event.preventDefault();
        setSelected(board.duplicate(selected));
      } else if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copy();
      } else if (event.key.toLowerCase() === 'l' && !mod && !readOnly) {
        event.preventDefault();
        setTool('connector');
      } else if (event.key === 'Enter' && selected.length === 1) {
        event.preventDefault();
        viewport.current
          ?.querySelector<HTMLElement>(
            '[data-card-id="' +
              selected[0] +
              '"] input, [data-card-id="' +
              selected[0] +
              '"] [contenteditable=true]',
          )
          ?.focus();
      } else if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        void paste();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        remove();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (selected.length && !readOnly)
          board.transact(() =>
            cards
              .filter((c) => selected.includes(c.id))
              .forEach((c) =>
                board.patch(c.id, {
                  x: c.x + dx * (event.shiftKey ? 10 : 1),
                  y: c.y + dy * (event.shiftKey ? 10 : 1),
                  layout: { kind: 'free' },
                }),
              ),
          );
        else setCamera({ ...camera, x: camera.x - dx * 40, y: camera.y - dy * 40 });
      } else if (!mod && !readOnly && ['n', 't', 'c'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const type: CardType =
          event.key.toLowerCase() === 'n'
            ? 'note'
            : event.key.toLowerCase() === 't'
              ? 'tasks'
              : 'column';
        const at =
          useCanvas.getState().pointer ??
          screenToWorld({ x: size.width / 2, y: size.height / 2 }, camera);
        if (onCreate) onCreate(type, at);
        else setSelected([board.add(type, at)]);
      } else if (event.key === '+' || event.key === '=' || event.key === '-') {
        event.preventDefault();
        setCamera(
          zoomAt(
            camera,
            { x: size.width / 2, y: size.height / 2 },
            camera.zoom * (event.key === '-' ? 0.8 : 1.25),
          ),
        );
      } else if (event.key === '0')
        setCamera(zoomAt(camera, { x: size.width / 2, y: size.height / 2 }, 1));
      else if (event.shiftKey && event.key === '!') setCamera(fitCamera(cards, size));
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [
    board,
    cards,
    camera,
    selected,
    readOnly,
    size,
    cancel,
    copy,
    paste,
    remove,
    onCreate,
    setCamera,
    setSelected,
    setTool,
  ]);
  function start(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        '[data-no-drag], button, input, textarea, [contenteditable="true"], a, audio, video',
      )
    )
      return;
    if (event.button === 2) return;
    viewport.current?.focus({ preventScroll: true });
    setContext(null);
    const p = point(event);
    pointers.current.set(event.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        camera,
      };
      gesture.current = null;
      setPreview(new Map());
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const cardId = target.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
    if (tool === 'connector' && cardId && !readOnly) {
      if (!connecting) {
        setConnecting(cardId);
        notify('Escolha o cartão de destino');
      } else if (connecting !== cardId) {
        const lineId = board.addConnector({
          source: { cardId: connecting, side: 'right' },
          target: { cardId, side: 'left' },
          label: '',
          curved: true,
          color: '#747B86',
          width: 2,
          dashed: false,
          arrows: 'end',
        });
        setConnecting(null);
        setSelected([lineId]);
        setTool('select');
      }
      return;
    }
    if (cardId && event.shiftKey) {
      setSelected(
        selected.includes(cardId) ? selected.filter((c) => c !== cardId) : [...selected, cardId],
      );
      return;
    }
    const ids = cardId ? (selected.includes(cardId) ? selected : [cardId]) : [];
    if (cardId) setSelected(ids);
    const originals = new Map(
      cards
        .filter(
          (c) =>
            ids.includes(c.id) && !(c.layout.kind === 'column' && ids.includes(c.layout.columnId)),
        )
        .map((c) => [c.id, c]),
    );
    const isResize = Boolean(target.closest('[data-resize]'));
    const kind =
      event.button === 1 || space.current || (!cardId && event.pointerType === 'touch')
        ? 'pan'
        : isResize && !readOnly
          ? 'resize'
          : 'pending';
    gesture.current = {
      kind,
      start: p,
      last: p,
      camera,
      originals,
      cardId,
      additive: event.shiftKey ? selected : [],
      moved: false,
    };
    if (event.pointerType === 'touch' && cardId && !readOnly) {
      gesture.current.kind = 'pan';
      touchTimer.current = setTimeout(() => {
        if (gesture.current && !gesture.current.moved) {
          gesture.current.kind = 'pending';
          navigator.vibrate?.(10);
        }
      }, 350);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const p = point(event),
      current = useCanvas.getState().camera;
    setPointer(screenToWorld(p, current));
    onPresence?.(screenToWorld(p, current), selected);
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, p);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()],
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        initial = pinch.current;
      const next = zoomAt(
        initial.camera,
        initial.midpoint,
        (initial.camera.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / initial.distance,
      );
      setCamera({
        ...next,
        x: next.x + mid.x - initial.midpoint.x,
        y: next.y + mid.y - initial.midpoint.y,
      });
      return;
    }
    const connection = lineDrag.current;
    if (connection && !readOnly) {
      const world = screenToWorld(p, current),
        original = connection.original;
      if (connection.handle === 'source' || connection.handle === 'target') {
        const hit = [...cards]
          .sort((a, b) => b.z - a.z)
          .find(
            (card) =>
              world.x >= card.x &&
              world.x <= card.x + card.width &&
              world.y >= card.y &&
              world.y <= card.y + card.height,
          );
        const side = hit
          ? (
              [
                ['left', Math.abs(world.x - hit.x)],
                ['right', Math.abs(world.x - hit.x - hit.width)],
                ['top', Math.abs(world.y - hit.y)],
                ['bottom', Math.abs(world.y - hit.y - hit.height)],
              ] as const
            )
              .slice()
              .sort((a, b) => a[1] - b[1])[0][0]
          : 'left';
        connection.patch = {
          [connection.handle]: hit && !event.altKey ? { cardId: hit.id, side } : world,
        };
      } else {
        const a = endpointPoint(original.source, cards),
          b = endpointPoint(original.target, cards),
          dx = Math.max(40, Math.abs(b.x - a.x) / 2),
          controls = original.controls
            ? ([...original.controls] as [Point, Point])
            : ([
                { x: dx, y: 0 },
                { x: -dx, y: 0 },
              ] as [Point, Point]);
        const first = connection.handle === 'first',
          base = first ? a : b;
        controls[first ? 0 : 1] = { x: world.x - base.x, y: world.y - base.y };
        connection.patch = { controls };
      }
      setLinePreview({ id: connection.id, patch: connection.patch });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    g.last = p;
    const distance = Math.hypot(p.x - g.start.x, p.y - g.start.y);
    if (distance > 4) g.moved = true;
    if (distance > 8 && touchTimer.current) clearTimeout(touchTimer.current);
    if (g.kind === 'pending' && distance > 4) g.kind = g.cardId ? 'drag' : 'marquee';
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (gesture.current !== g) return;
      if (g.kind === 'pan')
        setCamera({
          ...g.camera,
          x: g.camera.x + p.x - g.start.x,
          y: g.camera.y + p.y - g.start.y,
        });
      else if (g.kind === 'marquee') {
        const a = screenToWorld(g.start, g.camera),
          b = screenToWorld(p, g.camera);
        const rect = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        };
        setMarquee(rect);
        const hit = index.search({
          minX: rect.x,
          minY: rect.y,
          maxX: rect.x + rect.width,
          maxY: rect.y + rect.height,
        });
        setSelected([...new Set([...g.additive, ...hit.map((c) => c.id)])]);
      } else if ((g.kind === 'drag' || g.kind === 'resize') && !readOnly) {
        const updates = gestureUpdates(g, p, current, event.altKey);
        setPreview(updates);
      }
    });
  }
  function gestureUpdates(g: Gesture, p: Point, current: Camera, alt: boolean) {
    const dx = (p.x - g.start.x) / g.camera.zoom,
      dy = (p.y - g.start.y) / g.camera.zoom;
    const updates = new Map<string, Partial<Card>>();
    let deltaX = dx,
      deltaY = dy;
    const first = g.originals.values().next().value as Card | undefined;
    if (first && g.kind === 'drag') {
      const snap = snapRect(
        { ...first, x: first.x + dx, y: first.y + dy },
        cards.filter((c) => !g.originals.has(c.id) && c.type !== 'column'),
        current.zoom,
        alt,
      );
      deltaX = snap.x - first.x;
      deltaY = snap.y - first.y;
      setGuides(snap.guides);
    }
    g.originals.forEach((c) =>
      updates.set(
        c.id,
        g.kind === 'resize'
          ? {
              width: clamp(c.width + dx, c.type === 'color' ? 120 : 180, 2400),
              height: clamp(
                c.type === 'image' && !alt
                  ? (c.height * clamp(c.width + dx, 180, 2400)) / c.width
                  : c.height + dy,
                80,
                2400,
              ),
            }
          : {
              x: clamp(c.x + deltaX, -WORLD_LIMIT, WORLD_LIMIT),
              y: clamp(c.y + deltaY, -WORLD_LIMIT, WORLD_LIMIT),
              layout: { kind: 'free' },
            },
      ),
    );

    return updates;
  }
  function end(event: ReactPointerEvent<HTMLDivElement>) {
    if (lineDrag.current) {
      if (!readOnly) board.patchConnector(lineDrag.current.id, lineDrag.current.patch);
      lineDrag.current = null;
      setLinePreview(null);
      return;
    }
    pointers.current.delete(event.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      gesture.current = null;
      return;
    }
    if (touchTimer.current) clearTimeout(touchTimer.current);
    const g = gesture.current;
    if (g && !readOnly && (g.kind === 'drag' || g.kind === 'resize')) {
      cancelAnimationFrame(frame.current);
      const updates = gestureUpdates(g, point(event), useCanvas.getState().camera, event.altKey);
      board.transact(() => {
        updates.forEach((patch, key) => {
          const original = g.originals.get(key)!;
          if (g.kind === 'drag' && original.type !== 'column') {
            const at = {
              x: (patch.x ?? original.x) + original.width / 2,
              y: (patch.y ?? original.y) + 20,
            };
            const column = cards.find(
              (c) =>
                c.type === 'column' &&
                !g.originals.has(c.id) &&
                at.x > c.x &&
                at.x < c.x + c.width &&
                at.y > c.y &&
                at.y < c.y + c.height,
            );
            if (column) {
              const children = cards
                .filter(
                  (c) =>
                    c.layout.kind === 'column' && c.layout.columnId === column.id && c.id !== key,
                )
                .sort((a, b) => a.y - b.y);
              const before = children.filter((c) => c.y < at.y).at(-1),
                after = children.find((c) => c.y >= at.y);
              const a =
                before?.layout.kind === 'column'
                  ? before.layout.order
                  : after?.layout.kind === 'column'
                    ? after.layout.order - 2
                    : 0;
              const b = after?.layout.kind === 'column' ? after.layout.order : a + 2;
              patch.layout = { kind: 'column', columnId: column.id, order: (a + b) / 2 };
            }
          }
          board.patch(key, patch);
        });
      });
    } else if (g && !g.cardId && !g.moved && !g.additive.length) setSelected([]);
    gesture.current = null;
    setPreview(new Map());
    setMarquee(null);
    setGuides([]);
  }
  function drop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (readOnly) return;
    const at = screenToWorld(point(event), camera),
      cardType = event.dataTransfer.getData('application/atelier-tool') as CardType;
    if (cardType) {
      if (onCreate) onCreate(cardType, at);
      else setSelected([board.add(cardType, at)]);
    } else if (event.dataTransfer.files.length) onFiles?.([...event.dataTransfer.files], at);
    else {
      const text =
        event.dataTransfer
          .getData('text/uri-list')
          .split('\n')
          .find((l) => l && !l.startsWith('#')) || event.dataTransfer.getData('text/plain');
      if (text) {
        const type = /^https?:\/\//.test(text.trim()) ? 'link' : 'note',
          key = board.add(type, at);
        board.patch(key, {
          content: type === 'link' ? { url: text.trim(), title: text.trim() } : { text },
        });
        setSelected([key]);
      }
    }
  }
  return (
    <div
      ref={viewport}
      className={'canvas ' + (tool === 'connector' ? 'connecting' : '')}
      tabIndex={0}
      aria-label="Canvas do quadro. Use Tab para navegar, Espaço e arraste para mover, mais e menos para zoom."
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
      onPaste={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]') || readOnly)
          return;
        const files = [...e.clipboardData.files];
        if (files.length) {
          e.preventDefault();
          onFiles?.(files, screenToWorld({ x: size.width / 2, y: size.height / 2 }, camera));
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const key = (e.target as HTMLElement).closest<HTMLElement>('[data-card-id]')?.dataset
          .cardId;
        if (key && !selected.includes(key)) setSelected([key]);
        setContext(point(e));
      }}
    >
      <div
        className="world"
        style={{
          transform: 'translate(' + camera.x + 'px,' + camera.y + 'px) scale(' + camera.zoom + ')',
        }}
      >
        <svg className="connector-layer" aria-label="Conexões entre cartões">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {state.connectors
            .filter((c) => !c.deletedAt)
            .map((stored) => {
              const line =
                linePreview?.id === stored.id ? { ...stored, ...linePreview.patch } : stored;
              const a = endpointPoint(line.source, cards),
                b = endpointPoint(line.target, cards);
              return (
                <g key={line.id} data-no-drag>
                  <path
                    d={connectorPath(line, cards)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12 / camera.zoom}
                    className="connector-hit"
                    tabIndex={0}
                    role="button"
                    aria-label={'Selecionar conexão ' + (line.label || 'sem rótulo')}
                    onKeyDown={(event) => {
                      if (['Enter', ' '].includes(event.key)) {
                        event.preventDefault();
                        setSelected([line.id]);
                      }
                    }}
                    onClick={() => setSelected([line.id])}
                  />
                  <path
                    d={connectorPath(line, cards)}
                    fill="none"
                    stroke={selected.includes(line.id) ? 'var(--accent)' : line.color}
                    strokeWidth={line.width}
                    strokeDasharray={line.dashed ? '8 6' : undefined}
                    markerEnd={line.arrows !== 'none' ? 'url(#arrow)' : undefined}
                    markerStart={line.arrows === 'both' ? 'url(#arrow)' : undefined}
                  />
                  {selected.includes(line.id) &&
                    !readOnly &&
                    (() => {
                      const dx = Math.max(40, Math.abs(b.x - a.x) / 2),
                        controls = line.controls ?? [
                          { x: dx, y: 0 },
                          { x: -dx, y: 0 },
                        ];
                      const handles = [
                        { key: 'source', ...a },
                        { key: 'target', ...b },
                        ...(line.curved
                          ? [
                              { key: 'first', x: a.x + controls[0].x, y: a.y + controls[0].y },
                              { key: 'second', x: b.x + controls[1].x, y: b.y + controls[1].y },
                            ]
                          : []),
                      ];
                      return (
                        <g>
                          {line.curved && (
                            <path
                              d={`M${a.x} ${a.y}L${a.x + controls[0].x} ${a.y + controls[0].y}M${b.x} ${b.y}L${b.x + controls[1].x} ${b.y + controls[1].y}`}
                              fill="none"
                              stroke="var(--accent)"
                              strokeWidth={1 / camera.zoom}
                              strokeDasharray="4 4"
                            />
                          )}
                          {handles.map((handle) => (
                            <g
                              key={handle.key}
                              className="connector-handle"
                              data-no-drag
                              aria-label={'Alça ' + handle.key}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                event.currentTarget.setPointerCapture(event.pointerId);
                                lineDrag.current = {
                                  id: line.id,
                                  handle: handle.key as 'source' | 'target' | 'first' | 'second',
                                  original: stored,
                                  patch: {},
                                };
                              }}
                            >
                              <circle
                                cx={handle.x}
                                cy={handle.y}
                                r={15 / camera.zoom}
                                fill="transparent"
                              />
                              <circle
                                cx={handle.x}
                                cy={handle.y}
                                r={5 / camera.zoom}
                                fill="var(--surface)"
                                stroke="var(--accent)"
                                strokeWidth={2 / camera.zoom}
                              />
                            </g>
                          ))}
                        </g>
                      );
                    })()}
                  {line.label && (
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 10}
                      textAnchor="middle"
                      className="connector-label"
                    >
                      {line.label}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        <AnimatePresence initial={false}>
          {visible.map((card) => (
            <motion.div
              key={card.id}
              data-card-id={card.id}
              role="group"
              aria-label={card.content.title || card.content.text?.slice(0, 60) || card.type}
              className={
                'card card-' +
                card.type +
                (selected.includes(card.id) ? ' selected' : '') +
                (preview.has(card.id) ? ' dragging' : '')
              }
              style={
                {
                  position: 'absolute',
                  left: card.x,
                  top: card.y,
                  width: card.width,
                  minHeight: card.height,
                  zIndex: preview.has(card.id)
                    ? 99999
                    : card.type === 'column'
                      ? 0
                      : layers.get(card.id),
                  background: card.type === 'color' ? card.content.hex : card.color,
                  '--selection-width': 2 / camera.zoom + 'px',
                  '--handle-scale': 1 / camera.zoom,
                } as React.CSSProperties
              }
              initial={reduced ? false : { opacity: 0, scale: 0.96, y: 6 }}
              animate={{
                opacity: 1,
                scale: preview.has(card.id) && !reduced ? 1.025 : 1,
                rotate: preview.has(card.id) && !reduced ? 0.6 : 0,
                y: 0,
              }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : preview.has(card.id)
                    ? { duration: 0.12, ease: [0.16, 1, 0.3, 1] }
                    : { type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }
              }
            >
              <MeasuredContent board={board} card={card} readOnly={readOnly}>
                {renderCard(card)}
              </MeasuredContent>
              {selected.includes(card.id) && !readOnly && card.type !== 'column' && (
                <div className="resize-handle" data-resize aria-label="Redimensionar cartão" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {marquee && (
          <div
            className="marquee"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
              borderWidth: 1 / camera.zoom,
            }}
          />
        )}
        {guides.map((g, i) => (
          <div
            key={i}
            className={'snap-guide ' + g.axis}
            style={
              g.axis === 'x'
                ? { left: g.value, width: 1 / camera.zoom }
                : { top: g.value, height: 1 / camera.zoom }
            }
          />
        ))}
      </div>
      {collaborators.map((peer, index) => {
        const point = worldToScreen(peer, camera),
          color = ['#A45040', '#497846', '#6557A8', '#287E9A'][index % 4];
        return (
          <div
            className="remote-cursor"
            key={peer.clientId}
            style={
              { left: point.x, top: point.y, color, '--cursor-color': color } as React.CSSProperties
            }
          >
            <MousePointer2 size={18} fill="currentColor" />
            <span>{peer.user.name}</span>
          </div>
        );
      })}
      {!readOnly &&
        selected.length === 1 &&
        state.connectors
          .filter((line) => line.id === selected[0] && !line.deletedAt)
          .map((line) => <ConnectorEditor key={line.id} board={board} line={line} />)}
      <div className="canvas-hint">
        {selected.length
          ? selected.length + ' selecionado' + (selected.length > 1 ? 's' : '')
          : tool === 'connector'
            ? 'Selecione a origem e o destino'
            : 'Espaço + arraste para navegar'}
      </div>
      <div className="zoom-controls" data-no-drag>
        <button
          title="Diminuir zoom"
          aria-label="Diminuir zoom"
          onClick={() =>
            setCamera(zoomAt(camera, { x: size.width / 2, y: size.height / 2 }, camera.zoom / 1.25))
          }
        >
          <Minus size={16} />
        </button>
        <button
          className="zoom-value"
          title="Restaurar zoom"
          onClick={() => setCamera(zoomAt(camera, { x: size.width / 2, y: size.height / 2 }, 1))}
        >
          {Math.round(camera.zoom * 100)}%<ChevronDown size={12} />
        </button>
        <button
          title="Aumentar zoom"
          aria-label="Aumentar zoom"
          onClick={() =>
            setCamera(zoomAt(camera, { x: size.width / 2, y: size.height / 2 }, camera.zoom * 1.25))
          }
        >
          <Plus size={16} />
        </button>
        <span className="control-divider" />
        <button
          title="Enquadrar todos"
          aria-label="Enquadrar todos"
          onClick={() => setCamera(fitCamera(cards, size))}
        >
          <Maximize size={16} />
        </button>
      </div>
      {selected.length > 0 && !readOnly && (
        <div className="selection-actions" data-no-drag>
          <button onClick={copy}>
            <Copy size={14} />
            Copiar
          </button>
          <button onClick={() => setSelected(board.duplicate(selected))}>
            <Plus size={14} />
            Duplicar
          </button>
          <button onClick={remove}>
            <Trash2 size={14} />
            Excluir
          </button>
        </div>
      )}
      {context && (
        <div
          className="context-menu"
          data-no-drag
          style={{
            left: Math.min(context.x, size.width - 210),
            top: Math.min(context.y, size.height - 230),
          }}
          role="menu"
        >
          <button
            role="menuitem"
            onClick={() => {
              copy();
              setContext(null);
            }}
          >
            <Copy size={15} />
            Copiar
          </button>
          {!readOnly && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  void paste();
                  setContext(null);
                }}
              >
                <ArrowDownToLine size={15} />
                Colar
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setSelected(board.duplicate(selected));
                  setContext(null);
                }}
              >
                <Plus size={15} />
                Duplicar
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  remove();
                  setContext(null);
                }}
              >
                <Trash2 size={15} />
                Mover para lixeira
              </button>
            </>
          )}
          <button
            role="menuitem"
            onClick={() => {
              setCamera(fitCamera(cards, size));
              setContext(null);
            }}
          >
            <ZoomIn size={15} />
            Enquadrar quadro
          </button>
        </div>
      )}
    </div>
  );
}

function MeasuredContent({
  board,
  card,
  readOnly,
  children,
}: {
  board: BoardDocument;
  card: Card;
  readOnly: boolean;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (readOnly || !['note', 'tasks', 'link', 'file'].includes(card.type) || !element.current)
      return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver((entries) => {
      clearTimeout(timer);
      const height = Math.ceil(entries[0].contentRect.height);
      timer = setTimeout(() => {
        const map = board.cards.get(card.id);
        if (map && height > Number(map.get('height')) + 2 && height < 10000)
          board.doc.transact(() => map.set('height', height), 'measurement');
      }, 200);
    });
    observer.observe(element.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [board, card.id, card.type, readOnly]);
  return (
    <div ref={element} className="card-body">
      {children}
    </div>
  );
}
