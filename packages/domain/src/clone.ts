import { id, type BoardState } from './types';
export function cloneState(state: BoardState, boards = new Map<string, string>()): BoardState {
  const mapping = new Map(state.cards.filter((c) => !c.deletedAt).map((c) => [c.id, id()]));
  return {
    revision: 0,
    cards: state.cards
      .filter((c) => mapping.has(c.id))
      .map((c) => ({
        ...structuredClone(c),
        id: mapping.get(c.id)!,
        layout:
          c.layout.kind === 'column' && mapping.has(c.layout.columnId)
            ? { ...c.layout, columnId: mapping.get(c.layout.columnId)! }
            : { kind: 'free' },
        content: {
          ...structuredClone(c.content),
          ...(c.type === 'board' && c.content.boardId && boards.has(c.content.boardId)
            ? { boardId: boards.get(c.content.boardId), owned: true }
            : {}),
          ...(c.content.tasks ? { tasks: c.content.tasks.map((t) => ({ ...t, id: id() })) } : {}),
          ...(c.content.strokes
            ? { strokes: c.content.strokes.map((t) => ({ ...t, id: id() })) }
            : {}),
        },
      })),
    connectors: state.connectors
      .filter(
        (c) =>
          !c.deletedAt &&
          (!('cardId' in c.source) || mapping.has(c.source.cardId)) &&
          (!('cardId' in c.target) || mapping.has(c.target.cardId)),
      )
      .map((c) => ({
        ...structuredClone(c),
        id: id(),
        source:
          'cardId' in c.source ? { ...c.source, cardId: mapping.get(c.source.cardId)! } : c.source,
        target:
          'cardId' in c.target ? { ...c.target, cardId: mapping.get(c.target.cardId)! } : c.target,
      })),
  };
}
