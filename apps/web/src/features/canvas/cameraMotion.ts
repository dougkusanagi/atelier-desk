import { useCallback, useEffect, useRef } from 'react';
import type { Camera, Point } from '@atelier/domain';
import { useCanvas } from './state';
export function useCameraMotion(reduced: boolean) {
  const frame = useRef(0);
  const stop = useCallback(() => cancelAnimationFrame(frame.current), []);
  useEffect(() => stop, [stop]);
  const smooth = useCallback(
    (target: Camera) => {
      stop();
      const start = useCanvas.getState().camera,
        begin = performance.now();
      if (reduced) {
        useCanvas.getState().setCamera(target);
        return;
      }
      const tick = (now: number) => {
        const t = Math.min(1, (now - begin) / 180),
          ease = 1 - (1 - t) ** 3;
        useCanvas
          .getState()
          .setCamera({
            x: start.x + (target.x - start.x) * ease,
            y: start.y + (target.y - start.y) * ease,
            zoom: start.zoom + (target.zoom - start.zoom) * ease,
          });
        if (t < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [reduced, stop],
  );
  const inertia = useCallback(
    (velocity: Point) => {
      stop();
      if (reduced || Math.hypot(velocity.x, velocity.y) < 0.01) return;
      const begin = performance.now();
      let previous = 0;
      const tick = (now: number) => {
        const elapsed = Math.min(700, now - begin),
          decay = Math.exp(-elapsed / 180);
        const distance = 180 * (Math.exp(-previous / 180) - decay);
        const current = useCanvas.getState().camera;
        useCanvas
          .getState()
          .setCamera({
            ...current,
            x: current.x + velocity.x * distance,
            y: current.y + velocity.y * distance,
          });
        previous = elapsed;
        if (elapsed < 700 && Math.hypot(velocity.x, velocity.y) * decay >= 0.01)
          frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [reduced, stop],
  );
  return { stop, smooth, inertia };
}
