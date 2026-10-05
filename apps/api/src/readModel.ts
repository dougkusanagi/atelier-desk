import type { BoardState } from '@atelier/domain';
import type { Database } from './db';
import { ApiError, boardRole } from './security';
/** Read-only clients receive current visible content, never the causal editing document. */
export async function userReadModel(
  db: Database,
  state: BoardState,
  userId: string,
): Promise<BoardState> {
  const cards = await Promise.all(
    state.cards
      .filter((card) => !card.deletedAt)
      .map(async (card) => {
        if (card.type !== 'board' || !card.content.boardId) return card;
        try {
          await boardRole(db, card.content.boardId, userId);
          return card;
        } catch (error) {
          if (!(error instanceof ApiError) || ![403, 404].includes(error.status)) throw error;
          return { ...card, content: { title: 'Quadro privado', owned: false } };
        }
      }),
  );
  const ids = new Set(cards.map((card) => card.id));
  return {
    ...state,
    cards,
    connectors: state.connectors.filter(
      (line) =>
        !line.deletedAt &&
        (!('cardId' in line.source) || ids.has(line.source.cardId)) &&
        (!('cardId' in line.target) || ids.has(line.target.cardId)),
    ),
  };
}
