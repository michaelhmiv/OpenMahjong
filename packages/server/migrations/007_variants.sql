ALTER TABLE games ADD COLUMN variant text NOT NULL DEFAULT 'riichi'
  CHECK (variant IN ('riichi','hong-kong','mcr','taiwanese'));
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_length_check;
ALTER TABLE games ADD CONSTRAINT games_length_check CHECK (length IN ('east','south','full'));
CREATE INDEX games_user_variant_finished ON games(user_id,variant,finished_at DESC);
