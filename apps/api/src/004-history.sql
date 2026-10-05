ALTER TABLE board_commands ADD COLUMN IF NOT EXISTS undo_record jsonb;
ALTER TABLE board_commands ADD COLUMN IF NOT EXISTS redo_record jsonb;
ALTER TABLE board_commands ADD COLUMN IF NOT EXISTS reverted_at timestamptz;
CREATE INDEX IF NOT EXISTS board_commands_actor_idx ON board_commands(board_id,actor_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
