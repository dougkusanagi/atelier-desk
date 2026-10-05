import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RequestError, setCsrf, type User } from './api';
type Auth = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  setSession: (session: { user: User; csrfToken: string }) => void;
  logout: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const result = await api<{ user: User; csrfToken: string }>('/auth/me');
        setCsrf(result.csrfToken);
        localStorage.setItem('atelier-user', JSON.stringify(result.user));
        return result.user;
      } catch (error) {
        if (error instanceof RequestError && error.status === 401) return null;
        if (!navigator.onLine) {
          const cached = localStorage.getItem('atelier-user');
          return cached ? (JSON.parse(cached) as User) : null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  const value: Auth = {
    user: query.data ?? null,
    loading: query.isPending,
    refresh: () => client.invalidateQueries({ queryKey: ['session'] }),
    setSession: (session) => {
      setCsrf(session.csrfToken);
      localStorage.setItem('atelier-user', JSON.stringify(session.user));
      client.setQueryData(['session'], session.user);
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      localStorage.removeItem('atelier-user');
      setCsrf('');
      client.clear();
    },
  };
  if (query.isError)
    return (
      <div className="full-state">
        <h1>Não foi possível conectar</h1>
        <p>Verifique sua conexão e se a API está disponível.</p>
        <button className="primary-button" onClick={() => void query.refetch()}>
          Tentar novamente
        </button>
      </div>
    );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider necessário');
  return value;
}
