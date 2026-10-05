import * as Y from 'yjs';
import { richNodes, plainRich, writeRich, textNodes } from './rich';
import {
  createCard,
  id,
  type BoardState,
  type Card,
  type CardContent,
  type CardType,
  type Connector,
  type Point,
  type Task,
  type Stroke,
} from './types';
export const LOCAL_ORIGIN = Symbol('local-command');
export class BoardDocument {
  readonly doc: Y.Doc;
  readonly cards: Y.Map<Y.Map<unknown>>;
  readonly connectors: Y.Map<Y.Map<unknown>>;
  readonly undoManager: Y.UndoManager;
  historyFallback?: (redo: boolean) => void;
  private listeners = new Set<() => void>();
  private dirtyCards = new Set<string>();
  private cache = new Map<string, { signature: string; card: Card }>();
  private state: BoardState = { cards: [], connectors: [], revision: 0 };
  constructor(doc = new Y.Doc()) {
    this.doc = doc;
    this.cards = doc.getMap('cards');
    this.connectors = doc.getMap('connectors');
    this.undoManager = new Y.UndoManager([this.cards, this.connectors], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 500,
    });
    this.cards.observeDeep((events) => {
      for (const event of events) {
        const key = event.path[0];
        if (typeof key === 'string') this.dirtyCards.add(key);
        else if (event instanceof Y.YMapEvent)
          event.keysChanged.forEach((id) => this.dirtyCards.add(id));
      }
    });
    this.doc.on('afterTransaction', this.refresh);
    this.refresh();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private refresh = (transaction?: Y.Transaction) => {
    if (transaction && !transaction.changedParentTypes.size) return;
    const dirty = new Set(this.dirtyCards);
    this.dirtyCards.clear();
    if (transaction) {
      this.cards.forEach((_value, key) => {
        const fragment = this.doc.share.get('rich:' + key);
        if (fragment && transaction.changedParentTypes.has(fragment)) dirty.add(key);
      });
    }
    const cards: Card[] = [];
    this.cards.forEach((value, key) => {
      const existing = this.cache.get(key);
      if (transaction && existing && !dirty.has(key)) {
        cards.push(existing.card);
        return;
      }
      const json = value.toJSON() as Card;
      const content = json.content as CardContent & {
        taskItems?: Record<string, Task>;
        strokeItems?: Record<string, Stroke>;
      };
      if (content.taskItems)
        content.tasks = Object.values(content.taskItems).sort(
          (a, b) => a.order - b.order || a.id.localeCompare(b.id),
        );
      if (content.strokeItems) content.strokes = Object.values(content.strokeItems);
      delete content.taskItems;
      delete content.strokeItems;
      const fragment =
        json.type === 'note' && this.doc.share.has('rich:' + key)
          ? this.doc.getXmlFragment('rich:' + key)
          : null;
      if (fragment) {
        content.rich = richNodes(fragment);
        content.text = plainRich(content.rich);
        if (!this.undoManager.scope.includes(fragment)) this.undoManager.addToScope(fragment);
      }
      const signature = JSON.stringify(json),
        previous = this.cache.get(key);
      if (previous?.signature === signature) cards.push(previous.card);
      else {
        this.cache.set(key, { signature, card: json });
        cards.push(json);
      }
    });
    this.state = {
      cards,
      connectors: Array.from(this.connectors.values()).map((c) => c.toJSON() as Connector),
      revision: this.state.revision + 1,
    };
    this.listeners.forEach((fn) => fn());
  };
  transact(fn: () => void) {
    this.undoManager.stopCapturing();
    this.doc.transact(fn, LOCAL_ORIGIN);
    this.undoManager.stopCapturing();
  }
  private mapCard(card: Card) {
    const map = new Y.Map<unknown>(),
      content = new Y.Map<unknown>();
    Object.entries(card).forEach(([key, value]) => {
      if (key !== 'content' && value !== undefined) map.set(key, value);
    });
    Object.entries(card.content).forEach(([key, value]) => {
      if (
        !['tasks', 'strokes', 'taskItems', 'strokeItems', 'rich'].includes(key) &&
        value !== undefined
      )
        content.set(key, value);
    });
    const tasks = new Y.Map<Y.Map<unknown>>();
    card.content.tasks?.forEach((task) => {
      const item = new Y.Map<unknown>();
      Object.entries(task).forEach(([k, v]) => item.set(k, v));
      tasks.set(task.id, item);
    });
    content.set('taskItems', tasks);
    const strokes = new Y.Map<Stroke>();
    card.content.strokes?.forEach((stroke) => strokes.set(stroke.id, stroke));
    content.set('strokeItems', strokes);
    map.set('content', content);
    return map;
  }
  replaceSnapshot(state: BoardState) {
    this.doc.transact(() => {
      this.cards.clear();
      this.connectors.clear();
      this.insert(state.cards, state.connectors);
    }, 'remote');
    this.undoManager.clear();
  }
  add(type: CardType, point: Point) {
    const card = createCard(type, point);
    this.transact(() => {
      this.cards.set(card.id, this.mapCard(card));
      if (type === 'note') writeRich(this.doc.getXmlFragment('rich:' + card.id), textNodes(''));
    });
    return card.id;
  }
  insert(cards: Card[], connectors: Connector[] = []) {
    this.transact(() => {
      cards.forEach((c) => {
        this.cards.set(c.id, this.mapCard(c));
        if (c.type === 'note')
          writeRich(
            this.doc.getXmlFragment('rich:' + c.id),
            c.content.rich ?? textNodes(c.content.text ?? ''),
          );
      });
      connectors.forEach((c) => {
        const map = new Y.Map<unknown>();
        Object.entries(c).forEach(([k, v]) => v !== undefined && map.set(k, v));
        this.connectors.set(c.id, map);
      });
    });
  }
  patch(
    cardId: string,
    patch: Partial<Omit<Card, 'id' | 'content'>> & { content?: Partial<CardContent> },
  ) {
    this.transact(() => {
      const map = this.cards.get(cardId);
      if (!map) return;
      Object.entries(patch).forEach(([key, value]) => {
        if (key === 'content') {
          const content = map.get('content') as Y.Map<unknown>;
          Object.entries(value as CardContent).forEach(([k, v]) => {
            if (k === 'text' && typeof v === 'string' && map.get('type') === 'note')
              writeRich(this.doc.getXmlFragment('rich:' + cardId), textNodes(v));
            if (k === 'rich' && Array.isArray(v) && map.get('type') === 'note') {
              writeRich(this.doc.getXmlFragment('rich:' + cardId), (value as CardContent).rich!);
              return;
            }
            if (!['tasks', 'strokes'].includes(k))
              v === undefined ? content.delete(k) : content.set(k, v);
          });
        } else value === undefined ? map.delete(key) : map.set(key, value);
      });
    });
  }
  putTask(cardId: string, task: Task) {
    this.transact(() => {
      const content = this.cards.get(cardId)?.get('content') as Y.Map<unknown> | undefined;
      if (!content) return;
      const tasks = content.get('taskItems') as Y.Map<Y.Map<unknown>>;
      let map = tasks.get(task.id);
      if (!map) {
        map = new Y.Map<unknown>();
        tasks.set(task.id, map);
      }
      Object.entries(task).forEach(([k, v]) => v !== undefined && map.set(k, v));
    });
  }
  removeTask(cardId: string, taskId: string) {
    this.transact(() =>
      (
        (this.cards.get(cardId)?.get('content') as Y.Map<unknown>)?.get(
          'taskItems',
        ) as Y.Map<unknown>
      )?.delete(taskId),
    );
  }
  putStroke(cardId: string, stroke: Stroke) {
    this.transact(() =>
      (
        (this.cards.get(cardId)?.get('content') as Y.Map<unknown>)?.get(
          'strokeItems',
        ) as Y.Map<Stroke>
      )?.set(stroke.id, stroke),
    );
  }
  removeStroke(cardId: string, strokeId: string) {
    this.transact(() =>
      (
        (this.cards.get(cardId)?.get('content') as Y.Map<unknown>)?.get(
          'strokeItems',
        ) as Y.Map<Stroke>
      )?.delete(strokeId),
    );
  }
  remove(ids: string[]) {
    const deletedAt = new Date().toISOString();
    this.transact(() => {
      ids.forEach((key) => this.cards.get(key)?.set('deletedAt', deletedAt));
      this.connectors.forEach((c) => {
        const source = c.get('source') as { cardId?: string },
          target = c.get('target') as { cardId?: string };
        if (
          ids.includes(c.get('id') as string) ||
          ids.includes(source?.cardId ?? '') ||
          ids.includes(target?.cardId ?? '')
        )
          c.set('deletedAt', deletedAt);
      });
    });
  }
  restore(ids: string[]) {
    const batches = new Set(
      ids.map((key) => this.cards.get(key)?.get('deletedAt')).filter(Boolean),
    );
    this.transact(() => {
      ids.forEach((key) => {
        this.cards.get(key)?.delete('deletedAt');
        this.connectors.get(key)?.delete('deletedAt');
      });
      this.connectors.forEach((line) => {
        const source = line.get('source') as { cardId?: string },
          target = line.get('target') as { cardId?: string };
        if (
          batches.has(line.get('deletedAt')) &&
          (!source.cardId || !this.cards.get(source.cardId)?.get('deletedAt')) &&
          (!target.cardId || !this.cards.get(target.cardId)?.get('deletedAt'))
        )
          line.delete('deletedAt');
      });
    });
  }
  duplicate(ids: string[], offset = 24) {
    const selected = this.state.cards.filter((c) => ids.includes(c.id) && !c.deletedAt);
    const mapping = new Map(selected.map((c) => [c.id, id()]));
    const cards = selected.map((c) => ({
      ...structuredClone(c),
      id: mapping.get(c.id)!,
      x: c.x + offset,
      y: c.y + offset,
      layout:
        c.layout.kind === 'column' && mapping.has(c.layout.columnId)
          ? { ...c.layout, columnId: mapping.get(c.layout.columnId)! }
          : { kind: 'free' as const },
    }));
    const connectors = this.state.connectors
      .filter(
        (c) =>
          !c.deletedAt &&
          'cardId' in c.source &&
          'cardId' in c.target &&
          mapping.has(c.source.cardId) &&
          mapping.has(c.target.cardId),
      )
      .map((c) => ({
        ...structuredClone(c),
        id: id(),
        source: { ...c.source, cardId: mapping.get((c.source as { cardId: string }).cardId)! },
        target: { ...c.target, cardId: mapping.get((c.target as { cardId: string }).cardId)! },
      }));
    this.insert(cards, connectors);
    return cards.map((c) => c.id);
  }
  addConnector(connector: Omit<Connector, 'id'>) {
    const line = { ...connector, id: id() };
    this.insert([], [line]);
    return line.id;
  }
  patchConnector(connectorId: string, patch: Partial<Connector>) {
    this.transact(() =>
      Object.entries(patch).forEach(([k, v]) =>
        v === undefined
          ? this.connectors.get(connectorId)?.delete(k)
          : this.connectors.get(connectorId)?.set(k, v),
      ),
    );
  }
  undo() {
    if (!this.undoManager.undo()) this.historyFallback?.(false);
  }
  redo() {
    if (!this.undoManager.redo()) this.historyFallback?.(true);
  }
  destroy() {
    this.doc.off('afterTransaction', this.refresh);
    this.undoManager.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}
