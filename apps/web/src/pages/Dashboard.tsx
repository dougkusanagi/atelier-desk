import { BoardIcon } from '../components/BoardIcon';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Grid2X2, List, Plus, Star, Trash2, Layers, Copy } from 'lucide-react';
import { BUILTIN_TEMPLATES } from '@atelier/domain';
import { api, type BoardMeta } from '../lib/api';
import { useWorkspace } from '../components/Shell';
import { useAuth } from '../lib/auth';
import { Dialog } from '../components/Dialog';
import { useCanvas } from '../features/canvas/state';
export function Dashboard() {
  const { workspaceId, boards, refresh } = useWorkspace(),
    { user } = useAuth(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [view, setView] = useState<'grid' | 'list'>('grid'),
    [creating, setCreating] = useState(false),
    [template, setTemplate] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filter, setFilter] = useState(''),
    [sort, setSort] = useState('recent');
  const templates = useQuery({
    queryKey: ['templates', workspaceId],
    queryFn: () =>
      api<{ items: Array<{ id: string; name: string }> }>('/templates?workspaceId=' + workspaceId),
  });
  const items = boards
    .filter(
      (b) =>
        b.kind !== 'unsorted' &&
        !b.parent_id &&
        b.title.toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'pt-BR')
        : Number(b.favorite) - Number(a.favorite) ||
          new Date(b.last_visited ?? b.updated_at).getTime() -
            new Date(a.last_visited ?? a.updated_at).getTime(),
    );
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const title = new FormData(event.currentTarget).get('title');
    try {
      const result = await api<BoardMeta>('/boards', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, title, templateId: template || undefined }),
      });
      await refresh();
      navigate('/quadro/' + result.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível criar o quadro.');
    } finally {
      setBusy(false);
    }
  };
  async function patch(id: string, body: unknown) {
    await api('/boards/' + id, { method: 'PATCH', body: JSON.stringify(body) });
    await refresh();
  }
  return (
    <>
      <header className="board-header">
        <div className="breadcrumb">
          <Link to="/">Meus quadros</Link>
        </div>
        <Link className="header-search" to="/buscar">
          Pesquisar <kbd>⌘ K</kbd>
        </Link>
      </header>
      <div className="dashboard-page">
        <div className="dashboard-heading">
          <div>
            <h1>Espaço para criar.</h1>
            <p>
              {user?.displayName.split(' ')[0]}, reúna suas ideias e dê forma ao próximo projeto.
            </p>
          </div>
          <button
            className="primary-button"
            disabled={!workspaceId}
            onClick={() => {
              setTemplate('');
              setCreating(true);
            }}
          >
            <Plus size={17} />
            Novo quadro
          </button>
        </div>
        <section className="template-strip" aria-labelledby="template-heading">
          <div className="section-heading">
            <h2 id="template-heading">Um ponto de partida</h2>
            <span>Templates para cada processo</span>
          </div>
          <div className="template-options">
            {(templates.data?.items ?? BUILTIN_TEMPLATES).map((item, i) => (
              <button
                key={item.id}
                className={'template-option template-' + i}
                onClick={() => {
                  setTemplate(item.id);
                  setCreating(true);
                }}
              >
                <div className="template-visual" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <span>{item.name}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </section>
        <section aria-labelledby="boards-heading">
          <div className="section-heading">
            <h2 id="boards-heading">
              Seus quadros <span className="count-badge">{items.length}</span>
            </h2>
            <div className="dashboard-controls">
              <input
                aria-label="Filtrar quadros"
                placeholder="Filtrar quadros…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                aria-label="Ordenar quadros"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Recentes</option>
                <option value="title">Nome</option>
              </select>
              <button
                aria-label="Exibição em grade"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                aria-label="Exibição em lista"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                <List size={16} />
              </button>
            </div>
          </div>
          {!items.length ? (
            <div className="empty-state">
              <Layers size={36} />
              <h3>Seu próximo projeto começa aqui.</h3>
              <p>Crie um quadro ou escolha um template para começar.</p>
              <button className="primary-button" onClick={() => setCreating(true)}>
                Criar quadro
              </button>
            </div>
          ) : (
            <div className={'board-gallery ' + view}>
              {items.map((board, i) => (
                <article className="dashboard-board" key={board.id}>
                  <Link className={'board-preview preview-' + (i % 4)} to={'/quadro/' + board.id}>
                    {board.cover_asset && (
                      <img
                        className="board-cover"
                        src={'/api/v1/assets/' + board.cover_asset + '/content?variant=thumbnail'}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <div className="preview-note" />
                    <div className="preview-note small" />
                    <div className="preview-swatch" />
                    <span className="preview-letter">
                      <BoardIcon name={board.icon} size={30} />
                    </span>
                  </Link>
                  <div className="dashboard-board-info">
                    <Link to={'/quadro/' + board.id}>
                      <h3>{board.title}</h3>
                      <p>
                        {board.role === 'owner' ? 'Criado por você' : 'Compartilhado com você'} ·{' '}
                        {new Date(board.updated_at).toLocaleDateString('pt-BR')}
                      </p>
                    </Link>
                    <button
                      className="icon-button"
                      aria-label={board.favorite ? 'Remover favorito' : 'Favoritar quadro'}
                      onClick={() => void patch(board.id, { favorite: !board.favorite })}
                    >
                      <Star size={15} fill={board.favorite ? 'currentColor' : 'none'} />
                    </button>
                    {['owner', 'editor'].includes(board.role) && (
                      <button
                        className="icon-button"
                        aria-label={'Duplicar ' + board.title}
                        onClick={() => {
                          void api<{ id: string }>('/boards/' + board.id + '/duplicate', {
                            method: 'POST',
                            body: '{}',
                          })
                            .then(async (result) => {
                              await refresh();
                              navigate('/quadro/' + result.id);
                            })
                            .catch((error) => useCanvas.getState().notify(error.message));
                        }}
                      >
                        <Copy size={15} />
                      </button>
                    )}
                    {board.role === 'owner' && (
                      <button
                        className="icon-button danger"
                        aria-label={'Excluir ' + board.title}
                        onClick={() => {
                          if (window.confirm('Mover este quadro e seus filhos para a lixeira?'))
                            void api('/boards/' + board.id, { method: 'DELETE' }).then(() => {
                              void refresh();
                              void client.invalidateQueries({ queryKey: ['trash'] });
                              useCanvas.getState().notify('Quadro movido para a lixeira');
                            });
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title={template ? 'Criar quadro com template' : 'Novo quadro'}
        description="Escolha um nome. Você poderá mudar depois."
      >
        <form onSubmit={(e) => void create(e)}>
          <label>
            Nome do quadro
            <input
              name="title"
              required
              maxLength={200}
              autoFocus
              placeholder="Meu próximo projeto"
              defaultValue={BUILTIN_TEMPLATES.find((t) => t.id === template)?.name ?? ''}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? 'Criando…' : 'Criar quadro'}
            <Plus size={16} />
          </button>
        </form>
      </Dialog>
    </>
  );
}
