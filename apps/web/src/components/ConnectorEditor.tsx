import { Trash2 } from 'lucide-react';
import type { BoardDocument, Connector } from '@atelier/domain';
export function ConnectorEditor({ board, line }: { board: BoardDocument; line: Connector }) {
  return (
    <div className="connector-editor" data-no-drag role="group" aria-label="Editar conexão">
      <label>
        Rótulo
        <input
          aria-label="Rótulo da conexão"
          key={line.id}
          value={line.label}
          maxLength={500}
          onChange={(e) => board.patchConnector(line.id, { label: e.target.value })}
        />
      </label>
      <label>
        Traçado
        <select
          aria-label="Traçado da conexão"
          value={line.curved ? 'curve' : 'straight'}
          onChange={(e) => board.patchConnector(line.id, { curved: e.target.value === 'curve' })}
        >
          <option value="curve">Curva</option>
          <option value="straight">Reta</option>
        </select>
      </label>
      <label>
        Setas
        <select
          aria-label="Setas da conexão"
          value={line.arrows}
          onChange={(e) =>
            board.patchConnector(line.id, { arrows: e.target.value as Connector['arrows'] })
          }
        >
          <option value="none">Sem seta</option>
          <option value="end">No destino</option>
          <option value="both">Nas duas pontas</option>
        </select>
      </label>
      <label>
        Cor
        <input
          aria-label="Cor da conexão"
          type="color"
          value={line.color}
          onChange={(e) => board.patchConnector(line.id, { color: e.target.value })}
        />
      </label>
      <label>
        Espessura
        <input
          aria-label="Espessura da conexão"
          type="number"
          min={1}
          max={8}
          value={line.width}
          onChange={(e) =>
            board.patchConnector(line.id, {
              width: Math.min(8, Math.max(1, Number(e.target.value))),
            })
          }
        />
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={line.dashed}
          onChange={(e) => board.patchConnector(line.id, { dashed: e.target.checked })}
        />
        Tracejada
      </label>
      <button
        className="icon-button danger"
        aria-label="Excluir conexão"
        onClick={() => board.remove([line.id])}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
