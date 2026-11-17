-- In-progress game carry-over (Michael's ruling, 2026-11-16): a
-- signed-in player's unfinished game follows the account. One row per
-- user — the client's serialized SavedGame, stored verbatim as jsonb;
-- the server never interprets the decision log. client_saved_at is
-- the client's own save timestamp: at sign-in the newer of the local
-- and account copies wins. Finishing or abandoning the game deletes
-- the row.
CREATE TABLE IF NOT EXISTS in_progress_games (
  user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  state           jsonb NOT NULL,
  client_saved_at timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
