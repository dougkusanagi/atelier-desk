import { useRef, useState } from 'react';
import type { CardContent } from '@atelier/domain';
type Crop = NonNullable<CardContent['crop']>;
export function ImageCrop({
  url,
  initial,
  onApply,
}: {
  url: string;
  initial?: Crop;
  onApply: (crop: Crop, aspect: number) => void;
}) {
  const [crop, setCrop] = useState<Crop>(initial ?? { x: 0, y: 0, width: 1, height: 1 }),
    [aspect, setAspect] = useState(1);
  const source = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const update = (field: keyof Crop, value: number) =>
    setCrop((current) => {
      const next = { ...current, [field]: value };
      next.width = Math.max(0.05, Math.min(next.width, 1));
      next.height = Math.max(0.05, Math.min(next.height, 1));
      next.x = Math.max(0, Math.min(next.x, 1 - next.width));
      next.y = Math.max(0, Math.min(next.y, 1 - next.height));
      return next;
    });
  return (
    <div className="image-crop-editor">
      <p>Arraste o recorte ou ajuste os percentuais. O arquivo original é preservado.</p>
      <div ref={source} className="crop-source">
        <img
          src={url}
          alt="Imagem original para recorte"
          onLoad={(event) =>
            setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)
          }
          draggable={false}
        />
        <div
          className="crop-rectangle"
          style={{
            left: crop.x * 100 + '%',
            top: crop.y * 100 + '%',
            width: crop.width * 100 + '%',
            height: crop.height * 100 + '%',
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, crop };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const box = source.current!.getBoundingClientRect(),
              start = drag.current;
            setCrop({
              ...start.crop,
              x: Math.max(
                0,
                Math.min(
                  1 - start.crop.width,
                  start.crop.x + (event.clientX - start.x) / box.width,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  1 - start.crop.height,
                  start.crop.y + (event.clientY - start.y) / box.height,
                ),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        />
      </div>
      <div className="crop-controls">
        {(
          [
            ['x', 'Posição horizontal'],
            ['y', 'Posição vertical'],
            ['width', 'Largura do recorte'],
            ['height', 'Altura do recorte'],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label} · {Math.round(crop[field] * 100)}%
            <input
              type="range"
              min={field === 'width' || field === 'height' ? 5 : 0}
              max={100}
              step={1}
              value={Math.round(crop[field] * 100)}
              onChange={(event) => update(field, Number(event.target.value) / 100)}
            />
          </label>
        ))}
      </div>
      <div className="dialog-actions">
        <button
          className="secondary-button"
          onClick={() => setCrop({ x: 0, y: 0, width: 1, height: 1 })}
        >
          Restaurar imagem inteira
        </button>
        <button className="primary-button" onClick={() => onApply(crop, aspect)}>
          Aplicar recorte
        </button>
      </div>
    </div>
  );
}
