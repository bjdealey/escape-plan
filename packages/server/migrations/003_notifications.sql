-- Escape Plan — Phase 4: notifications (in-app feed, outbox, preferences).
-- Reversible: see 003_notifications.down.sql.

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at    TIMESTAMPTZ,
  dedup_key  TEXT UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id                TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email             TEXT,
  channel           TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  type              TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  link              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts          INTEGER NOT NULL DEFAULT 0,
  next_attempt_at   TIMESTAMPTZ NOT NULL,
  last_error        TEXT,
  dedup_key         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL,
  unsubscribe_token TEXT,
  UNIQUE (dedup_key, channel)
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON notification_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  muted       BOOLEAN NOT NULL DEFAULT false,
  quiet_start INTEGER,
  quiet_end   INTEGER,
  overrides   JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS notification_unsub_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
