import { describe, expect, it } from 'vitest';
import { BoardDocument } from './document';
import { copySelection, pasteSelection, readSelection } from './clipboard';
import { boardBounds, effectiveCards } from './geometry';
import { colorInk } from './color';
describe('seleções entre quadros', () => {
  it('inclui filhos recolhidos, remapeia IDs e desloca pontas livres', () => {
    const board = new BoardDocument(),
      column = board.add('column', { x: 0, y: 0 }),
      child = board.add('tasks', { x: 500, y: 500 });
    board.patch(child, { layout: { kind: 'column', columnId: column, order: 0 } });
    board.patch(column, { content: { collapsed: true } });
    board.addConnector({
      source: { x: 100, y: 100 },
      target: { x: 200, y: 200 },
      label: '',
      curved: false,
      color: '#000000',
      width: 2,
      dashed: false,
      arrows: 'both',
    });
    const line = board.snapshot().connectors[0];
    const source = copySelection(board.snapshot(), [column, line.id]);
    const parsed = readSelection(JSON.stringify({ atelier: 1, ...source }));
    expect(parsed?.cards).toHaveLength(2);
    const pasted = pasteSelection(parsed!, { x: 400, y: 300 });
    expect(pasted.cards.every((card) => card.id !== column && card.id !== child)).toBe(true);
    expect(pasted.cards[1].layout).toMatchObject({ kind: 'column', columnId: pasted.cards[0].id });
    expect(pasted.connectors[0].source).toEqual({ x: 500, y: 400 });
    expect(pasted.cards[1].content.tasks?.[0].id).not.toBe(source.cards[1].content.tasks?.[0].id);
    board.destroy();
  });
  it('rejeita clipboard adulterado sem tratar texto comum como JSON do app', () => {
    expect(readSelection('Texto de outra aplicação')).toBeNull();
    expect(() =>
      readSelection(JSON.stringify({ atelier: 1, cards: [{ type: 'note' }], connectors: [] })),
    ).toThrow();
    const board = new BoardDocument(),
      card = board.add('link', { x: 0, y: 0 });
    board.patch(card, { content: { url: 'javascript:alert(1)' } });
    expect(() =>
      readSelection(JSON.stringify({ atelier: 1, ...copySelection(board.snapshot(), [card]) })),
    ).toThrow();
    board.destroy();
  });
});
it('inclui pontas livres e curvas fora dos cartões no limite de exportação', () => {
  const board = new BoardDocument();
  board.add('note', { x: 0, y: 0 });
  board.addConnector({
    source: { x: -200, y: 0 },
    target: { x: 1000, y: 500 },
    controls: [
      { x: 0, y: -600 },
      { x: 0, y: 1000 },
    ],
    label: 'Conexão',
    curved: true,
    color: '#000000',
    width: 2,
    dashed: false,
    arrows: 'both',
  });
  const box = boardBounds(effectiveCards(board.snapshot().cards), board.snapshot().connectors)!;
  expect(box.x).toBeLessThan(-200);
  expect(box.y).toBeLessThan(-600);
  expect(box.y + box.height).toBeGreaterThan(1500);
  expect(colorInk('#808080')).toBe('#000000');
  expect(colorInk('#000000')).toBe('#FFFFFF');
  board.destroy();
});
