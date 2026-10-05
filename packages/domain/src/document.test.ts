import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from './document';
describe('documento colaborativo', () => {
  it('agrupa um movimento e permite desfazer e refazer', () => {
    const board = new BoardDocument(),
      a = board.add('note', { x: 10, y: 20 }),
      b = board.add('note', { x: 100, y: 20 });
    board.transact(() => {
      board.patch(a, { x: 30 });
      board.patch(b, { x: 120 });
    });
    board.undo();
    expect(board.snapshot().cards.map((c) => c.x)).toEqual([10, 100]);
    board.redo();
    expect(board.snapshot().cards.map((c) => c.x)).toEqual([30, 120]);
  });
  it('converge ao receber adições concorrentes e não desfaz mudanças remotas', () => {
    const a = new BoardDocument(),
      b = new BoardDocument();
    a.add('note', { x: 0, y: 0 });
    b.add('color', { x: 300, y: 0 });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc), 'remote');
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc), 'remote');
    expect(
      a
        .snapshot()
        .cards.map((c) => c.id)
        .sort(),
    ).toEqual(
      b
        .snapshot()
        .cards.map((c) => c.id)
        .sort(),
    );
    a.undo();
    expect(a.snapshot().cards).toHaveLength(1);
    expect(a.snapshot().cards[0].type).toBe('color');
  });
  it('mantém tarefas concorrentes com IDs estáveis', () => {
    const a = new BoardDocument(),
      card = a.add('tasks', { x: 0, y: 0 }),
      b = new BoardDocument();
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    a.putTask(card, { id: 'a', text: 'Primeira', done: false, order: 1 });
    b.putTask(card, { id: 'b', text: 'Segunda', done: false, order: 2 });
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(b.doc), 'remote');
    expect(a.snapshot().cards[0].content.tasks).toHaveLength(3);
  });
  it('duplica IDs e remapeia conectores internos', () => {
    const b = new BoardDocument(),
      a = b.add('note', { x: 0, y: 0 }),
      c = b.add('note', { x: 400, y: 0 });
    b.addConnector({
      source: { cardId: a, side: 'right' },
      target: { cardId: c, side: 'left' },
      color: '#626872',
      width: 2,
      dashed: false,
      arrows: 'end',
      curved: true,
      label: 'Relação',
    });
    const copies = b.duplicate([a, c]);
    const line = b.snapshot().connectors[1];
    expect('cardId' in line.source && copies.includes(line.source.cardId)).toBe(true);
    expect(b.snapshot().cards).toHaveLength(4);
  });
});

describe('remoção de colunas', () => {
  it('desagrupa filhos de uma coluna recolhida e desfaz como uma operação', () => {
    const board = new BoardDocument();
    const column = board.add('column', { x: 100, y: 100 });
    const child = board.add('note', { x: -40, y: -40 });
    board.patch(child, { layout: { kind: 'column', columnId: column, order: 0 } });
    board.patch(column, { content: { collapsed: true } });
    board.remove([column]);
    expect(board.snapshot().cards.find((c) => c.id === child)?.layout.kind).toBe('free');
    expect(board.snapshot().cards.find((c) => c.id === child)?.x).toBe(116);
    board.undo();
    expect(board.snapshot().cards.find((c) => c.id === child)?.layout.kind).toBe('column');
    expect(board.snapshot().cards.find((c) => c.id === column)?.deletedAt).toBeUndefined();
    board.remove([column], true);
    expect(board.snapshot().cards.every((c) => c.deletedAt)).toBe(true);
    board.destroy();
  });
});
