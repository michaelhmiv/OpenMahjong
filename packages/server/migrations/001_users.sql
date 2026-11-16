-- Slice 2 accounts (brief §4 A2): the account record is minimal —
-- Google subject id, display name, avatar URL, created-at. No email.
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY,
  google_sub text NOT NULL UNIQUE,
  name       text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
