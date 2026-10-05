import type { FastifyInstance } from 'fastify';
import { hash, verify, argon2id } from 'argon2';
import { z } from 'zod';
import { templateState } from '@atelier/domain';
import type { Database } from './db';
import type { Config } from './config';
import { Documents } from './documents';
import { ApiError, currentUser, hashToken, token, verifyCsrf } from './security';
import { sendMail } from './mail';
export function registerAuth(
  app: FastifyInstance,
  db: Database,
  settings: Config,
  documents: Documents,
) {
  const setSession = async (userId: string, reply: import('fastify').FastifyReply) => {
    const raw = token(),
      csrf = token();
    await db.query(
      "INSERT INTO sessions(id,user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')",
      [crypto.randomUUID(), userId, hashToken(raw), csrf],
    );
    reply.setCookie('atelier_session', raw, {
      path: '/',
      httpOnly: true,
      secure: settings.production,
      sameSite: 'lax',
      maxAge: 30 * 86400,
    });
    return csrf;
  };
  const createToken = async (userId: string, purpose: 'verify' | 'reset') => {
    const raw = token();
    await db.query(
      "INSERT INTO auth_tokens(id,user_id,token_hash,purpose,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
      [crypto.randomUUID(), userId, hashToken(raw), purpose],
    );
    return raw;
  };
  app.post(
    '/api/v1/auth/register',
    { config: { rateLimit: { max: settings.production ? 5 : 50, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase().trim()),
          password: z.string().min(10).max(128),
          displayName: z.string().trim().min(2).max(80),
        })
        .parse(request.body);
      const existing = await db.query('SELECT id FROM users WHERE email=$1', [input.email]);
      if (existing.rows.length)
        throw new ApiError(
          409,
          'EMAIL_EXISTS',
          'Este e-mail já está cadastrado. Entre na sua conta.',
        );
      const userId = crypto.randomUUID(),
        workspaceId = crypto.randomUUID(),
        boardId = crypto.randomUUID(),
        unsortedId = crypto.randomUUID();
      const passwordHash = await hash(input.password, {
        type: argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      await db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)',
          [userId, input.email, passwordHash, input.displayName],
        );
        await tx.query('INSERT INTO workspaces(id,name,owner_id) VALUES($1,$2,$3)', [
          workspaceId,
          'Meu estúdio',
          userId,
        ]);
        await tx.query(
          'INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)',
          [workspaceId, userId, 'owner'],
        );
        await tx.query(
          'INSERT INTO boards(id,workspace_id,owner_id,title,description) VALUES($1,$2,$3,$4,$5)',
          [
            boardId,
            workspaceId,
            userId,
            'Campanha de primavera',
            'Referências, ideias e próximos passos. Tudo no seu lugar.',
          ],
        );
        await documents.create(tx, boardId, templateState('moodboard'));
        await tx.query(
          'INSERT INTO boards(id,workspace_id,owner_id,title,kind) VALUES($1,$2,$3,$4,$5)',
          [unsortedId, workspaceId, userId, 'Não organizados', 'unsorted'],
        );
        await documents.create(tx, unsortedId, { cards: [], connectors: [], revision: 0 });
      });
      const csrfToken = await setSession(userId, reply),
        verification = await createToken(userId, 'verify');
      await sendMail(
        settings,
        input.email,
        'Confirme seu e-mail — Atelier Desk',
        'Confirme seu e-mail: ' + settings.origin + '/verificar?token=' + verification,
      );
      return reply.code(201).send({
        user: { id: userId, email: input.email, displayName: input.displayName, verified: false },
        csrfToken,
        workspaceId,
        boardId,
      });
    },
  );
  app.post(
    '/api/v1/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((s) => s.toLowerCase().trim()),
          password: z.string().max(128),
        })
        .parse(request.body);
      const result = await db.query<{
        id: string;
        password_hash: string;
        display_name: string;
        verified_at: string | null;
      }>('SELECT * FROM users WHERE email=$1', [input.email]);
      const user = result.rows[0];
      if (!user || !(await verify(user.password_hash, input.password)))
        throw new ApiError(401, 'INVALID_LOGIN', 'E-mail ou senha incorretos.');
      const csrfToken = await setSession(user.id, reply);
      return {
        user: {
          id: user.id,
          email: input.email,
          displayName: user.display_name,
          verified: Boolean(user.verified_at),
        },
        csrfToken,
      };
    },
  );
  app.get('/api/v1/auth/me', async (request) => {
    const user = await currentUser(db, request);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        verified: Boolean(user.verified_at),
        preferences: user.preferences,
      },
      csrfToken: user.csrf_token,
    };
  });
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [
      hashToken(request.cookies.atelier_session!),
    ]);
    reply.clearCookie('atelier_session', { path: '/' });
    return { ok: true };
  });
  app.post('/api/v1/auth/verify-email', async (request) => {
    const input = z.object({ token: z.string().min(32).max(256) }).parse(request.body);
    return db.transaction(async (tx) => {
      const result = await tx.query<{ id: string; user_id: string }>(
        'SELECT * FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE',
        [hashToken(input.token), 'verify'],
      );
      if (!result.rows[0]) throw new ApiError(400, 'INVALID_TOKEN', 'Link inválido ou expirado.');
      await tx.query('UPDATE users SET verified_at=now() WHERE id=$1', [result.rows[0].user_id]);
      await tx.query('UPDATE auth_tokens SET consumed_at=now() WHERE id=$1', [result.rows[0].id]);
      return { ok: true };
    });
  });
  app.post('/api/v1/auth/forgot-password', async (request) => {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase().trim()),
      })
      .parse(request.body);
    const result = await db.query<{ id: string }>('SELECT id FROM users WHERE email=$1', [
      input.email,
    ]);
    if (result.rows[0]) {
      const raw = await createToken(result.rows[0].id, 'reset');
      await sendMail(
        settings,
        input.email,
        'Redefina sua senha — Atelier Desk',
        'Redefina sua senha: ' + settings.origin + '/redefinir?token=' + raw,
      );
    }
    return { ok: true, message: 'Se houver uma conta, enviaremos um link de recuperação.' };
  });
  app.post('/api/v1/auth/reset-password', async (request) => {
    const input = z
      .object({ token: z.string().min(32).max(256), password: z.string().min(10).max(128) })
      .parse(request.body);
    const passwordHash = await hash(input.password, { type: argon2id });
    return db.transaction(async (tx) => {
      const result = await tx.query<{ id: string; user_id: string }>(
        'SELECT * FROM auth_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE',
        [hashToken(input.token), 'reset'],
      );
      if (!result.rows[0]) throw new ApiError(400, 'INVALID_TOKEN', 'Link inválido ou expirado.');
      await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        result.rows[0].user_id,
        passwordHash,
      ]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [result.rows[0].user_id]);
      await tx.query('UPDATE auth_tokens SET consumed_at=now() WHERE id=$1', [result.rows[0].id]);
      return { ok: true };
    });
  });
}
