ALTER TABLE board_members ADD COLUMN IF NOT EXISTS grant_id uuid REFERENCES share_links(id);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
