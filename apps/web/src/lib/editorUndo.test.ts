import { expect, it } from 'vitest';
import { BoardDocument } from '@atelier/domain';
import { editorUndoFacade } from './editorUndo';
it('desmontar um editor libera seus eventos sem destruir o histórico do quadro', () => {
  const board = new BoardDocument(),
    card = board.add('note', { x: 0, y: 0 });
  const first = editorUndoFacade(board.undoManager),
    second = editorUndoFacade(board.undoManager);
  let firstEvents = 0,
    secondEvents = 0;
  first.on('stack-item-added', () => firstEvents++);
  second.on('stack-item-added', () => secondEvents++);
  first.destroy();
  board.patch(card, { x: 120 });
  expect(firstEvents).toBe(0);
  expect(secondEvents).toBe(1);
  board.undo();
  expect(board.snapshot().cards[0].x).toBe(0);
  second.destroy();
  board.patch(card, { y: 60 });
  board.undo();
  expect(board.snapshot().cards[0].y).toBe(0);
  board.destroy();
});
