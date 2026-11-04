-- Cloudflare D1 schema for the Supabase replacement.
-- Run with: npx wrangler d1 execute friends-card-db --remote --file=cloudflare/migrations/0001_initial.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS friends_card (
  id TEXT PRIMARY KEY NOT NULL,
  name_ko TEXT NOT NULL DEFAULT '',
  name_ja TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  front_image_path TEXT NOT NULL DEFAULT '',
  back_image_path TEXT NOT NULL DEFAULT '',
  x_id TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  my_character TEXT NOT NULL DEFAULT '',
  character_owner TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_friends_card_created_at
  ON friends_card(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_friends_card_name_ko
  ON friends_card(name_ko);

CREATE INDEX IF NOT EXISTS idx_friends_card_name_ja
  ON friends_card(name_ja);

CREATE TABLE IF NOT EXISTS coord_credentials (
  coord_id TEXT PRIMARY KEY NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  FOREIGN KEY (coord_id) REFERENCES friends_card(id) ON DELETE CASCADE
);

-- General public site settings (never store secrets or passwords here).
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
