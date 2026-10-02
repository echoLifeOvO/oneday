-- Applied explicitly by npm run db:migrate, never during a request or build.
CREATE TABLE places (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 100),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object' AND metadata->>'id' = id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diaries (
  id uuid PRIMARY KEY,
  request_hash text NOT NULL,
  place_id text NOT NULL REFERENCES places(id),
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 100),
  day_date date NOT NULL,
  time_zone text NOT NULL,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  cost numeric(11,2) NOT NULL CHECK (cost >= 0 AND cost <= 100000000),
  currency text NOT NULL CHECK (currency IN ('CNY','USD','EUR','JPY','GBP','HKD')),
  score smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hidden_at timestamptz
);

-- Publication time drives discovery, not the user-facing calendar date.
CREATE INDEX diaries_recent ON diaries (created_at DESC, id DESC) WHERE hidden_at IS NULL;
CREATE INDEX diaries_place_recent ON diaries (place_id, created_at DESC, id DESC) WHERE hidden_at IS NULL;

-- No accounts or author-role flag. Public reply writing is a separate next step.
CREATE TABLE comments (
  id uuid PRIMARY KEY,
  diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  hidden_at timestamptz
);
CREATE INDEX comments_diary_recent ON comments (diary_id, created_at, id) WHERE hidden_at IS NULL;
