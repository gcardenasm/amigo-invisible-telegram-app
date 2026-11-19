ALTER TABLE rooms ADD COLUMN revealed_at TEXT;
ALTER TABLE rooms ADD COLUMN last_reminder_days INTEGER;

ALTER TABLE participants ADD COLUMN sizes TEXT NOT NULL DEFAULT '';
ALTER TABLE participants ADD COLUMN allergies TEXT NOT NULL DEFAULT '';
ALTER TABLE participants ADD COLUMN dislikes TEXT NOT NULL DEFAULT '';
ALTER TABLE participants ADD COLUMN gift_status TEXT NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS anonymous_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  giver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_anon_msg_pair
  ON anonymous_messages(room_id, giver_id, receiver_id, created_at);
