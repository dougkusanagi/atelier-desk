import { create } from 'zustand';
import type { Camera, CardType, Point } from '@atelier/domain';
type CanvasState = {
  camera: Camera;
  selected: string[];
  tool: CardType | 'select' | 'connector';
  pointer: Point | null;
  toast: string | null;
  setCamera: (camera: Camera) => void;
  setSelected: (ids: string[]) => void;
  setTool: (tool: CanvasState['tool']) => void;
  setPointer: (point: Point) => void;
  notify: (message: string) => void;
};
export const useCanvas = create<CanvasState>((set) => ({
  camera: { x: 76, y: 52, zoom: 1 },
  selected: [],
  tool: 'select',
  pointer: null,
  toast: null,
  setCamera: (camera) => set({ camera }),
  setSelected: (selected) => set({ selected }),
  setTool: (tool) => set({ tool }),
  setPointer: (pointer) => set({ pointer }),
  notify: (toast) => set({ toast }),
}));
