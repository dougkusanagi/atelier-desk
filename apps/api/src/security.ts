import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import type { Database } from './db';
export const uuid = z.string().uuid();
export const token = () => randomBytes(32).toString('base64url');
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type User = {
  id: string;
  email: string;
  display_name: string;
  verified_at: string | null;
  csrf_token: string;
  preferences: Record<string, unknown>;
};
export async function currentUser(db: Database, request: FastifyRequest): Promise<User> {
  const session = request.cookies.atelier_session;
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.');
  const { rows } = await db.query<User>(
    'SELECT u.id,u.email,u.display_name,u.verified_at,u.preferences,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [hashToken(session)],
  );
  if (!rows[0]) throw new ApiError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  return rows[0];
}
export function verifyCsrf(user: User, request: FastifyRequest) {
  const supplied = request.headers['x-csrf-token'];
  if (
    typeof supplied !== 'string' ||
    supplied.length !== user.csrf_token.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(user.csrf_token))
  )
    throw new ApiError(403, 'CSRF_INVALID', 'Atualize a página e tente novamente.');
}
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer';
export type BoardRow = {
  id: string;
  workspace_id: string;
  owner_id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  description: string;
  cover_asset: string | null;
  inherit_access: boolean;
  kind: string;
  favorite: boolean;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
const rank: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
export async function boardRole(
  db: Database,
  boardId: string,
  userId: string,
  includeDeleted = false,
): Promise<{ board: BoardRow; role: Role }> {
  if (!uuid.safeParse(boardId).success)
    throw new ApiError(404, 'NOT_FOUND', 'Quadro não encontrado.');
  const { rows } = await db.query<BoardRow>('SELECT * FROM boards WHERE id=$1', [boardId]);
  const board = rows[0];
  if (!board || (!includeDeleted && board.deleted_at))
    throw new ApiError(404, 'NOT_FOUND', 'Quadro não encontrado.');
  if (board.owner_id === userId) return { board, role: 'owner' };
  const workspace = await db.query<{ role: string }>(
    'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
    [board.workspace_id, userId],
  );
  if (['owner', 'admin'].includes(workspace.rows[0]?.role)) return { board, role: 'owner' };
  const member = await db.query<{ role: Role }>(
    'SELECT m.role FROM board_members m LEFT JOIN share_links s ON s.id=m.grant_id WHERE m.board_id=$1 AND m.user_id=$2 AND (m.grant_id IS NULL OR (s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())))',
    [boardId, userId],
  );
  if (member.rows[0]) return { board, role: member.rows[0].role };
  if (board.parent_id && board.inherit_access) {
    try {
      const inherited = await boardRole(db, board.parent_id, userId, includeDeleted);
      return { board, role: inherited.role === 'owner' ? 'editor' : inherited.role };
    } catch {
      /* Nenhuma permissão herdada. */
    }
  }
  throw new ApiError(404, 'NOT_FOUND', 'Quadro não encontrado.');
}
export function requireRole(actual: Role, minimum: Role) {
  if (rank[actual] < rank[minimum])
    throw new ApiError(403, 'FORBIDDEN', 'Você não tem permissão para esta ação.');
}
export async function requireExport(db: Database, boardId: string, userId: string) {
  const access = await boardRole(db, boardId, userId);
  if (access.role === 'owner') return access;
  let board = access.board;
  for (let depth = 0; depth < 50; depth++) {
    if (board.owner_id === userId) return access;
    const member = await db.query<{ grant_id: string | null; allow_export: boolean | null }>(
      'SELECT m.grant_id,s.allow_export FROM board_members m LEFT JOIN share_links s ON s.id=m.grant_id WHERE m.board_id=$1 AND m.user_id=$2',
      [board.id, userId],
    );
    if (member.rows[0]) {
      if (!member.rows[0].grant_id || member.rows[0].allow_export) return access;
      throw new ApiError(
        403,
        'EXPORT_FORBIDDEN',
        'O proprietário desativou a exportação deste link.',
      );
    }
    if (!board.parent_id || !board.inherit_access) break;
    board = (await boardRole(db, board.parent_id, userId)).board;
  }
  throw new ApiError(403, 'EXPORT_FORBIDDEN', 'Exportação indisponível para este acesso.');
}
