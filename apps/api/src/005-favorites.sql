CREATE TABLE IF NOT EXISTS board_favorites (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,board_id)
);
INSERT INTO schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
