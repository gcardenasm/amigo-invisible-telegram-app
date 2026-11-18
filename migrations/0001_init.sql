-- Esquema inicial para Amigo Invisible en Cloudflare D1 (SQLite)

CREATE TABLE IF NOT EXISTS known_bot_users (
  telegram_user_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  bot_started INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  max_budget REAL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  reveal_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  organizer_tg_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  drawn_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_organizer ON rooms(organizer_tg_id);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  telegram_user_id INTEGER,
  telegram_username TEXT,
  display_name TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  bot_reachable INTEGER NOT NULL DEFAULT 0,
  is_organizer INTEGER NOT NULL DEFAULT 0,
  assigned_to_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
  notified_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(room_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_tg ON participants(telegram_user_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wishlist_participant ON wishlist_items(participant_id);

CREATE TABLE IF NOT EXISTS exclusions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  giver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  excluded_receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(room_id, giver_id, excluded_receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_exclusions_room ON exclusions(room_id);
