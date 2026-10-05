import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bell, Check, Search, Trash2, Undo2 } from 'lucide-react';
import { api, type BoardMeta } from '../lib/api';
import { useWorkspace } from '../components/Shell';
import { useCanvas } from '../features/canvas/state';
import { useAuth } from '../lib/auth';
function Header({ title }: { title: string }) {
  return (
    <header className="board-header">
      <div className="breadcrumb">
        <Link aria-label="Voltar aos quadros" to="/">
          <ArrowLeft size={17} />
        </Link>
        <strong>{title}</strong>
      </div>
    </header>
  );
}
export function SearchPage() {
  const [text, setText] = useState(''),
    [query, setQuery] = useState(''),
    [type, setType] = useState(''),
    { workspaceId } = useWorkspace(),
    navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const results = useQuery({
    queryKey: ['search', workspaceId, query, type],
    enabled: Boolean(query.trim()),
    queryFn: () =>
      api<{
        items: Array<{
          boardId: string;
          boardTitle: string;
          cardId?: string;
          text: string;
          type: string;
        }>;
      }>(
        '/search?q=' +
          encodeURIComponent(query) +
          '&workspaceId=' +
          workspaceId +
          (type ? '&type=' + type : ''),
      ),
  });
  return (
    <>
      <Header title="Pesquisar" />
      <div className="utility-page">
        <h1>Encontre uma ideia.</h1>
        <div className="search-field">
          <Search size={20} />
          <input
            aria-label="Pesquisar ideias"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Notas, quadros, tarefas, links…"
          />
          <select
            aria-label="Tipo de conteúdo"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="note">Notas</option>
            <option value="tasks">Tarefas</option>
            <option value="image">Imagens</option>
            <option value="link">Links</option>
            <option value="file">Arquivos</option>
          </select>
        </div>
        {query ? (
          results.isPending ? (
            <p>Pesquisando…</p>
          ) : results.isError ? (
            <div className="form-error" role="alert">
              Não foi possível pesquisar. Verifique sua conexão.
            </div>
          ) : results.data?.items.length ? (
            <div className="search-results">
              {results.data.items.map((result, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (result.cardId)
                      sessionStorage.setItem('atelier-search-target', result.cardId);
                    navigate('/quadro/' + result.boardId);
                  }}
                >
                  <strong>{result.boardTitle}</strong>
                  <p>{result.text}</p>
                  <span>
                    {result.type === 'board'
                      ? 'Quadro'
                      : result.type === 'note'
                        ? 'Nota'
                        : result.type === 'tasks'
                          ? 'Tarefa'
                          : result.type}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={32} />
              <h3>Nenhuma ideia encontrada.</h3>
              <p>Tente outro termo ou tipo de conteúdo.</p>
            </div>
          )
        ) : (
          <p className="muted">Digite para pesquisar no seu espaço de trabalho.</p>
        )}
      </div>
    </>
  );
}
export function TrashPage() {
  const { workspaceId, refresh } = useWorkspace();
  const query = useQuery({
    queryKey: ['trash', workspaceId],
    queryFn: () => api<{ items: BoardMeta[] }>('/boards?trash=true&workspaceId=' + workspaceId),
    enabled: Boolean(workspaceId),
  });
  return (
    <>
      <Header title="Lixeira" />
      <div className="utility-page">
        <h1>Espaço para recomeçar.</h1>
        <p className="muted">Restaure um quadro para retomar suas ideias.</p>
        {query.isPending ? (
          <p>Carregando…</p>
        ) : query.data?.items.length ? (
          <div className="trash-list">
            {query.data.items.map((board) => (
              <div key={board.id}>
                <Trash2 size={18} />
                <span>
                  <strong>{board.title}</strong>
                  <small>
                    Excluído em {new Date(board.deleted_at!).toLocaleDateString('pt-BR')}
                  </small>
                </span>
                <button
                  className="secondary-button"
                  onClick={() =>
                    void api('/boards/' + board.id + '/restore', { method: 'POST' }).then(() => {
                      void query.refetch();
                      void refresh();
                      useCanvas.getState().notify('Quadro restaurado');
                    })
                  }
                >
                  <Undo2 size={14} />
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Trash2 size={32} />
            <p>A lixeira está vazia.</p>
          </div>
        )}
      </div>
    </>
  );
}
export function NotificationsPage() {
  const { user, refresh } = useAuth();
  const [savingPreference, setSavingPreference] = useState(false),
    [preferenceError, setPreferenceError] = useState(''),
    [emailMentions, setEmailMentions] = useState(user?.preferences?.emailMentions !== false);
  useEffect(() => {
    setEmailMentions(user?.preferences?.emailMentions !== false);
  }, [user?.preferences?.emailMentions]);
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      api<{
        items: Array<{
          id: string;
          message: string;
          board_id: string;
          read_at: string | null;
          created_at: string;
        }>;
      }>('/notifications'),
    refetchInterval: 15000,
  });
  return (
    <>
      <Header title="Notificações" />
      <div className="utility-page">
        <div className="section-heading">
          <h1>Conversas e descobertas.</h1>
          <button
            className="secondary-button"
            onClick={() =>
              void api('/notifications/read', { method: 'POST' }).then(() => void query.refetch())
            }
          >
            <Check size={14} />
            Marcar como lidas
          </button>
        </div>
        <label className="notification-preference">
          <input
            type="checkbox"
            checked={emailMentions}
            disabled={savingPreference}
            onChange={(event) => {
              const previous = emailMentions;
              setEmailMentions(event.target.checked);
              setSavingPreference(true);
              setPreferenceError('');
              void api('/auth/preferences', {
                method: 'PATCH',
                body: JSON.stringify({ emailMentions: event.target.checked }),
              })
                .then(() => refresh())
                .catch(() => {
                  setEmailMentions(previous);
                  setPreferenceError('Não foi possível salvar a preferência. Tente novamente.');
                })
                .finally(() => setSavingPreference(false));
            }}
          />
          Receber menções por e-mail
        </label>
        {preferenceError && (
          <p role="alert" className="form-error">
            {preferenceError}
          </p>
        )}
        {query.isPending ? (
          <p>Carregando…</p>
        ) : query.data?.items.length ? (
          <div className="notification-list">
            {query.data.items.map((item) => (
              <Link
                to={'/quadro/' + item.board_id}
                key={item.id}
                className={item.read_at ? 'read' : 'unread'}
                onClick={() => void api('/notifications/' + item.id + '/read', { method: 'POST' })}
              >
                <Bell size={18} />
                <span>
                  {item.message}
                  <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Bell size={32} />
            <p>Nenhuma notificação por enquanto.</p>
          </div>
        )}
      </div>
    </>
  );
}
export function HelpPage() {
  const shortcuts = [
    ['Desfazer', 'Ctrl/Cmd + Z'],
    ['Refazer', 'Ctrl/Cmd + Shift + Z'],
    ['Copiar / recortar / colar', 'Ctrl/Cmd + C / X / V'],
    ['Duplicar', 'Ctrl/Cmd + D'],
    ['Selecionar todos', 'Ctrl/Cmd + A'],
    ['Excluir seleção', 'Delete / Backspace'],
    ['Cancelar gesto', 'Esc'],
    ['Navegar no canvas', 'Espaço + arrastar'],
    ['Mover cartão', 'Setas (Shift: 10 px)'],
    ['Zoom', '+ / −'],
    ['Restaurar zoom', '0'],
    ['Enquadrar tudo', 'Shift + 1'],
    ['Pesquisar', 'Ctrl/Cmd + K'],
    ['Nova nota / tarefas / coluna', 'N / T / C'],
    ['Ajuda', '?'],
  ];
  return (
    <>
      <Header title="Ajuda e atalhos" />
      <div className="utility-page">
        <h1>Crie no seu ritmo.</h1>
        <p className="muted">
          Os atalhos do canvas funcionam quando ele está em foco. Campos de texto mantêm seus
          comandos de edição.
        </p>
        <table className="shortcut-table">
          <thead>
            <tr>
              <th>Ação</th>
              <th>Atalho</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map(([action, key]) => (
              <tr key={action}>
                <td>{action}</td>
                <td>
                  <kbd>{key}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>No tablet e celular</h2>
        <p>
          Arraste o fundo para navegar e use dois dedos para aproximar. Toque e segure um cartão por
          350ms para movê-lo. A exibição linear oferece edição sem gestos espaciais.
        </p>
        <h2>Seu trabalho fica preservado</h2>
        <p>
          “Salvo” confirma persistência no servidor. “Offline · salvo neste dispositivo” confirma
          armazenamento local. Quadros já abertos podem ser editados offline; arquivos e serviços
          externos dependem de conexão.
        </p>
        <h2>Uma implementação original</h2>
        <p>
          O Atelier Desk foi construído para organizar projetos criativos, com código e identidade
          próprios.
        </p>
      </div>
    </>
  );
}
