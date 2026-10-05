import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, Link2, Loader2, Send, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useCanvas } from '../features/canvas/state';
export function SharePanel({ boardId }: { boardId: string }) {
  const [role, setRole] = useState('viewer'),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [descendants, setDescendants] = useState(false),
    [password, setPassword] = useState(''),
    [expiresAt, setExpiresAt] = useState(''),
    [allowExport, setAllowExport] = useState(false);
  const query = useQuery({
    queryKey: ['shares', boardId],
    queryFn: () =>
      api<{
        members: Array<{ user_id: string; display_name: string; email: string; role: string }>;
        links: Array<{ id: string; role: string; revoked_at: string | null }>;
        published: boolean;
      }>('/boards/' + boardId + '/shares'),
  });
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      await query.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao compartilhar');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="share-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void run(() =>
            api('/boards/' + boardId + '/invitations', {
              method: 'POST',
              body: JSON.stringify({ email: form.get('email'), role: form.get('role') }),
            }),
          );
        }}
      >
        <label>
          Convidar por e-mail
          <div className="inline-fields">
            <input name="email" type="email" required placeholder="pessoa@estudio.com" />
            <select name="role" aria-label="Permissão do convite">
              <option value="editor">Editar</option>
              <option value="commenter">Comentar</option>
              <option value="viewer">Visualizar</option>
            </select>
            <button className="primary-button compact" disabled={busy} aria-label="Enviar convite">
              <Send size={15} />
            </button>
          </div>
        </label>
      </form>
      {query.data?.members.map((member) => (
        <div className="member-row" key={member.user_id}>
          <span className="profile-avatar">{member.display_name[0]}</span>
          <div>
            <strong>{member.display_name}</strong>
            <small>{member.email}</small>
          </div>
          <span>
            {member.role === 'owner'
              ? 'Proprietário'
              : member.role === 'editor'
                ? 'Editor'
                : member.role === 'commenter'
                  ? 'Comentarista'
                  : 'Leitor'}
          </span>
          {member.role !== 'owner' && (
            <button
              className="icon-button"
              aria-label="Remover acesso"
              onClick={() =>
                void run(() =>
                  api('/boards/' + boardId + '/members/' + member.user_id, { method: 'DELETE' }),
                )
              }
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="panel-divider" />
      <h3>Link compartilhável</h3>
      <div className="inline-fields">
        <select
          aria-label="Permissão do link"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="viewer">Somente leitura</option>
          <option value="editor">Pode editar · exige conta</option>
          <option value="commenter">Pode comentar · exige conta</option>
        </select>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await api<{ token: string }>('/boards/' + boardId + '/shares', {
                method: 'POST',
                body: JSON.stringify({
                  role,
                  includeDescendants: descendants,
                  password: password || undefined,
                  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                  allowExport,
                }),
              });
              setUrl(window.location.origin + '/compartilhar/' + result.token);
            })
          }
        >
          <Link2 size={15} />
          Criar link
        </button>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={descendants}
          onChange={(e) => setDescendants(e.target.checked)}
        />
        Incluir quadros descendentes
      </label>
      <div className="inline-fields">
        <label>
          Senha opcional
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Validade opcional
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={allowExport}
          onChange={(e) => setAllowExport(e.target.checked)}
        />
        Permitir exportação
      </label>
      {role !== 'viewer' && (
        <p className="permission-note">
          Qualquer pessoa com o link e uma conta com e-mail confirmado poderá{' '}
          {role === 'editor' ? 'editar' : 'comentar'}.
        </p>
      )}
      {url && (
        <div className="copy-link">
          <input aria-label="Link criado" readOnly value={url} />
          <button
            aria-label="Copiar link"
            onClick={() =>
              void navigator.clipboard
                .writeText(url)
                .then(() => useCanvas.getState().notify('Link copiado'))
            }
          >
            <Copy size={16} />
          </button>
        </div>
      )}
      {query.data?.links
        .filter((link) => !link.revoked_at)
        .map((link) => (
          <div className="share-link-row" key={link.id}>
            <span>
              Link ·{' '}
              {link.role === 'viewer'
                ? 'visualizar'
                : link.role === 'editor'
                  ? 'editar'
                  : 'comentar'}
            </span>
            <button
              onClick={() =>
                void run(() =>
                  api('/boards/' + boardId + '/shares/' + link.id, { method: 'DELETE' }),
                )
              }
            >
              Revogar
            </button>
          </div>
        ))}
      <div className="panel-divider" />
      <h3>Publicação pública</h3>
      <p>Versão limpa e somente leitura. Comentários privados não são publicados.</p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            if (query.data?.published)
              await api('/boards/' + boardId + '/publication', { method: 'DELETE' });
            else {
              const result = await api<{ token: string }>('/boards/' + boardId + '/publication', {
                method: 'POST',
                body: JSON.stringify({ includeDescendants: descendants }),
              });
              setUrl(window.location.origin + '/publico/' + result.token);
            }
          })
        }
      >
        {query.data?.published ? 'Desativar publicação' : 'Publicar quadro'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {query.isError && <p className="form-error">Não foi possível carregar o compartilhamento.</p>}
    </div>
  );
}
type Thread = {
  id: string;
  card_id?: string;
  resolved: boolean;
  comments: Array<{
    id: string;
    author_id: string;
    display_name: string;
    body: string;
    created_at: string;
  }>;
};
export function CommentsPanel({
  boardId,
  cardId,
  role,
}: {
  boardId: string;
  cardId?: string;
  role: string;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [mention, setMention] = useState('');
  const query = useQuery({
    queryKey: ['comments', boardId],
    queryFn: () => api<{ items: Thread[] }>('/boards/' + boardId + '/comments'),
    refetchInterval: 3000,
  });
  const members = useQuery({
    queryKey: ['members', boardId],
    enabled: role !== 'viewer',
    queryFn: () =>
      api<{ items: Array<{ id: string; display_name: string }> }>(
        '/boards/' + boardId + '/members',
      ),
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      text = new FormData(form).get('body');
    setBusy(true);
    setError('');
    try {
      await api('/boards/' + boardId + '/comments', {
        method: 'POST',
        body: JSON.stringify({ body: text, cardId, mentions: mention ? [mention] : [] }),
      });
      form.reset();
      setMention('');
      await query.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao comentar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="comments-panel">
      {cardId && (
        <p className="permission-note">Seu comentário ficará ligado ao cartão selecionado.</p>
      )}
      {query.isPending ? (
        <p>Carregando comentários…</p>
      ) : query.data?.items.length ? (
        query.data.items.map((thread) => (
          <article
            className={'comment-thread ' + (thread.resolved ? 'resolved' : '')}
            key={thread.id}
          >
            {thread.card_id && <small>Comentário em cartão</small>}
            {thread.comments.map((comment) => (
              <div className="comment" key={comment.id}>
                <strong>{comment.display_name}</strong>
                <time>{new Date(comment.created_at).toLocaleString('pt-BR')}</time>
                <p>{comment.body}</p>
              </div>
            ))}
            {role !== 'viewer' && (
              <div className="thread-actions">
                <button
                  onClick={() =>
                    void api('/boards/' + boardId + '/comments/' + thread.id, {
                      method: 'PATCH',
                      body: JSON.stringify({ resolved: !thread.resolved }),
                    }).then(() => void query.refetch())
                  }
                >
                  <Check size={13} />
                  {thread.resolved ? 'Reabrir' : 'Resolver'}
                </button>
                <button
                  onClick={() => {
                    const body = window.prompt('Escreva sua resposta');
                    if (body)
                      void api('/boards/' + boardId + '/comments', {
                        method: 'POST',
                        body: JSON.stringify({ body, threadId: thread.id }),
                      }).then(() => void query.refetch());
                  }}
                >
                  Responder
                </button>
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty-state">
          <p>Uma conversa começa com uma observação.</p>
        </div>
      )}
      {role !== 'viewer' && (
        <form onSubmit={(e) => void submit(e)}>
          <label className="sr-only" htmlFor="comment-body">
            Novo comentário
          </label>
          <textarea
            id="comment-body"
            name="body"
            required
            maxLength={10000}
            placeholder="Compartilhe uma ideia ou observação…"
          />
          <div className="inline-fields">
            <select
              aria-label="Mencionar pessoa"
              value={mention}
              onChange={(e) => setMention(e.target.value)}
            >
              <option value="">@ Mencionar alguém</option>
              {members.data?.items.map((m) => (
                <option value={m.id} key={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <button className="primary-button compact" disabled={busy}>
              <Send size={14} />
              Comentar
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ExportPanel({ boardId, selected }: { boardId: string; selected: string[] }) {
  const [format, setFormat] = useState('png'),
    [scope, setScope] = useState('all'),
    [pdfLayout, setPdfLayout] = useState('whole'),
    [recursive, setRecursive] = useState(false),
    [background, setBackground] = useState('#F5F4F0'),
    [scale, setScale] = useState('1'),
    [job, setJob] = useState<string | null>(null),
    [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['job', job],
    enabled: Boolean(job),
    queryFn: () =>
      api<{ status: string; progress: number; error?: string; filename: string }>('/jobs/' + job),
    refetchInterval: (query) =>
      ['ready', 'failed', 'canceled'].includes(query.state.data?.status ?? '') ? false : 1000,
  });
  const create = async () => {
    setError('');
    try {
      const result = await api<{ id: string }>('/boards/' + boardId + '/exports', {
        method: 'POST',
        body: JSON.stringify({
          format,
          pdfLayout,
          includeDescendants:
            recursive && scope === 'all' && ['pdf', 'zip', 'markdown'].includes(format),
          background,
          scale: Number(scale),
          selection: scope === 'selected' ? selected : undefined,
        }),
      });
      setJob(result.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao exportar');
    }
  };
  return (
    <div className="export-panel">
      <label>
        Formato
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="png">PNG · imagem do quadro</option>
          <option value="png-zip">PNG em blocos · ZIP</option>
          <option value="pdf">PDF · documento visual</option>
          <option value="markdown">Markdown · conteúdo estruturado</option>
          <option value="zip">Markdown + arquivos · ZIP</option>
        </select>
      </label>
      <label>
        Conteúdo
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">Quadro inteiro</option>
          <option value="selected" disabled={!selected.length}>
            Itens selecionados ({selected.length})
          </option>
        </select>
      </label>
      {['png', 'png-zip'].includes(format) && (
        <label>
          Resolução
          <select value={scale} onChange={(e) => setScale(e.target.value)}>
            <option value="1">1×</option>
            <option value="2">2×</option>
          </select>
        </label>
      )}
      {format === 'pdf' && (
        <label>
          Páginas
          <select value={pdfLayout} onChange={(e) => setPdfLayout(e.target.value)}>
            <option value="whole">Uma página com o quadro inteiro</option>
            <option value="a4">A4 paisagem · várias páginas</option>
          </select>
        </label>
      )}
      {['png', 'png-zip', 'pdf'].includes(format) && (
        <label>
          Fundo
          <select value={background} onChange={(e) => setBackground(e.target.value)}>
            <option value="#F5F4F0">Papel</option>
            <option value="#FFFFFF">Branco</option>
            <option value="#191B1F">Escuro</option>
            {format !== 'pdf' && <option value="transparent">Transparente</option>}
          </select>
        </label>
      )}
      {['pdf', 'zip', 'markdown'].includes(format) && scope === 'all' && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={recursive}
            onChange={(e) => setRecursive(e.target.checked)}
          />
          Incluir descendentes acessíveis{format === 'markdown' && ' · entregue em ZIP'}
        </label>
      )}
      <p className="permission-note">
        PNG acima de 16.384px ou 100MP é entregue em blocos com um manifesto. Quadros muito grandes
        usam PDF paginado.
      </p>
      {job && query.data?.status === 'ready' ? (
        <a className="primary-button" href={'/api/v1/jobs/' + job + '/download'} download>
          <Download size={16} />
          Baixar {query.data.filename}
        </a>
      ) : (
        <button
          className="primary-button"
          onClick={() => void create()}
          disabled={
            Boolean(job) && ['queued', 'processing'].includes(query.data?.status ?? 'queued')
          }
        >
          {job && ['queued', 'processing'].includes(query.data?.status ?? 'queued') ? (
            <>
              <Loader2 size={16} className="spinner" />
              Preparando {query.data?.progress ?? 0}%
            </>
          ) : (
            <>
              <Download size={16} />
              Exportar
            </>
          )}
        </button>
      )}
      {job && query.data?.status === 'failed' && (
        <p className="form-error" role="alert">
          {query.data.error}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
