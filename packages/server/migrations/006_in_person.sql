CREATE TABLE in_person_sessions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  revision integer NOT NULL CHECK (revision > 0),
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX in_person_sessions_updated ON in_person_sessions(user_id, updated_at DESC);
CREATE TABLE in_person_writes (
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  mutation_id text NOT NULL,
  digest text NOT NULL,
  revision integer NOT NULL,
  PRIMARY KEY (user_id, session_id, mutation_id),
  FOREIGN KEY (user_id, session_id) REFERENCES in_person_sessions(user_id, id) ON DELETE CASCADE
);
