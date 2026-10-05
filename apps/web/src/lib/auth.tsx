import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, RequestError, setCsrf, type User } from './api';
import { Dialog } from '../components/Dialog';
import { cache } from './cache';
import { flushAccount, stopAccount } from './sessionLifecycle';
import { accountHasPending, downloadRecovery } from './recovery';
type Auth = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  setSession: (session: { user: User; csrfToken: string }) => void;
  logout: () => Promise<boolean>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false),
    [cleaning, setCleaning] = useState(false),
    [recovery, setRecovery] = useState(false),
    [recovering, setRecovering] = useState(false),
    [recoveryError, setRecoveryError] = useState('');
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
        if (!navigator.onLine || !(error instanceof RequestError)) {
          const cached = localStorage.getItem('atelier-user');
          return cached ? (JSON.parse(cached) as User) : null;
        }
        throw error;
      }
    },
    retry: (count, error) => !(error instanceof RequestError) && navigator.onLine && count < 2,
    retryDelay: 700,
    staleTime: 60_000,
  });
  useEffect(() => {
    const online = () => void query.refetch();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [query.refetch]);
  const value: Auth = {
    user: query.data ?? null,
    loading: query.isPending || cleaning,
    refresh: () => client.invalidateQueries({ queryKey: ['session'] }),
    setSession: (session) => {
      setCsrf(session.csrfToken);
      localStorage.setItem('atelier-user', JSON.stringify(session.user));
      client.setQueryData(['session'], session.user);
    },
    logout: async () => {
      const userId = query.data?.id;
      if (!userId || loggingOut) return false;
      setLoggingOut(true);
      try {
        await flushAccount(userId);
        if (await accountHasPending(userId)) {
          setRecovery(true);
          return false;
        }
        await api('/auth/logout', { method: 'POST' });
        setCleaning(true);
        try {
          await stopAccount(userId);
          await client.cancelQueries();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await cache.clearUser(userId);
          setRecovery(false);
          return true;
        } finally {
          localStorage.removeItem('atelier-user');
          setCsrf('');
          client.clear();
          client.setQueryData(['session'], null);
          setCleaning(false);
        }
      } finally {
        setLoggingOut(false);
      }
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
  return (
    <Context.Provider value={value}>
      {children}
      <Dialog
        open={loggingOut || recovery}
        onClose={() => {
          if (!loggingOut && !recovering) setRecovery(false);
        }}
        title={loggingOut ? 'Saindo da conta…' : 'Preserve seu trabalho antes de sair'}
      >
        {loggingOut ? (
          <p>Confirmando o salvamento e limpando os dados deste dispositivo.</p>
        ) : (
          <>
            <p>
              Há alterações ou arquivos que ainda não chegaram ao servidor. Conecte-se para salvar
              ou baixe uma cópia local. Sua conta permanecerá aberta para preservar esse trabalho.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={recovering}
                onClick={() => setRecovery(false)}
              >
                Continuar no Atelier
              </button>
              <button
                className="primary-button"
                disabled={recovering}
                onClick={() => {
                  setRecovering(true);
                  setRecoveryError('');
                  void downloadRecovery(query.data!.id)
                    .catch(() =>
                      setRecoveryError(
                        'Não foi possível baixar a cópia. Mantenha a conta aberta e tente novamente.',
                      ),
                    )
                    .finally(() => setRecovering(false));
                }}
              >
                {recovering ? 'Preparando cópia…' : 'Baixar cópia local'}
              </button>
            </div>
            {recoveryError && <p role="alert">{recoveryError}</p>}
          </>
        )}
      </Dialog>
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider necessário');
  return value;
}
