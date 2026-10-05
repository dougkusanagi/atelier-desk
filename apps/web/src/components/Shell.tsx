import { BoardIcon } from './BoardIcon';
import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Folder,
  HelpCircle,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  Search,
  Sun,
  Trash2,
} from 'lucide-react';
import { api, RequestError, type BoardMeta, type Workspace } from '../lib/api';
import { cache } from '../lib/cache';
import { useAuth } from '../lib/auth';
type WorkspaceContext = {
  workspaceId: string;
  setWorkspaceId: (id: string) => void;
  boards: BoardMeta[];
  refresh: () => Promise<unknown>;
};
const Context = createContext<WorkspaceContext | null>(null);
export const useWorkspace = () => {
  const value = useContext(Context);
  if (!value) throw new Error('WorkspaceProvider necessário');
  return value;
};
export async function cachedApi<T>(url: string, key: string): Promise<T> {
  try {
    const data = await api<T>(url);
    await cache.put('metadata', key, data);
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    const data = await cache.get<T>('metadata', key);
    if (data) return data;
    throw error;
  }
}
export function Shell() {
  const { user, logout } = useAuth(),
    navigate = useNavigate(),
    location = useLocation();
  const [workspaceId, setWorkspaceId] = useState(''),
    [dark, setDark] = useState(localStorage.getItem('atelier-theme') === 'dark');
  const workspaces = useQuery({
    queryKey: ['workspaces', user!.id],
    queryFn: () => cachedApi<{ items: Workspace[] }>('/workspaces', user!.id + ':workspaces'),
  });
  const current = workspaceId || workspaces.data?.items[0]?.id || '';
  const boards = useQuery({
    queryKey: ['boards', current],
    enabled: Boolean(current),
    queryFn: () =>
      cachedApi<{ items: BoardMeta[] }>(
        '/boards?workspaceId=' + current,
        user!.id + ':boards:' + current,
      ),
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('atelier-theme', dark ? 'dark' : 'light');
  }, [dark]);
  const initials = user!.displayName
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
  return (
    <Context.Provider
      value={{
        workspaceId: current,
        setWorkspaceId,
        boards: boards.data?.items ?? [],
        refresh: () => boards.refetch(),
      }}
    >
      <div className="app-shell">
        <aside className="workspace-sidebar">
          <Link className="brand" to="/">
            <Layers size={23} />
            <span>
              atelier<span className="brand-dot">.</span>
            </span>
          </Link>
          <div className="workspace-button">
            <span className="workspace-avatar">
              {workspaces.data?.items.find((w) => w.id === current)?.name.slice(0, 1) ?? 'E'}
            </span>
            <select
              aria-label="Espaço de trabalho"
              value={current}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {workspaces.data?.items.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <nav aria-label="Navegação principal">
            <Link className={'nav-item ' + (location.pathname === '/' ? 'active' : '')} to="/">
              <LayoutDashboard size={17} />
              Meus quadros
              <span>{boards.data?.items.filter((b) => b.kind !== 'unsorted').length ?? 0}</span>
            </Link>
            <Link
              className={'nav-item ' + (location.pathname === '/nao-organizados' ? 'active' : '')}
              to="/nao-organizados"
            >
              <Folder size={17} />
              Não organizados
            </Link>
            <Link className="nav-item" to="/buscar">
              <Search size={17} />
              Pesquisar
            </Link>
            <Link className="nav-item" to="/notificacoes">
              <Bell size={17} />
              Notificações
            </Link>
          </nav>
          <div className="sidebar-section">
            <span>Recentes</span>
            {boards.data?.items
              .filter((b) => b.kind !== 'unsorted' && b.last_visited)
              .sort(
                (a, b) => new Date(b.last_visited!).getTime() - new Date(a.last_visited!).getTime(),
              )
              .slice(0, 7)
              .map((board) => (
                <Link
                  key={board.id}
                  className={
                    'board-nav ' + (location.pathname === '/quadro/' + board.id ? 'active' : '')
                  }
                  to={'/quadro/' + board.id}
                >
                  <span className="board-nav-icon">
                    <BoardIcon name={board.icon} size={14} />
                  </span>
                  <span>{board.title}</span>
                </Link>
              ))}
          </div>
          <div className="sidebar-note">
            <span className="mini-squares">
              <i />
              <i />
              <i />
            </span>
            <p>
              Um espaço para suas
              <br />
              próximas grandes ideias.
            </p>
          </div>
          <div className="sidebar-footer-actions">
            <Link title="Lixeira" aria-label="Lixeira" to="/lixeira">
              <Trash2 size={16} />
            </Link>
            <button
              title={dark ? 'Modo claro' : 'Modo escuro'}
              aria-label={dark ? 'Modo claro' : 'Modo escuro'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              title="Atalhos de teclado"
              aria-label="Atalhos de teclado"
              onClick={() => navigate('/ajuda')}
            >
              <HelpCircle size={16} />
            </button>
            <button
              title="Sair"
              aria-label="Sair"
              onClick={() => void logout().then(() => navigate('/entrar'))}
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="profile-button">
            <span className="profile-avatar">{initials}</span>
            <span>
              {user!.displayName}
              <small>
                {user!.verified ? 'E-mail confirmado' : 'Verificação de e-mail pendente'}
              </small>
            </span>
          </div>
        </aside>
        <main className="board-main">
          <Outlet />
        </main>
      </div>
    </Context.Provider>
  );
}
