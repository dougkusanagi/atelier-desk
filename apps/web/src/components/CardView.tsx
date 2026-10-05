import { memo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  File,
  FolderOpen,
  GripVertical,
  ImagePlus,
  MoreHorizontal,
  Plus,
  Trash2,
  Upload,
  Video,
  X,
  Pencil,
} from 'lucide-react';
import { CARD_COLORS, type BoardDocument, type Card, id } from '@atelier/domain';
import { RichNote } from './RichNote';
import { DrawingCard } from './DrawingCard';
import { Dialog } from './Dialog';
import { api } from '../lib/api';
import { useCanvas } from '../features/canvas/state';
type Props = {
  card: Card;
  board: BoardDocument;
  boardId: string;
  readOnly: boolean;
  onUpload: (files: File[], at: { x: number; y: number }, replaceId?: string) => void;
  shareToken?: string;
};
export const CardView = memo(function CardView({
  card,
  board,
  boardId,
  readOnly,
  onUpload,
  shareToken,
}: Props) {
  const navigate = useNavigate(),
    fileInput = useRef<HTMLInputElement>(null),
    [preview, setPreview] = useState(false),
    [activated, setActivated] = useState(false),
    [loading, setLoading] = useState(false),
    [linkError, setLinkError] = useState('');
  const { notify, setSelected } = useCanvas.getState();
  const url = card.content.assetId
    ? '/api/v1/assets/' +
      card.content.assetId +
      '/content' +
      (shareToken ? '?share=' + encodeURIComponent(shareToken) : '')
    : '';
  const assetUrl = (download = false) =>
    url + (download ? (url.includes('?') ? '&' : '?') + 'download=1' : '');
  const patch = (content: Partial<Card['content']>) => board.patch(card.id, { content });
  useEffect(() => {
    if (
      card.type !== 'link' ||
      !card.content.url ||
      card.content.description !== undefined ||
      readOnly
    )
      return;
    let current = true;
    setLoading(true);
    const originalTitle = card.content.title;
    void api<{ title: string; description: string; thumbnail?: string; favicon?: string }>(
      '/link-previews',
      { method: 'POST', body: JSON.stringify({ url: card.content.url, boardId }) },
    )
      .then((result) => {
        if (!current) return;
        const now = board.snapshot().cards.find((c) => c.id === card.id);
        patch({
          ...result,
          title: now?.content.title === originalTitle ? result.title : now?.content.title,
        });
      })
      .catch((error) => {
        if (current) {
          setLinkError(error instanceof Error ? error.message : 'Prévia indisponível');
          patch({ description: '' });
        }
      })
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [card.id, card.type, card.content.url, boardId, readOnly]);
  const actions = !readOnly && (
    <Menu.Root>
      <Menu.Trigger className="card-menu-trigger" data-no-drag aria-label="Ações do cartão">
        <MoreHorizontal size={17} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="dropdown-content" sideOffset={6}>
          <Menu.Item
            className="dropdown-item"
            onSelect={() => {
              setSelected(board.duplicate([card.id]));
            }}
          >
            <Copy size={14} />
            Duplicar
          </Menu.Item>
          <Menu.Item
            className="dropdown-item"
            onSelect={() =>
              board.patch(card.id, { z: Math.max(...board.snapshot().cards.map((c) => c.z)) + 1 })
            }
          >
            <ArrowUp size={14} />
            Trazer para frente
          </Menu.Item>
          <Menu.Item
            className="dropdown-item"
            onSelect={() =>
              board.patch(card.id, { z: Math.min(...board.snapshot().cards.map((c) => c.z)) - 1 })
            }
          >
            <ArrowDown size={14} />
            Enviar para trás
          </Menu.Item>
          <Menu.Item
            className="dropdown-item"
            onSelect={() => {
              const width = window.prompt('Largura do cartão em pixels', String(card.width));
              if (width && Number.isFinite(Number(width)))
                board.patch(card.id, { width: Math.min(2400, Math.max(180, Number(width))) });
            }}
          >
            <Pencil size={14} />
            Alterar largura
          </Menu.Item>
          <Menu.Separator className="dropdown-separator" />
          <div className="card-colors" aria-label="Cor do cartão">
            {CARD_COLORS.map((color) => (
              <button
                key={color}
                aria-label={'Cor ' + color}
                style={{ background: color }}
                onClick={() => board.patch(card.id, { color })}
              />
            ))}
          </div>
          <Menu.Separator className="dropdown-separator" />
          <Menu.Item
            className="dropdown-item danger"
            onSelect={() => {
              board.remove([card.id]);
              notify('Cartão movido para a lixeira. Desfazer');
            }}
          >
            <Trash2 size={14} />
            Mover para lixeira
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
  const title = (placeholder = 'Sem título') => (
    <input
      data-no-drag
      className="card-title"
      aria-label="Título do cartão"
      placeholder={placeholder}
      value={card.content.title ?? ''}
      readOnly={readOnly}
      onChange={(e) => patch({ title: e.target.value })}
    />
  );
  const caption = (
    <input
      className="card-caption"
      data-no-drag
      aria-label="Legenda"
      placeholder={readOnly ? '' : 'Adicionar legenda…'}
      value={card.content.caption ?? ''}
      readOnly={readOnly}
      onChange={(e) => patch({ caption: e.target.value })}
    />
  );
  const picker = (
    <input
      ref={fileInput}
      className="sr-only"
      type="file"
      aria-label="Enviar arquivo"
      accept={
        card.type === 'image' ? 'image/*' : card.type === 'media' ? 'video/*,audio/*' : undefined
      }
      onChange={(e) => {
        if (e.target.files) onUpload([...e.target.files], { x: card.x, y: card.y }, card.id);
        e.target.value = '';
      }}
    />
  );
  if (card.type === 'note')
    return (
      <div className="note-card">
        <div className="card-grip">
          <GripVertical size={13} />
          <span>Nota</span>
          {actions}
        </div>
        {title('Uma nova ideia')}
        <RichNote card={card} board={board} readOnly={readOnly} />
      </div>
    );
  if (card.type === 'tasks')
    return (
      <div className="task-card">
        <div className="card-grip">
          <GripVertical size={13} />
          <span>Tarefas</span>
          {actions}
        </div>
        {title('Lista de tarefas')}
        <div className="tasks">
          {card.content.tasks?.map((task, index) => {
            const reorder = (delta: number) => {
              const other = card.content.tasks?.[index + delta];
              if (other)
                board.transact(() => {
                  board.putTask(card.id, { ...task, order: other.order });
                  board.putTask(card.id, { ...other, order: task.order });
                });
            };
            return (
              <div
                key={task.id}
                className={'task-row ' + (task.done ? 'completed' : '')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const taskId = e.dataTransfer.getData('application/atelier-task');
                  const source = card.content.tasks?.find((t) => t.id === taskId);
                  if (source)
                    board.transact(() => {
                      board.putTask(card.id, { ...source, order: task.order });
                      board.putTask(card.id, { ...task, order: source.order });
                    });
                }}
              >
                {!readOnly && (
                  <span
                    className="task-grip"
                    data-no-drag
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData('application/atelier-task', task.id);
                    }}
                  >
                    <GripVertical size={12} />
                  </span>
                )}
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
                  placeholder="Nova tarefa…"
                  value={task.text}
                  readOnly={readOnly}
                  onChange={(e) => board.putTask(card.id, { ...task, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !readOnly) {
                      e.preventDefault();
                      board.putTask(card.id, {
                        id: id(),
                        text: '',
                        done: false,
                        order: task.order + 0.5,
                      });
                    }
                  }}
                />
                {!readOnly && (
                  <div className="task-actions" data-no-drag>
                    <button
                      aria-label="Mover tarefa para cima"
                      disabled={index === 0}
                      onClick={() => reorder(-1)}
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      aria-label="Mover tarefa para baixo"
                      disabled={index === (card.content.tasks?.length ?? 0) - 1}
                      onClick={() => reorder(1)}
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      aria-label="Excluir tarefa"
                      onClick={() => board.removeTask(card.id, task.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
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
  if (card.type === 'column')
    return (
      <div className="column-header">
        <button
          data-no-drag
          className="icon-button"
          aria-label={card.content.collapsed ? 'Expandir coluna' : 'Recolher coluna'}
          onClick={() => patch({ collapsed: !card.content.collapsed })}
        >
          {card.content.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        {title('Nova coluna')}
        <span className="column-count">
          {
            board
              .snapshot()
              .cards.filter(
                (c) => !c.deletedAt && c.layout.kind === 'column' && c.layout.columnId === card.id,
              ).length
          }
        </span>
        {actions}
      </div>
    );
  if (card.type === 'color') {
    const rgb = (card.content.hex ?? '#D3BFA7')
      .slice(1)
      .match(/../g)
      ?.map((v) => parseInt(v, 16) / 255) ?? [0.8, 0.7, 0.6];
    const lum = rgb
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    return (
      <div className="swatch-content" style={{ color: lum > 0.179 ? '#191B1F' : '#FFFFFF' }}>
        <div className="swatch-actions">
          {actions}
          {!readOnly && (
            <input
              data-no-drag
              type="color"
              aria-label="Editar cor"
              value={card.content.hex ?? '#D3BFA7'}
              onChange={(e) => patch({ hex: e.target.value.toUpperCase() })}
            />
          )}
        </div>
        <input
          data-no-drag
          aria-label="Nome da cor"
          value={card.content.title ?? ''}
          readOnly={readOnly}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <button
          data-no-drag
          className="hex-value"
          onClick={() => {
            void navigator.clipboard
              .writeText(card.content.hex ?? '')
              .then(() => notify('HEX copiado'));
          }}
        >
          {card.content.hex}
          <Copy size={13} />
        </button>
      </div>
    );
  }
  if (card.type === 'drawing')
    return (
      <div>
        <div className="card-grip padded">
          <GripVertical size={13} />
          <span>Desenho</span>
          {actions}
        </div>
        <DrawingCard card={card} board={board} readOnly={readOnly} />
      </div>
    );
  if (card.type === 'board')
    return (
      <div
        className="board-card"
        onDoubleClick={() => card.content.boardId && navigate('/quadro/' + card.content.boardId)}
      >
        <div className="card-grip">
          <GripVertical size={13} />
          <span>{card.content.owned ? 'Quadro aninhado' : 'Referência'}</span>
          {actions}
        </div>
        <div className="nested-board-art">
          <FolderOpen size={38} />
        </div>
        {title('Novo quadro')}
        <button
          data-no-drag
          className="open-board"
          disabled={!card.content.boardId}
          onClick={() => navigate('/quadro/' + card.content.boardId)}
        >
          {card.content.boardId ? 'Abrir quadro' : 'Criando quadro…'}
          <ArrowUpRight size={15} />
        </button>
      </div>
    );
  if (card.type === 'link')
    return (
      <div className="link-card">
        <div className="card-grip padded">
          <GripVertical size={13} />
          <span>Referência</span>
          {actions}
        </div>
        {loading ? (
          <div className="link-skeleton">
            <i />
            <i />
            <i />
          </div>
        ) : (
          card.content.thumbnail && (
            <img src={card.content.thumbnail} alt="" loading="lazy" className="link-thumbnail" />
          )
        )}
        <div className="link-body">
          {title('Título do link')}
          {!readOnly && (
            <input
              data-no-drag
              className="url-input"
              aria-label="Endereço do link"
              placeholder="https://…"
              defaultValue={card.content.url ?? ''}
              onBlur={(e) => {
                if (e.target.value !== card.content.url && /^https?:\/\//.test(e.target.value))
                  patch({ url: e.target.value, description: undefined });
              }}
            />
          )}
          <p>{card.content.description || linkError}</p>
          {card.content.url && (
            <a
              data-no-drag
              href={card.content.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-domain"
            >
              {card.content.favicon && <img src={card.content.favicon} alt="" />}
              {new URL(card.content.url).hostname}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    );
  if (!card.content.assetId && !(card.type === 'media' && card.content.url))
    return (
      <div className="upload-placeholder">
        <div className="card-grip">
          <GripVertical size={13} />
          <span>
            {card.type === 'image'
              ? 'Imagem'
              : card.type === 'media'
                ? 'Vídeo ou áudio'
                : 'Arquivo'}
          </span>
          {actions}
        </div>
        {card.type === 'image' ? (
          <ImagePlus size={32} />
        ) : card.type === 'media' ? (
          <Video size={32} />
        ) : (
          <File size={32} />
        )}
        <p>
          {card.content.uploadState === 'uploading'
            ? 'Enviando…'
            : card.content.uploadState === 'failed'
              ? 'Falha no envio. Tente novamente.'
              : 'Arraste um arquivo para cá'}
        </p>
        {!readOnly && (
          <button
            data-no-drag
            className="secondary-button"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            Escolher arquivo
          </button>
        )}
        {picker}
        {card.type === 'media' && !readOnly && (
          <input
            data-no-drag
            className="url-input"
            placeholder="Link do YouTube ou Vimeo"
            aria-label="Link do vídeo"
            onBlur={(e) => /^https?:\/\//.test(e.target.value) && patch({ url: e.target.value })}
          />
        )}
      </div>
    );
  if (card.type === 'image')
    return (
      <div className="image-card">
        <div className="image-card-actions">{actions}</div>
        <img
          src={assetUrl()}
          alt={card.content.alt ?? card.content.caption ?? ''}
          draggable={false}
          loading="lazy"
          onDoubleClick={() => setPreview(true)}
        />
        <div className="image-caption">
          {caption}
          {!readOnly && (
            <input
              className="card-caption"
              data-no-drag
              aria-label="Descrição acessível da imagem"
              placeholder="Descrição da imagem"
              value={card.content.alt ?? ''}
              onChange={(e) => patch({ alt: e.target.value })}
            />
          )}
        </div>
        {picker}
        <Dialog
          open={preview}
          onClose={() => setPreview(false)}
          title={card.content.filename ?? 'Imagem'}
        >
          <img className="lightbox-image" src={assetUrl()} alt={card.content.alt ?? ''} />
          <a className="secondary-button" href={assetUrl(true)} download>
            <Download size={15} />
            Baixar original
          </a>
        </Dialog>
      </div>
    );
  if (card.type === 'media') {
    let embed = '';
    if (card.content.url) {
      try {
        const parsed = new URL(card.content.url),
          youtube =
            parsed.hostname === 'youtu.be'
              ? parsed.pathname.slice(1)
              : ['youtube.com', 'www.youtube.com'].includes(parsed.hostname)
                ? parsed.searchParams.get('v')
                : null;
        if (youtube && /^[\w-]{11}$/.test(youtube))
          embed = 'https://www.youtube-nocookie.com/embed/' + youtube;
        const vimeo = parsed.hostname === 'vimeo.com' ? parsed.pathname.slice(1) : null;
        if (vimeo && /^\d+$/.test(vimeo)) embed = 'https://player.vimeo.com/video/' + vimeo;
      } catch {
        /* URL inválida mantém referência. */
      }
    }
    return (
      <div className="media-card">
        <div className="card-grip padded">
          <GripVertical size={13} />
          <span>Mídia</span>
          {actions}
        </div>
        {url ? (
          card.content.mediaKind === 'audio' ? (
            <audio data-no-drag controls preload="none" src={url} />
          ) : (
            <video data-no-drag controls preload="metadata" src={url} />
          )
        ) : embed ? (
          activated ? (
            <iframe
              data-no-drag
              src={embed}
              title={card.content.title ?? 'Vídeo incorporado'}
              allow="fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation"
            />
          ) : (
            <button data-no-drag className="activate-embed" onClick={() => setActivated(true)}>
              <Video size={32} />
              <span>Carregar vídeo externo</span>
              <small>Conecta ao provedor somente ao clicar.</small>
            </button>
          )
        ) : (
          <a data-no-drag href={card.content.url} target="_blank" rel="noopener noreferrer">
            Abrir mídia original
          </a>
        )}
        <div className="image-caption">{caption}</div>
      </div>
    );
  }
  return (
    <div className="file-card">
      <div className="card-grip">
        <GripVertical size={13} />
        <span>Documento</span>
        {actions}
      </div>
      <File size={30} />
      <strong>{card.content.filename}</strong>
      <span>
        {((card.content.bytes ?? 0) / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}{' '}
        KB · {card.content.mime}
      </span>
      <div className="file-actions" data-no-drag>
        <button className="secondary-button" onClick={() => setPreview(true)}>
          Visualizar
        </button>
        <a className="icon-button" aria-label="Baixar arquivo" href={assetUrl(true)} download>
          <Download size={16} />
        </a>
      </div>
      {caption}
      <Dialog
        open={preview}
        onClose={() => setPreview(false)}
        title={card.content.filename ?? 'Documento'}
      >
        {card.content.mime === 'application/pdf' ? (
          <iframe className="document-preview" title="Prévia do PDF" src={assetUrl()} />
        ) : card.content.mime?.startsWith('text/') ? (
          <iframe className="document-preview" title="Prévia do texto" src={assetUrl()} />
        ) : (
          <div className="empty-state">
            <File size={36} />
            <p>Este formato está disponível para download.</p>
            <a className="primary-button" href={assetUrl(true)} download>
              Baixar arquivo
            </a>
          </div>
        )}
      </Dialog>
    </div>
  );
});
