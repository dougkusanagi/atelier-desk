import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Columns3,
  Download,
  File,
  FileText,
  Folder,
  History,
  Image,
  Layers,
  List,
  ListTodo,
  Loader2,
  MessageCircle,
  MousePointer2,
  Palette,
  Pencil,
  Redo2,
  Share2,
  Undo2,
  Video,
  WifiOff,
  Workflow,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Trash2,
} from 'lucide-react';
import {
  type BoardDocument,
  type CardType,
  type Point,
  effectiveCards,
  screenToWorld,
  arrangeCards,
  type Arrangement,
  id,
} from '@atelier/domain';
import { api, download, type BoardMeta } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBoardSync, type Presence, type SaveState } from '../lib/sync';
import { useUploads } from '../lib/uploads';
import { useWorkspace } from '../components/Shell';
import { Canvas } from '../features/canvas/Canvas';
import { useCanvas } from '../features/canvas/state';
import { CardView } from '../components/CardView';
import { Dialog } from '../components/Dialog';
import { SharePanel, CommentsPanel, ExportPanel } from '../components/BoardPanels';
export function BoardPage({ unsorted = false }: { unsorted?: boolean }) {
  const { id: routeId } = useParams(),
    { boards, workspaceId } = useWorkspace(),
    { user } = useAuth();
  const unsortedBoard = boards.find((b) => b.kind === 'unsorted' && b.owner_id === user!.id),
    boardId = unsorted ? unsortedBoard?.id : routeId;
  if (!boardId)
    return (
      <div className="full-state">
        <Loader2 size={24} className="spinner" />
        <p>Carregando seu espaço…</p>
        {unsorted && workspaceId && (
          <button
            className="primary-button"
            onClick={() =>
              void api('/boards', {
                method: 'POST',
                body: JSON.stringify({ workspaceId, title: 'Não organizados', kind: 'unsorted' }),
              }).then(() => window.location.reload())
            }
          >
            Criar área de capturas
          </button>
        )}
      </div>
    );
  return <LoadedBoard key={boardId} boardId={boardId} />;
}
function LoadedBoard({ boardId }: { boardId: string }) {
  const { user } = useAuth(),
    workspace = useWorkspace(),
    client = useQueryClient();
  const sync = useBoardSync(boardId, user!),
    camera = useCanvas((s) => s.camera),
    selected = useCanvas((s) => s.selected),
    activeTool = useCanvas((s) => s.tool);
  const { setCamera, setSelected, setTool, notify } = useCanvas.getState();
  const [panel, setPanel] = useState<'share' | 'comments' | 'export' | 'history' | 'trash' | null>(
      null,
    ),
    [linear, setLinear] = useState(window.innerWidth < 768);
  const filePicker = useRef<HTMLInputElement>(null),
    [uploadType, setUploadType] = useState<CardType>('image');
  const uploads = useUploads(sync.board, boardId, user!.id);
  const readOnly =
    !sync.meta || !['owner', 'editor'].includes(sync.meta.role) || sync.status === 'denied';
  useEffect(() => {
    const stored = localStorage.getItem('atelier-camera:' + user!.id + ':' + boardId);
    setCamera(stored ? JSON.parse(stored) : { x: 48, y: 38, zoom: 1 });
    setSelected([]);
    return () => {
      localStorage.setItem(
        'atelier-camera:' + user!.id + ':' + boardId,
        JSON.stringify(useCanvas.getState().camera),
      );
    };
  }, [boardId, user, setCamera, setSelected]);
  useEffect(() => {
    if (sync.meta && workspace.workspaceId !== sync.meta.workspace_id)
      workspace.setWorkspaceId(sync.meta.workspace_id);
  }, [sync.meta, workspace.workspaceId]);
  useEffect(() => {
    const undo = () => sync.board?.undo();
    window.addEventListener('atelier-undo', undo);
    return () => window.removeEventListener('atelier-undo', undo);
  }, [sync.board]);
  const create = useCallback(
    async (type: CardType, point: Point) => {
      if (!sync.board || readOnly) return;
      if (['image', 'file'].includes(type)) {
        setUploadType(type);
        filePicker.current?.click();
        return;
      }
      const cardId = sync.board.add(type, point);
      setSelected([cardId]);
      if (type === 'board') {
        try {
          const result = await api<BoardMeta>('/boards', {
            method: 'POST',
            body: JSON.stringify({
              id: id(),
              workspaceId: sync.meta!.workspace_id,
              parentId: boardId,
              title: 'Novo quadro',
            }),
          });
          sync.board.patch(cardId, {
            content: { boardId: result.id, title: result.title, owned: true },
          });
          await workspace.refresh();
        } catch (error) {
          sync.board.remove([cardId]);
          notify(error instanceof Error ? error.message : 'Não foi possível criar o quadro');
        }
      }
    },
    [sync.board, sync.meta, readOnly, boardId, setSelected, workspace, notify],
  );
  const add = (type: CardType) => {
    const at = useCanvas.getState().pointer ?? screenToWorld({ x: 300, y: 170 }, camera);
    void create(type, at);
  };
  const labels: Record<SaveState, string> = {
    loading: 'Carregando…',
    saving: 'Salvando…',
    saved: 'Salvo',
    offline: 'Offline · salvo neste dispositivo',
    failed: 'Falha ao salvar',
    denied: 'Acesso alterado',
  };
  const tools = [
    { type: 'note', label: 'Nota', icon: FileText },
    { type: 'tasks', label: 'Tarefas', icon: ListTodo },
    { type: 'image', label: 'Imagem', icon: Image },
    { type: 'link', label: 'Link', icon: Workflow },
    { type: 'file', label: 'Arquivo', icon: File },
    { type: 'media', label: 'Mídia', icon: Video },
    { type: 'color', label: 'Cor', icon: Palette },
    { type: 'column', label: 'Coluna', icon: Columns3 },
    { type: 'board', label: 'Quadro', icon: Folder },
    { type: 'drawing', label: 'Desenho', icon: Pencil },
  ] as const;
  const trail: BoardMeta[] = [];
  let parent = sync.meta?.parent_id;
  while (parent && trail.length < 50) {
    const ancestor = workspace.boards.find((b) => b.id === parent);
    if (!ancestor) break;
    trail.unshift(ancestor);
    parent = ancestor.parent_id;
  }
  const history = useQuery({
    queryKey: ['history', boardId],
    enabled: panel === 'history',
    queryFn: () =>
      api<{
        items: Array<{ id: string; label: string; display_name: string; created_at: string }>;
        versions: Array<{ id: string; description: string; created_at: string }>;
      }>('/boards/' + boardId + '/history'),
  });
  if (!sync.board || !sync.meta)
    return (
      <div className="full-state">
        {sync.error ? (
          <>
            <h1>Não foi possível abrir o quadro</h1>
            <p>{sync.error}</p>
            <button className="primary-button" onClick={sync.retry}>
              Tentar novamente
            </button>
            <Link to="/">Voltar aos quadros</Link>
          </>
        ) : (
          <>
            <Loader2 size={24} className="spinner" />
            <p>Abrindo seu quadro…</p>
          </>
        )}
      </div>
    );
  return (
    <>
      <header className="board-header">
        <div className="breadcrumb">
          <Link
            aria-label="Voltar aos quadros"
            to={sync.meta.parent_id ? '/quadro/' + sync.meta.parent_id : '/'}
          >
            <ArrowLeft size={17} />
          </Link>
          <Link to="/">Meus quadros</Link>
          {trail.map((item) => (
            <span key={item.id} className="breadcrumb-parent">
              <ChevronRight size={12} />
              <Link to={'/quadro/' + item.id}>{item.title}</Link>
            </span>
          ))}
          <ChevronRight size={12} />
          <strong>{sync.meta.title}</strong>
        </div>
        <div className="header-actions">
          <span className={'save-state save-' + sync.status} aria-live="polite">
            {sync.status === 'saved' ? (
              <Check size={13} />
            ) : sync.status === 'offline' ? (
              <WifiOff size={13} />
            ) : sync.status === 'saving' ? (
              <Loader2 size={13} className="spinner" />
            ) : null}
            {labels[sync.status]}
          </span>
          <div className="presence-avatars">
            {sync.presence.slice(0, 4).map((p) => (
              <span className="tiny-avatar" key={p.clientId} title={p.user.name}>
                {p.user.name[0]}
              </span>
            ))}
          </div>
          <button
            className="icon-button"
            aria-label="Comentários"
            onClick={() => setPanel('comments')}
          >
            <MessageCircle size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Histórico"
            onClick={() => setPanel('history')}
          >
            <History size={17} />
          </button>
          <button className="icon-button" aria-label="Exportar" onClick={() => setPanel('export')}>
            <Download size={17} />
          </button>
          {sync.meta.role === 'owner' && (
            <button className="primary-button compact" onClick={() => setPanel('share')}>
              <Share2 size={14} />
              Compartilhar
            </button>
          )}
        </div>
      </header>
      {sync.error && (
        <div className="error-banner" role="alert">
          <span>{sync.error}</span>
          <button
            onClick={() =>
              download(
                'recuperacao-atelier.json',
                JSON.stringify(sync.board!.snapshot(), null, 2),
                'application/json',
              )
            }
          >
            Exportar cópia local
          </button>
          <button onClick={sync.retry}>Reconectar</button>
        </div>
      )}
      {readOnly && (
        <div className="readonly-banner">
          Este quadro é somente leitura.{' '}
          {sync.meta.role === 'commenter' ? 'Você pode deixar comentários.' : ''}
        </div>
      )}
      <div className="board-content">
        <aside className="creation-rail" aria-label="Criar cartões">
          <button
            className={'tool ' + (activeTool === 'select' ? 'selected' : '')}
            aria-label="Selecionar"
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={19} />
            <span>Selecionar</span>
          </button>
          <div className="rail-divider" />
          {!readOnly &&
            tools.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                className="tool"
                title={'Criar ' + label}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/atelier-tool', type)}
                onClick={() => add(type)}
              >
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
          {!readOnly && (
            <button
              className={'tool ' + (activeTool === 'connector' ? 'selected' : '')}
              title="Conectar cartões"
              onClick={() => setTool('connector')}
            >
              <Workflow size={19} />
              <span>Conectar</span>
            </button>
          )}
          <div className="rail-bottom">
            <button
              className="tool"
              aria-label="Desfazer"
              disabled={readOnly}
              onClick={() => sync.board!.undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="tool"
              aria-label="Refazer"
              disabled={readOnly}
              onClick={() => sync.board!.redo()}
            >
              <Redo2 size={17} />
            </button>
            <button
              className="tool"
              aria-label="Lixeira de cartões"
              onClick={() => setPanel('trash')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </aside>
        <div className="canvas-container">
          <div className="board-heading">
            <div className="board-title-row">
              <h1>
                <input
                  aria-label="Nome do quadro"
                  value={sync.meta.title}
                  readOnly={readOnly}
                  onChange={(e) => sync.setMeta({ ...sync.meta!, title: e.target.value })}
                  onBlur={(e) => {
                    if (!readOnly && e.target.value.trim())
                      void api('/boards/' + boardId, {
                        method: 'PATCH',
                        body: JSON.stringify({ title: e.target.value }),
                      })
                        .then(() => void workspace.refresh())
                        .catch((error) => notify(error.message));
                  }}
                />
              </h1>
              <div className="board-view-toggle">
                <button
                  aria-label="Exibição em canvas"
                  aria-pressed={!linear}
                  onClick={() => setLinear(false)}
                >
                  <Layers size={16} />
                </button>
                <button
                  aria-label="Exibição linear"
                  aria-pressed={linear}
                  onClick={() => setLinear(true)}
                >
                  <List size={16} />
                </button>
              </div>
            </div>
            <p>
              {sync.meta.description ||
                'Um espaço livre para organizar ideias, referências e próximos passos.'}
            </p>
            <div className="board-heading-meta">
              <span className="tiny-avatar">{user!.displayName[0]}</span>
              <span>{sync.meta.role === 'owner' ? 'Criado por você' : 'Quadro compartilhado'}</span>
              <span className="dot-separator">·</span>
              <button onClick={() => setPanel('history')}>Histórico do quadro</button>
            </div>
          </div>
          <BoardContent
            board={sync.board}
            boardId={boardId}
            readOnly={readOnly}
            linear={linear}
            onUpload={uploads.upload}
            onCreate={(type, at) => void create(type, at)}
            onPresence={sync.sendPresence}
            collaborators={sync.presence}
          />
        </div>
      </div>
      <input
        ref={filePicker}
        className="sr-only"
        type="file"
        multiple
        aria-label="Adicionar arquivos"
        accept={uploadType === 'image' ? 'image/*' : undefined}
        onChange={(e) => {
          if (e.target.files)
            void uploads.upload(
              [...e.target.files],
              useCanvas.getState().pointer ?? screenToWorld({ x: 200, y: 150 }, camera),
            );
          e.target.value = '';
        }}
      />
      {uploads.uploads.some((u) => u.status !== 'ready') && (
        <div className="upload-queue" role="status">
          {uploads.uploads
            .filter((u) => u.status !== 'ready')
            .map((item) => (
              <div key={item.id}>
                <span>{item.name}</span>
                <progress value={item.progress} max={100} />
                <small>
                  {item.status === 'queued'
                    ? 'Na fila'
                    : item.progress === 100
                      ? 'Processando…'
                      : item.progress + '%'}
                </small>
                {item.status === 'failed' && (
                  <button onClick={() => uploads.retry(item.id)}>Tentar novamente</button>
                )}
              </div>
            ))}
        </div>
      )}
      {!readOnly && (
        <div className="mobile-add">
          <select
            aria-label="Criar cartão"
            defaultValue=""
            onChange={(e) => {
              add(e.target.value as CardType);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              + Adicionar
            </option>
            {tools.map((t) => (
              <option value={t.type} key={t.type}>
                {t.label}
              </option>
            ))}
          </select>
          <button onClick={() => sync.board!.undo()}>
            <Undo2 size={18} />
            Desfazer
          </button>
          <button onClick={() => setPanel('comments')}>
            <MessageCircle size={18} />
            Comentários
          </button>
        </div>
      )}
      <Dialog
        open={panel === 'share'}
        onClose={() => setPanel(null)}
        title="Compartilhar quadro"
        description="Escolha quem pode ver, comentar e editar."
      >
        <SharePanel boardId={boardId} />
      </Dialog>
      <Dialog
        open={panel === 'comments'}
        onClose={() => setPanel(null)}
        title="Comentários"
        description="Converse sobre o quadro ou o cartão selecionado."
      >
        <CommentsPanel boardId={boardId} cardId={selected[0]} role={sync.meta.role} />
      </Dialog>
      <Dialog
        open={panel === 'export'}
        onClose={() => setPanel(null)}
        title="Exportar quadro"
        description="Baixe uma versão do seu trabalho."
      >
        <ExportPanel boardId={boardId} selected={selected} />
      </Dialog>
      <Dialog open={panel === 'history'} onClose={() => setPanel(null)} title="Histórico do quadro">
        <div className="history-actions">
          <button
            className="secondary-button"
            disabled={readOnly}
            onClick={() => {
              sync.board!.undo();
              notify('Última alteração local desfeita');
            }}
          >
            Desfazer
          </button>
          <button
            className="secondary-button"
            disabled={readOnly}
            onClick={() =>
              void api('/boards/' + boardId + '/checkpoints', { method: 'POST', body: '{}' }).then(
                () => void history.refetch(),
              )
            }
          >
            Salvar versão
          </button>
          <button
            className="secondary-button"
            disabled={readOnly}
            onClick={() =>
              void api('/boards/' + boardId + '/template', {
                method: 'POST',
                body: JSON.stringify({ name: sync.meta!.title }),
              }).then(() => {
                notify('Template salvo');
                void client.invalidateQueries({ queryKey: ['templates'] });
              })
            }
          >
            Salvar como template
          </button>
        </div>
        {history.isPending ? (
          <p>Carregando…</p>
        ) : (
          <div className="history-list">
            {history.data?.versions.map((v) => (
              <div key={v.id}>
                <strong>{v.description}</strong>
                <small>{new Date(v.created_at).toLocaleString('pt-BR')}</small>
              </div>
            ))}
            {history.data?.items.map((item) => (
              <div key={item.id}>
                <strong>{item.label}</strong>
                <span>{item.display_name}</span>
                <small>{new Date(item.created_at).toLocaleString('pt-BR')}</small>
              </div>
            ))}
          </div>
        )}
      </Dialog>
      <Dialog open={panel === 'trash'} onClose={() => setPanel(null)} title="Lixeira de cartões">
        <CardTrash board={sync.board} readOnly={readOnly} />
      </Dialog>
    </>
  );
}
function BoardContent({
  board,
  boardId,
  readOnly,
  linear,
  onUpload,
  onCreate,
  onPresence,
  collaborators,
}: {
  board: BoardDocument;
  boardId: string;
  readOnly: boolean;
  linear: boolean;
  onUpload: (files: File[], point: Point, replaceId?: string) => void;
  onCreate: (type: CardType, point: Point) => void;
  onPresence: (point: Point, selection: string[]) => void;
  collaborators: Presence[];
}) {
  const state = useSyncExternalStore(board.subscribe, board.snapshot),
    selection = useCanvas((s) => s.selected);
  const cards = effectiveCards(state.cards);
  const align = (mode: Arrangement) => {
    const patches = arrangeCards(cards, selection, mode);
    board.transact(() => patches.forEach((patch, id) => board.patch(id, patch)));
  };
  return (
    <>
      {selection.length > 1 && !readOnly && (
        <div className="align-toolbar" data-no-drag>
          <button aria-label="Alinhar à esquerda" onClick={() => align('left')}>
            <AlignLeft size={16} />
          </button>
          <button aria-label="Alinhar ao centro" onClick={() => align('center')}>
            <AlignCenter size={16} />
          </button>
          <button aria-label="Alinhar à direita" onClick={() => align('right')}>
            <AlignRight size={16} />
          </button>
          <button aria-label="Alinhar ao topo" onClick={() => align('top')}>
            <AlignStartVertical size={16} />
          </button>
          <button aria-label="Alinhar ao meio" onClick={() => align('middle')}>
            <AlignCenterVertical size={16} />
          </button>
          <button aria-label="Alinhar à base" onClick={() => align('bottom')}>
            <AlignEndVertical size={16} />
          </button>
          <button
            aria-label="Distribuir horizontalmente"
            disabled={selection.length < 3}
            onClick={() => align('horizontal')}
          >
            <AlignHorizontalSpaceAround size={16} />
          </button>
          <button
            aria-label="Distribuir verticalmente"
            disabled={selection.length < 3}
            onClick={() => align('vertical')}
          >
            <AlignVerticalSpaceAround size={16} />
          </button>
        </div>
      )}
      {linear ? (
        <div className="linear-board">
          {cards
            .filter((c) => c.type !== 'column')
            .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
            .map((card) => (
              <article
                key={card.id}
                className={'card card-' + card.type}
                style={{ background: card.type === 'color' ? card.content.hex : card.color }}
              >
                <CardView
                  card={card}
                  board={board}
                  boardId={boardId}
                  readOnly={readOnly}
                  onUpload={onUpload}
                />
              </article>
            ))}
        </div>
      ) : (
        <Canvas
          board={board}
          readOnly={readOnly}
          onFiles={onUpload}
          onCreate={onCreate}
          onPresence={onPresence}
          collaborators={collaborators}
          renderCard={(card) => (
            <CardView
              card={card}
              board={board}
              boardId={boardId}
              readOnly={readOnly}
              onUpload={onUpload}
            />
          )}
        />
      )}
    </>
  );
}
function CardTrash({ board, readOnly }: { board: BoardDocument; readOnly: boolean }) {
  const state = useSyncExternalStore(board.subscribe, board.snapshot);
  const cards = state.cards.filter((c) => c.deletedAt);
  return cards.length ? (
    <div className="trash-list">
      {cards.map((card) => (
        <div key={card.id}>
          <span>{card.content.title || card.content.filename || card.type}</span>
          <button
            className="secondary-button"
            disabled={readOnly}
            onClick={() => board.restore([card.id])}
          >
            Restaurar
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty-state">
      <Trash2 size={32} />
      <p>Nenhum cartão na lixeira.</p>
    </div>
  );
}
