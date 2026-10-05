import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Layers, Loader2, LockKeyhole } from 'lucide-react';
import { BoardDocument, type BoardState } from '@atelier/domain';
import { api, RequestError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Canvas } from '../features/canvas/Canvas';
import { CardView } from '../components/CardView';
import { useCanvas } from '../features/canvas/state';
export function PublicPage({ published = false }: { published?: boolean }) {
  const { token } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    [password, setPassword] = useState(''),
    [attempt, setAttempt] = useState(''),
    [params] = useSearchParams();
  const boardId = params.get('quadro');
  const document = useMemo(() => new BoardDocument(), [token, boardId]);
  const query = useQuery({
    queryKey: ['public', token, attempt, boardId],
    queryFn: () =>
      api<{
        board: { id: string; title: string; description: string };
        state: BoardState;
        role: string;
        allowExport: boolean;
      }>(
        (published ? '/published/' : '/shares/') +
          token +
          (boardId ? '?boardId=' + encodeURIComponent(boardId) : ''),
        { headers: attempt ? { 'X-Share-Password': attempt } : {} },
      ),
    retry: false,
    refetchInterval: 2000,
  });
  useEffect(() => {
    const meta = document.doc.getMap('publicMeta');
    if (query.data) {
      const next = query.data.state;
      if (meta.get('version') === next.revision) return;
      document.replaceSnapshot(next);
      meta.set('version', next.revision);
    }
  }, [query.data, document]);
  useEffect(() => {
    useCanvas.getState().setCamera({ x: 48, y: 38, zoom: 0.85 });
    useCanvas.getState().setSelected([]);
    return () => document.destroy();
  }, [document]);
  const accept = async () => {
    if (!user) {
      navigate(
        '/entrar?voltar=' + encodeURIComponent(window.location.pathname + window.location.search),
      );
      return;
    }
    const result = await api<{ boardId: string }>('/shares/' + token + '/accept', {
      method: 'POST',
      body: JSON.stringify({ password: attempt }),
    });
    navigate('/quadro/' + result.boardId);
  };
  if (query.isPending)
    return (
      <div className="full-state">
        <Loader2 className="spinner" size={24} />
        <p>Abrindo quadro…</p>
      </div>
    );
  if (query.isError)
    return (
      <div className="full-state">
        <LockKeyhole size={32} />
        <h1>Este quadro está protegido.</h1>
        {query.error instanceof RequestError && query.error.code === 'PASSWORD_REQUIRED' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAttempt(password);
            }}
          >
            <label>
              Senha do quadro
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary-button">Abrir quadro</button>
          </form>
        ) : (
          <>
            <p>O link pode ter expirado ou sido revogado.</p>
            <Link to="/">Voltar ao Atelier</Link>
          </>
        )}
      </div>
    );
  const data = query.data!;
  return (
    <main className="public-page">
      <header className="board-header">
        <Link className="public-brand" to="/">
          <Layers size={20} />
          atelier.
        </Link>
        <strong>{data.board.title}</strong>
        <span>Somente leitura</span>
        {(data.role !== 'viewer' || data.allowExport) && (
          <button className="primary-button compact" onClick={() => void accept()}>
            Abrir na minha conta
            <ArrowUpRight size={15} />
          </button>
        )}
      </header>
      <div className="public-heading">
        <h1>{data.board.title}</h1>
        <p>{data.board.description}</p>
      </div>
      <Canvas
        board={document}
        readOnly
        renderCard={(card) => (
          <CardView
            card={card}
            board={document}
            boardId={data.board.id}
            readOnly
            onUpload={() => {}}
            shareToken={token}
            publicPath={(published ? '/publico/' : '/compartilhar/') + token}
          />
        )}
      />
    </main>
  );
}
export function InvitationPage() {
  const { token } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate(),
    [error, setError] = useState('');
  return (
    <div className="full-state">
      <Layers size={36} />
      <h1>Um novo espaço para criar junto.</h1>
      <p>Entre com o e-mail que recebeu o convite para aceitar o acesso.</p>
      {user ? (
        <button
          className="primary-button"
          onClick={() =>
            void api<{ boardId: string }>('/invitations/' + token + '/accept', { method: 'POST' })
              .then((result) => navigate(result.boardId ? '/quadro/' + result.boardId : '/'))
              .catch((error) => setError(error.message))
          }
        >
          Aceitar convite
        </button>
      ) : (
        <Link
          className="primary-button"
          to={'/entrar?voltar=' + encodeURIComponent('/convite/' + token)}
        >
          Entrar para aceitar
        </Link>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
