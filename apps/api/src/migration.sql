CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL,
 verified_at timestamptz, preferences jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, csrf_token text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('verify','reset')), expires_at timestamptz NOT NULL, consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS workspaces (
 id uuid PRIMARY KEY, name text NOT NULL, owner_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_members (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','admin','member')), PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS boards (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), owner_id uuid NOT NULL REFERENCES users(id),
 parent_id uuid REFERENCES boards(id), title text NOT NULL, icon text NOT NULL DEFAULT 'board',
 description text NOT NULL DEFAULT '', cover_asset uuid, inherit_access boolean NOT NULL DEFAULT true,
 kind text NOT NULL DEFAULT 'board' CHECK(kind IN ('board','unsorted')), favorite boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1, deleted_at timestamptz, deletion_batch uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_members (
 board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','editor','commenter','viewer')), PRIMARY KEY(board_id,user_id)
);
CREATE TABLE IF NOT EXISTS board_visits (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 camera jsonb, last_visited timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,board_id)
);
CREATE TABLE IF NOT EXISTS board_documents (
 board_id uuid PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE, epoch integer NOT NULL DEFAULT 1,
 snapshot bytea NOT NULL, sequence bigint NOT NULL DEFAULT 0, schema_version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_updates (
 id uuid PRIMARY KEY, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, epoch integer NOT NULL,
 sequence bigint NOT NULL, actor_id uuid REFERENCES users(id), bytes bytea NOT NULL, command_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(board_id,sequence)
);
CREATE TABLE IF NOT EXISTS board_commands (
 id uuid PRIMARY KEY, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, actor_id uuid REFERENCES users(id),
 label text NOT NULL, changes jsonb NOT NULL, undone boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS board_versions (
 id uuid PRIMARY KEY, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, sequence bigint NOT NULL,
 snapshot bytea NOT NULL, actor_id uuid REFERENCES users(id), description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), uploader_id uuid NOT NULL REFERENCES users(id),
 storage_key text NOT NULL, filename text NOT NULL, mime text NOT NULL, bytes bigint NOT NULL, hash text NOT NULL,
 width integer, height integer, duration numeric, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS asset_references (
 asset_id uuid NOT NULL REFERENCES assets(id), board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 card_id text NOT NULL, PRIMARY KEY(asset_id,board_id,card_id)
);
CREATE TABLE IF NOT EXISTS share_links (
 id uuid PRIMARY KEY, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE,
 role text NOT NULL CHECK(role IN ('viewer','editor','commenter')), password_hash text, expires_at timestamptz,
 include_descendants boolean NOT NULL DEFAULT false, allow_export boolean NOT NULL DEFAULT false,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS publications (
 board_id uuid PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE,
 include_descendants boolean NOT NULL DEFAULT false, allow_export boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS workspace_invitations (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id), board_id uuid REFERENCES boards(id),
 email text NOT NULL, role text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, accepted_at timestamptz
);
CREATE TABLE IF NOT EXISTS comment_threads (
 id uuid PRIMARY KEY, board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE, card_id text, anchor jsonb,
 resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
 id uuid PRIMARY KEY, thread_id uuid NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, mentions jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS mentions (
 comment_id uuid NOT NULL REFERENCES comments(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(comment_id,user_id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), actor_id uuid REFERENCES users(id),
 kind text NOT NULL, board_id uuid REFERENCES boards(id), entity_id uuid, message text NOT NULL,
 dedup_key text NOT NULL UNIQUE, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS templates (
 id uuid PRIMARY KEY, workspace_id uuid REFERENCES workspaces(id), owner_id uuid REFERENCES users(id),
 name text NOT NULL, category text NOT NULL, document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), board_id uuid REFERENCES boards(id),
 type text NOT NULL, status text NOT NULL, progress integer NOT NULL DEFAULT 0, output_key text,
 filename text, mime text, error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY, workspace_id uuid REFERENCES workspaces(id), actor_id uuid REFERENCES users(id),
 action text NOT NULL, entity_id text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_parent_idx ON boards(parent_id);
CREATE INDEX IF NOT EXISTS boards_workspace_idx ON boards(workspace_id,deleted_at);
CREATE INDEX IF NOT EXISTS board_updates_idx ON board_updates(board_id,sequence);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,read_at);
CREATE INDEX IF NOT EXISTS assets_workspace_idx ON assets(workspace_id);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
