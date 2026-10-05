import * as Y from 'yjs';
import { z } from 'zod';
import type { BoardDocument, Card } from '@atelier/domain';
type Stack = Y.UndoManager['undoStack'][number];
const ranges = z.array(
  z.tuple([
    z.number().int().nonnegative(),
    z.array(z.object({ clock: z.number().int().nonnegative(), len: z.number().int().positive() })),
  ]),
);
const schema = z.object({ insertions: ranges, deletions: ranges });
export function serializeStack(stack: Stack | undefined) {
  return stack
    ? { insertions: [...stack.insertions.clients], deletions: [...stack.deletions.clients] }
    : null;
}
export function deserializeStack(value: unknown): Stack {
  const record = schema.parse(value),
    insertions = Y.createDeleteSet(),
    deletions = Y.createDeleteSet();
  insertions.clients = new Map(record.insertions);
  deletions.clients = new Map(record.deletions);
  return { insertions, deletions, meta: new Map() };
}
export type JournalChange = {
  id: string;
  collection?: 'cards' | 'connectors';
  fields: Record<string, { before: unknown; after: unknown }>;
};
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
export function historyManager(board: BoardDocument, changes: JournalChange[]) {
  const blocked = new Set<string>();
  for (const change of changes) {
    if (!change.fields.created || change.collection === 'connectors') continue;
    const current = board.snapshot().cards.find((c) => c.id === change.id);
    if (current && canonical(current) !== canonical(change.fields.created.after as Card))
      blocked.add(change.id);
  }
  const manager = new Y.UndoManager(board.doc, {
    trackedOrigins: new Set(),
    ignoreRemoteMapChanges: false,
    deleteFilter: (item) => {
      if (item.parent === board.cards && blocked.has(item.parentSub ?? '')) return false;
      let parent = item.parent;
      while (parent instanceof Y.AbstractType && parent._item) {
        if (parent._item.parent === board.cards && blocked.has(parent._item.parentSub ?? ''))
          return false;
        parent = parent._item.parent;
      }
      if (parent instanceof Y.AbstractType && parent.doc) {
        const name = Y.findRootTypeKey(parent);
        if (name.startsWith('rich:') && blocked.has(name.slice(5))) return false;
      }
      return true;
    },
  });
  return { manager, blocked: blocked.size };
}
