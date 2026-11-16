-- Account settings sync (brief §4 A4): the client's Settings object,
-- stored verbatim as jsonb. Local settings remain the guest fallback.
CREATE TABLE IF NOT EXISTS settings (
  user_id    uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  settings   jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
