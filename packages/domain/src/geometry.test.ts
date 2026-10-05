import { describe, expect, it } from 'vitest';
import {
  fitCamera,
  screenToWorld,
  worldToScreen,
  zoomAt,
  snapRect,
  effectiveCards,
  endpointPoint,
} from './geometry';
import { createCard } from './types';
describe('geometria do canvas', () => {
  it.each([0.1, 1, 4])('preserva ponto ancorado no zoom %s', (zoom) => {
    const camera = { x: 120, y: -70, zoom: 0.8 },
      anchor = { x: 543, y: 287 };
    const world = screenToWorld(anchor, camera);
    expect(worldToScreen(world, zoomAt(camera, anchor, zoom))).toEqual(anchor);
  });
  it('faz transformação inversa e limita o zoom', () => {
    const point = { x: -300, y: 400 },
      camera = { x: 37, y: -82, zoom: 1.7 };
    expect(screenToWorld(worldToScreen(point, camera), camera).x).toBeCloseTo(point.x);
    expect(zoomAt(camera, point, 100).zoom).toBe(4);
  });
  it('ajusta quadro vazio e enquadra limites com padding', () => {
    expect(fitCamera([], { width: 1200, height: 800 })).toEqual({ x: 80, y: 80, zoom: 1 });
    const camera = fitCamera([{ x: -200, y: 300, width: 1000, height: 600 }], {
      width: 1200,
      height: 800,
    });
    expect(worldToScreen({ x: -200, y: 300 }, camera).x).toBeCloseTo(48, 6);
  });
  it('snapping usa tolerância em pixels de tela', () => {
    const source = { x: 105, y: 80, width: 100, height: 80 },
      target = { x: 100, y: 300, width: 100, height: 100 };
    expect(snapRect(source, [target], 1).x).toBe(100);
    expect(snapRect(source, [target], 4).x).toBe(105);
    expect(snapRect(source, [target], 1, true).x).toBe(105);
  });
  it('deriva posição e altura dos filhos de uma coluna', () => {
    const column = createCard('column', { x: 100, y: 100 });
    const child = createCard('note', { x: 0, y: 0 });
    child.layout = { kind: 'column', columnId: column.id, order: 0 };
    const cards = effectiveCards([column, child]);
    expect(cards.find((c) => c.id === child.id)?.x).toBe(116);
    expect(cards.find((c) => c.id === child.id)?.y).toBe(164);
    column.content.collapsed = true;
    expect(effectiveCards([column, child])).toHaveLength(1);
  });
});

describe('âncoras recolhidas', () => {
  it('mantém a conexão na coluna sem alterar a referência ao filho', () => {
    const column = createCard('column', { x: 100, y: 100 });
    column.content.collapsed = true;
    const child = createCard('note', { x: 0, y: 0 });
    child.layout = { kind: 'column', columnId: column.id, order: 0 };
    const endpoint = { cardId: child.id, side: 'right' as const };
    expect(endpointPoint(endpoint, effectiveCards([column, child]), [column, child])).toEqual({
      x: 420,
      y: 128,
    });
    expect(endpoint.cardId).toBe(child.id);
  });
});
