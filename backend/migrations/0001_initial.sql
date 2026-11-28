CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  white_secret TEXT NOT NULL,
  black_secret TEXT,
  fen TEXT NOT NULL,
  positions TEXT NOT NULL DEFAULT '{}',
  last_move TEXT,
  outcome TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rooms_expiry ON rooms(expires_at);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  name TEXT NOT NULL,
  fen TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  last_mate_ms INTEGER NOT NULL DEFAULT 0,
  deadline INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ranked_runs ON runs(score DESC, last_mate_ms, id, deadline, name) WHERE score > 0;
CREATE INDEX empty_runs_expiry ON runs(deadline) WHERE score = 0;
