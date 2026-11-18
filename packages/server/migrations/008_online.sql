CREATE TABLE online_players (
  id uuid PRIMARY KEY,
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  guest_hash text UNIQUE,
  expires_at timestamptz,
  recovery_hash text UNIQUE,
  csrf text NOT NULL
);
CREATE FUNCTION online_anonymize_player() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    NEW.name := 'Deleted player';
    NEW.guest_hash := NULL;
    NEW.recovery_hash := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER online_anonymize BEFORE UPDATE OF user_id ON online_players
  FOR EACH ROW EXECUTE FUNCTION online_anonymize_player();

CREATE TABLE online_rooms (
  id uuid PRIMARY KEY,
  host uuid REFERENCES online_players,
  origin text NOT NULL CHECK (origin IN ('custom','friendly','ranked')),
  pace text NOT NULL CHECK (pace IN ('live','correspondence')),
  variant text NOT NULL CHECK (variant IN ('riichi','hong-kong','mcr','taiwanese')),
  length text NOT NULL CHECK (length IN ('east','south','full') AND (variant <> 'riichi' OR length <> 'full')),
  state text NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','playing','finished','closed')),
  invite text UNIQUE, listed boolean NOT NULL DEFAULT false,
  parent uuid UNIQUE REFERENCES online_rooms,
  created_at timestamptz NOT NULL DEFAULT now(),
  journal jsonb, result jsonb, due_at timestamptz
);
CREATE INDEX online_rooms_due ON online_rooms(due_at) WHERE due_at IS NOT NULL;
CREATE INDEX online_rooms_waiting ON online_rooms(origin, variant, length, pace) WHERE state='waiting';
CREATE TABLE online_seats (
  room uuid REFERENCES online_rooms ON DELETE CASCADE,
  seat smallint CHECK (seat BETWEEN 0 AND 3),
  player uuid REFERENCES online_players,
  ready boolean NOT NULL DEFAULT false,
  live_busy boolean NOT NULL DEFAULT false,
  covered boolean NOT NULL DEFAULT false,
  bot_played boolean NOT NULL DEFAULT false,
  seen_at timestamptz NOT NULL DEFAULT now(),
  idle_at timestamptz,
  PRIMARY KEY(room, seat), UNIQUE(room, player)
);
CREATE UNIQUE INDEX online_one_live ON online_seats(player) WHERE live_busy;
CREATE INDEX online_membership ON online_seats(player);
CREATE TABLE online_receipts (
  room uuid REFERENCES online_rooms ON DELETE CASCADE,
  player uuid REFERENCES online_players, action_id uuid, revision integer NOT NULL,
  choice integer NOT NULL, PRIMARY KEY(room,player,action_id)
);
CREATE TABLE online_ratings (
  player uuid REFERENCES online_players, pool text, mu float8 NOT NULL, sigma float8 NOT NULL,
  PRIMARY KEY(player,pool)
);
CREATE TABLE online_rating_changes (
  room uuid REFERENCES online_rooms, player uuid REFERENCES online_players, pool text NOT NULL,
  before_rating integer NOT NULL, after_rating integer NOT NULL,
  PRIMARY KEY(room,player)
);
