import { memo } from 'react';
import { Check, MoreHorizontal, Palette, Plus, GripVertical } from 'lucide-react';
import { type BoardDocument, type Card, id } from '@atelier/domain';
export const BasicCard = memo(function BasicCard({
  card,
  board,
  readOnly = false,
}: {
  card: Card;
  board: BoardDocument;
  readOnly?: boolean;
}) {
  if (card.type === 'color')
    return (
      <div className="swatch-content">
        <input
          data-no-drag
          aria-label="Nome da cor"
          value={card.content.title ?? ''}
          readOnly={readOnly}
          onChange={(e) => board.patch(card.id, { content: { title: e.target.value } })}
        />
        <button
          data-no-drag
          className="hex-value"
          onClick={() => void navigator.clipboard.writeText(card.content.hex ?? '')}
        >
          {card.content.hex}
          <Palette size={14} />
        </button>
        {!readOnly && (
          <input
            data-no-drag
            type="color"
            aria-label="Editar cor"
            value={card.content.hex ?? '#D3BFA7'}
            onChange={(e) =>
              board.patch(card.id, { content: { hex: e.target.value.toUpperCase() } })
            }
          />
        )}
      </div>
    );
  if (card.type === 'tasks')
    return (
      <div className="task-card">
        <div className="card-topline">
          <GripVertical size={13} />
          <span>LISTA DE TAREFAS</span>
          <MoreHorizontal size={16} />
        </div>
        <input
          className="card-title"
          data-no-drag
          aria-label="Título da lista"
          value={card.content.title ?? ''}
          readOnly={readOnly}
          onChange={(e) => board.patch(card.id, { content: { title: e.target.value } })}
        />
        <div className="tasks">
          {card.content.tasks?.map((task) => (
            <div className={'task-row ' + (task.done ? 'completed' : '')} key={task.id}>
              <button
                data-no-drag
                className="checkbox"
                role="checkbox"
                aria-checked={task.done}
                aria-label={'Concluir ' + task.text}
                disabled={readOnly}
                onClick={() => board.putTask(card.id, { ...task, done: !task.done })}
              >
                {task.done && <Check size={13} />}
              </button>
              <input
                data-no-drag
                aria-label="Texto da tarefa"
                value={task.text}
                readOnly={readOnly}
                onChange={(e) => board.putTask(card.id, { ...task, text: e.target.value })}
              />
            </div>
          ))}
        </div>
        {!readOnly && (
          <button
            data-no-drag
            className="add-task"
            onClick={() =>
              board.putTask(card.id, {
                id: id(),
                text: '',
                done: false,
                order: (card.content.tasks?.at(-1)?.order ?? 0) + 1,
              })
            }
          >
            <Plus size={14} />
            Adicionar tarefa
          </button>
        )}
        <div className="task-count">
          {card.content.tasks?.filter((t) => t.done).length ?? 0} de{' '}
          {card.content.tasks?.length ?? 0} concluídas
        </div>
      </div>
    );
  return (
    <div className="note-card">
      {card.content.title && (
        <div className="card-topline">
          <span>
            {card.type === 'note' ? 'NOTA' : card.type === 'column' ? 'COLUNA' : 'CARTÃO'}
          </span>
          <MoreHorizontal size={16} />
        </div>
      )}
      <input
        data-no-drag
        className="card-title"
        aria-label="Título do cartão"
        placeholder="Sem título"
        value={card.content.title ?? ''}
        readOnly={readOnly}
        onChange={(e) => board.patch(card.id, { content: { title: e.target.value } })}
      />
      <textarea
        data-no-drag
        data-scrollable
        aria-label="Conteúdo da nota"
        placeholder="Escreva uma ideia..."
        value={card.content.text ?? ''}
        readOnly={readOnly}
        onChange={(e) => board.patch(card.id, { content: { text: e.target.value } })}
        style={{ minHeight: Math.max(90, card.height - 88) }}
      />
    </div>
  );
});
