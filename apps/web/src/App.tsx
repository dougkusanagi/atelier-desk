import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Check, Loader2, X } from 'lucide-react';
import { useAuth } from './lib/auth';
import { Shell } from './components/Shell';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
const BoardPage = lazy(() => import('./pages/BoardPage').then((m) => ({ default: m.BoardPage })));
import { SearchPage, TrashPage, NotificationsPage, HelpPage } from './pages/UtilityPages';
const PublicPage = lazy(() =>
  import('./pages/PublicPage').then((m) => ({ default: m.PublicPage })),
);
const InvitationPage = lazy(() =>
  import('./pages/PublicPage').then((m) => ({ default: m.InvitationPage })),
);
import { useCanvas } from './features/canvas/state';
function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="full-state">
        <Loader2 className="spinner" size={24} />
        <p>Abrindo seu espaço…</p>
      </div>
    );
  return user ? <Shell /> : <Navigate to="/entrar" replace />;
}
export default function App() {
  const navigate = useNavigate(),
    toast = useCanvas((s) => s.toast),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => useCanvas.setState({ toast: null });
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(close, 8000);
  };
  useEffect(() => {
    if (toast) schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.isComposing) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k' &&
        !target.closest('[contenteditable="true"]')
      ) {
        event.preventDefault();
        navigate('/buscar');
      }
      if (event.key === '?' && !target.closest('input,textarea,[contenteditable]'))
        navigate('/ajuda');
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [navigate]);
  return (
    <>
      <Suspense
        fallback={
          <div className="full-state">
            <Loader2 className="spinner" size={24} />
            <p>Abrindo seu espaço…</p>
          </div>
        }
      >
        <Routes>
          <Route path="/entrar" element={<AuthPage mode="login" />} />
          <Route path="/cadastro" element={<AuthPage mode="register" />} />
          <Route path="/recuperar" element={<AuthPage mode="forgot" />} />
          <Route path="/redefinir" element={<AuthPage mode="reset" />} />
          <Route path="/verificar" element={<AuthPage mode="verify" />} />
          <Route path="/compartilhar/:token" element={<PublicPage />} />
          <Route path="/publico/:token" element={<PublicPage published />} />
          <Route path="/convite/:token" element={<InvitationPage />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/quadro/:id" element={<BoardPage />} />
            <Route path="/nao-organizados" element={<BoardPage unsorted />} />
            <Route path="/buscar" element={<SearchPage />} />
            <Route path="/lixeira" element={<TrashPage />} />
            <Route path="/notificacoes" element={<NotificationsPage />} />
            <Route path="/ajuda" element={<HelpPage />} />
          </Route>
          <Route
            path="*"
            element={
              <div className="full-state">
                <h1>Este caminho não existe.</h1>
                <button className="primary-button" onClick={() => navigate('/')}>
                  Voltar aos quadros
                </button>
              </div>
            }
          />
        </Routes>
      </Suspense>
      {toast && (
        <div
          className="toast"
          role="status"
          onMouseEnter={() => {
            if (timer.current) clearTimeout(timer.current);
          }}
          onMouseLeave={schedule}
          onFocus={() => {
            if (timer.current) clearTimeout(timer.current);
          }}
          onBlur={schedule}
        >
          <Check size={16} />
          <span>{toast}</span>
          {toast.includes('Desfazer') && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('atelier-undo'));
                close();
              }}
            >
              Desfazer
            </button>
          )}
          <button className="toast-close" aria-label="Fechar aviso" onClick={close}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
