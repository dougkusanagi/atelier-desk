import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import type { Task } from '@atelier/domain';
import { api } from '../lib/api';
export function TaskDetails({
  task,
  boardId,
  readOnly,
  onChange,
}: {
  task: Task;
  boardId: string;
  readOnly: boolean;
  onChange: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const members = useQuery({
    queryKey: ['members', boardId],
    enabled: open && !readOnly,
    queryFn: () =>
      api<{ items: Array<{ id: string; display_name: string }> }>(
        '/boards/' + boardId + '/members',
      ),
  });
  return (
    <details
      className="task-details"
      data-no-drag
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label="Prazo e responsável da tarefa">
        <CalendarDays size={12} />
        {task.dueDate && (
          <time dateTime={task.dueDate}>
            {new Date(task.dueDate + 'T12:00:00').toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            })}
          </time>
        )}
      </summary>
      <div className="task-detail-fields">
        <label>
          Prazo
          <input
            type="date"
            aria-label="Prazo da tarefa"
            value={task.dueDate ?? ''}
            disabled={readOnly}
            onChange={(event) => onChange({ ...task, dueDate: event.target.value || undefined })}
          />
        </label>
        <label>
          Responsável
          <select
            aria-label="Responsável da tarefa"
            value={task.assignee ?? ''}
            disabled={readOnly || members.isPending}
            onChange={(event) => onChange({ ...task, assignee: event.target.value || undefined })}
          >
            <option value="">Sem responsável</option>
            {members.data?.items.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
        {members.isError && <p role="alert">Não foi possível carregar os participantes.</p>}
      </div>
    </details>
  );
}
