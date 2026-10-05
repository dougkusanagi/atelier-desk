import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '@atelier/domain';
import { validateDocument } from './documents';

describe('limites do conteúdo colaborativo', () => {
  it('rejeita recortes fora da imagem e datas impossíveis', () => {
    const board = new BoardDocument();
    const image = board.add('image', { x: 0, y: 0 });
    board.patch(image, { content: { crop: { x: 0.8, y: 0, width: 0.5, height: 1 } } });
    expect(() => validateDocument(board.doc)).toThrow();
    board.patch(image, { content: { crop: { x: 0.5, y: 0, width: 0.5, height: 1 } } });
    expect(() => validateDocument(board.doc)).not.toThrow();
    const tasks = board.add('tasks', { x: 400, y: 0 });
    board.putTask(tasks, {
      id: 'date',
      text: 'Prazo',
      done: false,
      order: 1,
      dueDate: '2026-02-30',
    });
    expect(() => validateDocument(board.doc)).toThrow();
    board.destroy();
  });

  it('rejeita links executáveis no texto rico', () => {
    const board = new BoardDocument();
    const card = board.add('note', { x: 0, y: 0 });
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    board.doc.getXmlFragment('rich:' + card).insert(0, [paragraph]);
    text.insert(0, 'Abrir', { link: { href: 'javascript:alert(1)' } });
    expect(() => validateDocument(board.doc)).toThrow();
    text.format(0, 5, { link: { href: 'https://example.test' } });
    expect(() => validateDocument(board.doc)).not.toThrow();
    board.destroy();
  });
});
