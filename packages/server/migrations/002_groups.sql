-- Escape Plan — Phase 3: multi-user groups, invites, approvals, sharing.
-- Reversible: see 002_groups.down.sql.

CREATE TABLE IF NOT EXISTS groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('household', 'team')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'approver', 'member')),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_invites (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'approver', 'member')),
  token      TEXT UNIQUE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_group_invites_group ON group_invites(group_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  state      TEXT NOT NULL
             CHECK (state IN ('draft', 'requested', 'pending', 'approved', 'rejected')),
  reason     TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  history    JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_group ON leave_requests(group_id);

CREATE TABLE IF NOT EXISTS plan_shares (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL,
  owner_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id       TEXT REFERENCES groups(id) ON DELETE CASCADE,
  target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  level          TEXT NOT NULL CHECK (level IN ('view', 'coedit')),
  CHECK (group_id IS NOT NULL OR target_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_plan_shares_plan ON plan_shares(plan_id);

CREATE TABLE IF NOT EXISTS user_group_privacy (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  setting  TEXT NOT NULL CHECK (setting IN ('full', 'busy', 'private')),
  PRIMARY KEY (group_id, user_id)
);

-- Data migration: every EXISTING user (with no group yet) becomes the owner of
-- a personal "group of one" so no one loses access. Idempotent + reversible.
INSERT INTO groups (id, name, type)
SELECT 'g-user-' || u.id, u.name || '''s space', 'household'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO group_members (group_id, user_id, role)
SELECT 'g-user-' || u.id, u.id, 'owner'
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id)
ON CONFLICT (group_id, user_id) DO NOTHING;
