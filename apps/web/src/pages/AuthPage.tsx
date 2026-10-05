import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Layers, CheckCircle2 } from 'lucide-react';
import { api, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' | 'verify' }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const navigate = useNavigate(),
    auth = useAuth(),
    [params] = useSearchParams();
  const titles = {
    login: 'Seu espaço criativo está aqui.',
    register: 'Dê espaço às suas ideias.',
    forgot: 'Vamos recuperar seu acesso.',
    reset: 'Escolha uma nova senha.',
    verify: 'Confirme seu e-mail.',
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (mode === 'login' || mode === 'register') {
        const result = await api<{ user: User; csrfToken: string; boardId?: string }>(
          '/auth/' + (mode === 'register' ? 'register' : 'login'),
          {
            method: 'POST',
            body: JSON.stringify({
              email: form.get('email'),
              password: form.get('password'),
              displayName: form.get('name'),
            }),
          },
        );
        auth.setSession(result);
        const returnTo = params.get('voltar');
        navigate(
          returnTo?.startsWith('/') && !returnTo.startsWith('//')
            ? returnTo
            : result.boardId
              ? '/quadro/' + result.boardId
              : '/',
          { replace: true },
        );
      } else {
        await api(
          '/auth/' +
            (mode === 'forgot'
              ? 'forgot-password'
              : mode === 'reset'
                ? 'reset-password'
                : 'verify-email'),
          {
            method: 'POST',
            body: JSON.stringify({
              email: form.get('email'),
              password: form.get('password'),
              token: params.get('token'),
            }),
          },
        );
        setDone(true);
        if (mode === 'verify') await auth.refresh();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-art">
        <Link className="brand" to="/">
          <Layers size={25} />
          <span>
            atelier<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="auth-art-content">
          <h1>
            Ideias livres.
            <br />
            Projetos possíveis.
          </h1>
          <p>
            Um espaço para conectar referências,
            <br />
            organizar pensamentos e criar em conjunto.
          </p>
          <div className="auth-paper">
            <span>Uma ideia começa aqui</span>
            <p>
              Luz, textura, ritmo.
              <br />O começo de algo novo.
            </p>
          </div>
          <div className="auth-swatch" />
          <div className="auth-paper second">
            <span>Próximos passos</span>
            <p>
              Reunir referências
              <br />
              Explorar possibilidades
              <br />
              Compartilhar descobertas
            </p>
          </div>
        </div>
        <small>Um espaço original para o seu processo criativo.</small>
      </div>
      <section className="auth-form-container">
        <div className="auth-form">
          <Link className="brand mobile-brand" to="/">
            atelier.
          </Link>
          <h2>{titles[mode]}</h2>
          <p>
            {mode === 'register'
              ? 'Crie sua conta e comece com um quadro de inspiração.'
              : mode === 'login'
                ? 'Entre para continuar de onde você parou.'
                : 'Sua conta, com segurança e simplicidade.'}
          </p>
          {done ? (
            <div className="success-message">
              <CheckCircle2 size={32} />
              <p>
                {mode === 'forgot'
                  ? 'Se houver uma conta, enviaremos as instruções de recuperação.'
                  : mode === 'verify'
                    ? 'E-mail confirmado.'
                    : 'Sua senha foi atualizada.'}
              </p>
              <Link className="primary-button" to={mode === 'verify' ? '/' : '/entrar'}>
                Continuar
              </Link>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)}>
              {mode === 'register' && (
                <label>
                  Seu nome
                  <input
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Como podemos chamar você?"
                  />
                </label>
              )}
              {['login', 'register', 'forgot'].includes(mode) && (
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="voce@seuestudio.com"
                  />
                </label>
              )}
              {['login', 'register', 'reset'].includes(mode) && (
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'login' ? 1 : 10}
                    maxLength={128}
                    required
                    placeholder={mode === 'login' ? 'Sua senha' : 'Pelo menos 10 caracteres'}
                  />
                </label>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="primary-button" disabled={busy}>
                {busy
                  ? 'Aguarde…'
                  : mode === 'register'
                    ? 'Criar meu espaço'
                    : mode === 'login'
                      ? 'Entrar'
                      : mode === 'forgot'
                        ? 'Enviar instruções'
                        : mode === 'reset'
                          ? 'Salvar nova senha'
                          : 'Confirmar e-mail'}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {mode === 'login' && (
            <>
              <Link className="text-link" to="/recuperar">
                Esqueci minha senha
              </Link>
              <p className="auth-switch">
                Primeira vez por aqui? <Link to="/cadastro">Criar conta</Link>
              </p>
            </>
          )}
          {mode === 'register' && (
            <p className="auth-switch">
              Já tem um espaço? <Link to="/entrar">Entrar</Link>
            </p>
          )}
          {mode === 'forgot' && (
            <Link className="text-link" to="/entrar">
              Voltar para entrar
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
