-- Native Apple sign-in (iOS brief, Open decision 3): Apple identities
-- live beside Google identities on the same users row shape. An Apple
-- account has no google_sub, so that column drops its NOT NULL; each
-- provider subject id stays independently UNIQUE (NULLs never
-- collide), and accounts are never merged across providers.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
