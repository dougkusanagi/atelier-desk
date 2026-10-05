import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hash, verify } from 'argon2';
import { z } from 'zod';
import type { Database } from './db';
import type { Config } from './config';
import { Documents } from './documents';
import {
  ApiError,
  boardRole,
  currentUser,
  hashToken,
  requireRole,
  token,
  uuid,
  verifyCsrf,
  type Role,
  type BoardRow,
} from './security';
import { sendMail } from './mail';
export type ShareGrant = {
  id: string;
  board_id: string;
  role: Role;
  include_descendants: boolean;
  allow_export: boolean;
  password_hash?: string;
  publication?: boolean;
};
export async function resolveShare(
  db: Database,
  rawToken: string,
  request?: FastifyRequest,
  reply?: FastifyReply,
  published = false,
): Promise<ShareGrant> {
  if (rawToken.length < 32 || rawToken.length > 256)
    throw new ApiError(404, 'LINK_INVALID', 'Link inválido.');
  if (published) {
    const result = await db.query<ShareGrant>(
      'SELECT board_id,board_id AS id,include_descendants,allow_export FROM publications WHERE token_hash=$1 AND enabled=true',
      [hashToken(rawToken)],
    );
    if (!result.rows[0]) throw new ApiError(404, 'LINK_INVALID', 'Publicação indisponível.');
    return { ...result.rows[0], role: 'viewer', publication: true };
  }
  const result = await db.query<ShareGrant>(
    'SELECT * FROM share_links WHERE token_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())',
    [hashToken(rawToken)],
  );
  const grant = result.rows[0];
  if (!grant) throw new ApiError(404, 'LINK_INVALID', 'Link expirado ou revogado.');
  if (grant.password_hash) {
    const name = 'atelier_share_' + grant.id.replaceAll('-', '').slice(0, 16);
    const cookie = request?.cookies[name],
      signed = cookie ? request?.unsignCookie(cookie) : null;
    if (!signed?.valid || signed.value !== grant.id) {
      const input =
        request?.headers['x-share-password'] ??
        (request?.body as { password?: string } | undefined)?.password;
      if (
        typeof input !== 'string' ||
        input.length > 128 ||
        !(await verify(grant.password_hash, input))
      )
        throw new ApiError(401, 'PASSWORD_REQUIRED', 'Informe a senha do quadro.');
      reply?.setCookie(name, grant.id, {
        signed: true,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 86400,
      });
    }
  }
  return grant;
}
export async function shareContains(db: Database, grant: ShareGrant, boardId: string) {
  if (grant.board_id === boardId) return true;
  if (!grant.include_descendants) return false;
  const result = await db.query<{ id: string }>(
    'WITH RECURSIVE tree AS (SELECT id FROM boards WHERE id=$1 AND deleted_at IS NULL UNION ALL SELECT b.id FROM boards b JOIN tree t ON b.parent_id=t.id WHERE b.deleted_at IS NULL AND b.inherit_access=true) SELECT id FROM tree WHERE id=$2',
    [grant.board_id, boardId],
  );
  return result.rows.length > 0;
}
export function registerSharing(
  app: FastifyInstance,
  db: Database,
  documents: Documents,
  settings: Config,
) {
  const owner = async (request: FastifyRequest) => {
    const user = await currentUser(db, request);
    if (request.method !== 'GET') verifyCsrf(user, request);
    const { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'owner');
    return { user, id, access };
  };
  app.get('/api/v1/boards/:id/shares', async (request) => {
    const { id, access } = await owner(request);
    const members = await db.query(
      "SELECT u.id AS user_id,u.display_name,u.email,m.role FROM board_members m JOIN users u ON u.id=m.user_id WHERE m.board_id=$1 UNION ALL SELECT u.id,u.display_name,u.email,'owner' AS role FROM users u WHERE u.id=$2",
      [id, access.board.owner_id],
    );
    const links = await db.query(
      'SELECT id,role,expires_at,include_descendants,allow_export,revoked_at FROM share_links WHERE board_id=$1 ORDER BY created_at DESC',
      [id],
    );
    const publication = await db.query('SELECT enabled FROM publications WHERE board_id=$1', [id]);
    return {
      members: members.rows,
      links: links.rows,
      published: Boolean(publication.rows[0]?.enabled),
    };
  });
  app.post('/api/v1/boards/:id/shares', async (request) => {
    const { id } = await owner(request);
    const input = z
      .object({
        role: z.enum(['viewer', 'editor', 'commenter']).default('viewer'),
        password: z.string().min(6).max(128).optional(),
        expiresAt: z.string().datetime().optional(),
        includeDescendants: z.boolean().default(false),
        allowExport: z.boolean().default(false),
      })
      .parse(request.body);
    const raw = token(),
      linkId = crypto.randomUUID();
    await db.query(
      'INSERT INTO share_links(id,board_id,token_hash,role,password_hash,expires_at,include_descendants,allow_export) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        linkId,
        id,
        hashToken(raw),
        input.role,
        input.password ? await hash(input.password) : null,
        input.expiresAt ?? null,
        input.includeDescendants,
        input.allowExport,
      ],
    );
    return { id: linkId, token: raw };
  });
  app.delete('/api/v1/boards/:id/shares/:linkId', async (request) => {
    const { id } = await owner(request),
      { linkId } = z.object({ linkId: uuid }).parse(request.params);
    await db.query('UPDATE share_links SET revoked_at=now() WHERE id=$1 AND board_id=$2', [
      linkId,
      id,
    ]);
    await db.query('DELETE FROM board_members WHERE board_id=$1 AND grant_id=$2', [id, linkId]);
    return { ok: true };
  });
  app.post('/api/v1/boards/:id/publication', async (request) => {
    const { id } = await owner(request),
      raw = token(),
      input = z
        .object({
          includeDescendants: z.boolean().default(false),
          allowExport: z.boolean().default(false),
        })
        .parse(request.body ?? {});
    await db.query(
      'INSERT INTO publications(board_id,token_hash,include_descendants,allow_export,enabled) VALUES($1,$2,$3,$4,true) ON CONFLICT(board_id) DO UPDATE SET token_hash=$2,include_descendants=$3,allow_export=$4,enabled=true',
      [id, hashToken(raw), input.includeDescendants, input.allowExport],
    );
    return { token: raw };
  });
  app.delete('/api/v1/boards/:id/publication', async (request) => {
    const { id } = await owner(request);
    await db.query('UPDATE publications SET enabled=false WHERE board_id=$1', [id]);
    return { ok: true };
  });
  const read = async (request: FastifyRequest, reply: FastifyReply, published: boolean) => {
    const { token: rawToken } = z
        .object({ token: z.string().min(32).max(256) })
        .parse(request.params),
      grant = await resolveShare(db, rawToken, request, reply, published);
    const { boardId = grant.board_id } = z
      .object({ boardId: uuid.optional() })
      .parse(request.query);
    if (!(await shareContains(db, grant, boardId)))
      throw new ApiError(404, 'NOT_FOUND', 'Quadro indisponível.');
    const board = await db.query<BoardRow>(
      'SELECT * FROM boards WHERE id=$1 AND deleted_at IS NULL',
      [boardId],
    );
    if (!board.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Quadro indisponível.');
    const state = await documents.snapshot(boardId);
    const safeCards = [];
    for (const card of state.cards) {
      let content = card.content;
      if (
        card.type === 'board' &&
        content.boardId &&
        !(await shareContains(db, grant, content.boardId))
      )
        content = { title: 'Quadro privado', owned: false };
      safeCards.push({ ...card, content });
    }
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return {
      board: {
        id: board.rows[0].id,
        title: board.rows[0].title,
        description: board.rows[0].description,
      },
      state: { ...state, cards: safeCards },
      role: grant.role,
      allowExport: grant.allow_export,
    };
  };
  app.get('/api/v1/shares/:token', async (request, reply) => read(request, reply, false));
  app.get('/api/v1/published/:token', async (request, reply) => read(request, reply, true));
  app.post('/api/v1/shares/:token/accept', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    if (!user.verified_at)
      throw new ApiError(
        403,
        'EMAIL_UNVERIFIED',
        'Confirme seu e-mail antes de aceitar um link de edição.',
      );
    const { token: rawToken } = z
        .object({ token: z.string().min(32).max(256) })
        .parse(request.params),
      grant = await resolveShare(db, rawToken, request);
    const board = await db.query<BoardRow>(
      'SELECT * FROM boards WHERE id=$1 AND deleted_at IS NULL',
      [grant.board_id],
    );
    if (!board.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Quadro indisponível.');
    await db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [board.rows[0].workspace_id, user.id, 'member'],
      );
      await tx.query(
        "INSERT INTO board_members(board_id,user_id,role,grant_id) VALUES($1,$2,$3,$4) ON CONFLICT(board_id,user_id) DO UPDATE SET role=$3,grant_id=$4 WHERE board_members.grant_id IS NOT NULL AND CASE board_members.role WHEN 'owner' THEN 3 WHEN 'editor' THEN 2 WHEN 'commenter' THEN 1 ELSE 0 END <= CASE EXCLUDED.role WHEN 'editor' THEN 2 WHEN 'commenter' THEN 1 ELSE 0 END",
        [grant.board_id, user.id, grant.role, grant.id],
      );
    });
    return { boardId: grant.board_id };
  });
  app.post('/api/v1/boards/:id/invitations', async (request) => {
    const { id, user, access } = await owner(request);
    if (!user.verified_at)
      throw new ApiError(403, 'EMAIL_UNVERIFIED', 'Confirme seu e-mail antes de enviar convites.');
    const input = z
        .object({
          email: z
            .string()
            .email()
            .transform((v) => v.toLowerCase()),
          role: z.enum(['editor', 'commenter', 'viewer']),
        })
        .parse(request.body),
      raw = token(),
      invitationId = crypto.randomUUID();
    await db.query(
      "INSERT INTO workspace_invitations(id,workspace_id,board_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days')",
      [invitationId, access.board.workspace_id, id, input.email, input.role, hashToken(raw)],
    );
    await sendMail(
      settings,
      input.email,
      user.display_name + ' convidou você para criar junto',
      'Você recebeu acesso ao quadro ' +
        access.board.title +
        '. Aceite em: ' +
        settings.origin +
        '/convite/' +
        raw,
    );
    return { ok: true };
  });
  app.post('/api/v1/invitations/:token/accept', async (request) => {
    const user = await currentUser(db, request);
    verifyCsrf(user, request);
    const { token: raw } = z.object({ token: z.string().min(32).max(256) }).parse(request.params);
    const result = await db.query<{
      id: string;
      workspace_id: string;
      board_id: string;
      role: string;
      email: string;
    }>(
      'SELECT * FROM workspace_invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL',
      [hashToken(raw)],
    );
    const invite = result.rows[0];
    if (!invite || invite.email !== user.email)
      throw new ApiError(404, 'INVITATION_INVALID', 'Convite indisponível para esta conta.');
    if (!user.verified_at)
      throw new ApiError(403, 'EMAIL_UNVERIFIED', 'Confirme seu e-mail antes de aceitar.');
    await db.transaction(async (tx) => {
      await tx.query(
        'INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [invite.workspace_id, user.id, 'member'],
      );
      await tx.query(
        'INSERT INTO board_members(board_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(board_id,user_id) DO UPDATE SET role=$3,grant_id=NULL',
        [invite.board_id, user.id, invite.role],
      );
      await tx.query('UPDATE workspace_invitations SET accepted_at=now() WHERE id=$1', [invite.id]);
    });
    return { boardId: invite.board_id };
  });
  app.delete('/api/v1/boards/:id/members/:userId', async (request) => {
    const { id, access } = await owner(request),
      { userId } = z.object({ userId: uuid }).parse(request.params);
    if (userId === access.board.owner_id)
      throw new ApiError(409, 'OWNER_REQUIRED', 'O proprietário não pode ser removido.');
    await db.query('DELETE FROM board_members WHERE board_id=$1 AND user_id=$2', [id, userId]);
    return { ok: true };
  });
  app.get('/api/v1/boards/:id/members', async (request) => {
    const user = await currentUser(db, request),
      { id } = z.object({ id: uuid }).parse(request.params),
      access = await boardRole(db, id, user.id);
    requireRole(access.role, 'commenter');
    const rows = await db.query<{ id: string; display_name: string }>(
      'SELECT u.id,u.display_name FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE m.workspace_id=$1',
      [access.board.workspace_id],
    );
    const items = [];
    for (const member of rows.rows) {
      try {
        await boardRole(db, id, member.id);
        items.push(member);
      } catch {
        /* Não divulgar membros sem acesso ao quadro. */
      }
    }
    return { items };
  });
}
