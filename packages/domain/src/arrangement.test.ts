import { describe, expect, it } from 'vitest';
import { arrangeCards } from './arrangement';
import { createCard } from './types';
describe('organização da seleção', () => {
  it('distribui larguras diferentes sem mover os limites da seleção', () => {
    const a = createCard('note', { x: 0, y: 10 }),
      b = createCard('color', { x: 210, y: 40 }),
      c = createCard('note', { x: 600, y: 90 });
    a.width = 100;
    b.width = 200;
    c.width = 100;
    const patches = arrangeCards([a, b, c], [a.id, b.id, c.id], 'horizontal');
    expect(patches.get(a.id)?.x).toBe(0);
    expect(patches.get(b.id)?.x).toBe(250);
    expect(patches.get(c.id)?.x).toBe(600);
  });
  it('alinha ao rodapé e exclui um filho quando sua coluna participa', () => {
    const a = createCard('column', { x: 0, y: 0 }),
      b = createCard('note', { x: 320, y: 480 }),
      child = createCard('note', { x: 16, y: 64 });
    child.layout = { kind: 'column', columnId: a.id, order: 0 };
    const patches = arrangeCards([a, b, child], [a.id, b.id, child.id], 'bottom');
    expect(patches.get(a.id)?.y).toBe(340);
    expect(patches.has(child.id)).toBe(false);
  });
});
