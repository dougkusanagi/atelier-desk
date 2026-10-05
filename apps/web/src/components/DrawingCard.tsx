import { useRef, useState } from 'react';
import { Eraser, Pencil, Check } from 'lucide-react';
import { type BoardDocument, type Card, type Stroke, type Point, id } from '@atelier/domain';
export function DrawingCard({
  card,
  board,
  readOnly,
}: {
  card: Card;
  board: BoardDocument;
  readOnly: boolean;
}) {
  const [active, setActive] = useState(false),
    [eraser, setEraser] = useState(false),
    [color, setColor] = useState('#315BCB'),
    [width, setWidth] = useState(3),
    [preview, setPreview] = useState<Stroke | null>(null);
  const stroke = useRef<Stroke | null>(null),
    svg = useRef<SVGSVGElement>(null),
    frame = useRef(0);
  const logical = (event: { clientX: number; clientY: number; pressure?: number }) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * card.width,
      y: ((event.clientY - rect.top) / rect.height) * (card.height - 52),
      pressure: event.pressure ?? 0.5,
    };
  };
  const path = (points: Point[]) =>
    points.map((p, i) => (i ? 'L ' : 'M ') + p.x + ' ' + p.y).join(' ');
  return (
    <div className="drawing-card">
      {!readOnly && (
        <div className="drawing-tools" data-no-drag>
          <button
            aria-label="Modo de desenho"
            aria-pressed={active}
            onClick={() => setActive(!active)}
          >
            {active ? <Check size={15} /> : <Pencil size={15} />}
          </button>
          {active && (
            <>
              <button
                aria-label="Borracha"
                aria-pressed={eraser}
                onClick={() => setEraser(!eraser)}
              >
                <Eraser size={15} />
              </button>
              <input
                type="color"
                aria-label="Cor do traço"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                type="range"
                min={1}
                max={24}
                aria-label="Espessura do traço"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              />
              <button
                onClick={() => {
                  if (window.confirm('Apagar todos os traços?'))
                    board.transact(() =>
                      card.content.strokes?.forEach((s) => board.removeStroke(card.id, s.id)),
                    );
                }}
              >
                Limpar
              </button>
            </>
          )}
        </div>
      )}
      <svg
        ref={svg}
        width="100%"
        height={card.height - 52}
        viewBox={'0 0 ' + card.width + ' ' + (card.height - 52)}
        data-no-drag={active || undefined}
        className={active ? 'drawing-active' : ''}
        onPointerDown={(e) => {
          if (!active || readOnly) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (eraser) return;
          stroke.current = { id: id(), color, width, points: [logical(e)] };
          setPreview(stroke.current);
        }}
        onPointerMove={(e) => {
          if (!active) return;
          e.stopPropagation();
          if (!stroke.current) return;
          const next = logical(e);
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => {
            stroke.current?.points.push(next);
            setPreview(stroke.current ? { ...stroke.current } : null);
          });
        }}
        onPointerUp={(e) => {
          if (!active) return;
          e.stopPropagation();
          cancelAnimationFrame(frame.current);
          if (stroke.current) {
            stroke.current.points.push(logical(e));
            board.putStroke(card.id, stroke.current);
            stroke.current = null;
            setPreview(null);
          }
        }}
        onPointerCancel={() => {
          stroke.current = null;
          setPreview(null);
        }}
      >
        {card.content.strokes?.map((s) => (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            onPointerDown={(e) => {
              if (active && eraser && !readOnly) {
                e.stopPropagation();
                board.removeStroke(card.id, s.id);
              }
            }}
          />
        ))}
        {preview && (
          <path
            d={path(preview.points)}
            fill="none"
            stroke={preview.color}
            strokeWidth={preview.width}
            strokeLinecap="round"
          />
        )}
        {!card.content.strokes?.length && !preview && (
          <text
            x={card.width / 2}
            y={(card.height - 52) / 2}
            textAnchor="middle"
            fill="#626872"
            fontSize="12"
          >
            {readOnly ? 'Desenho vazio' : 'Ative o lápis para desenhar'}
          </text>
        )}
      </svg>
    </div>
  );
}
