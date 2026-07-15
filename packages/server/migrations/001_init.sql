-- Escape Plan — initial schema
-- Deterministic, seed-friendly relational model for leave config, holidays,
-- colleague availability, climate data, and sample plans.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  country_code  TEXT NOT NULL DEFAULT 'GB',
  weekend_days  INTEGER[] NOT NULL DEFAULT '{0,6}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_config (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allowance       NUMERIC NOT NULL,
  remaining       NUMERIC NOT NULL,
  carry_over      NUMERIC NOT NULL DEFAULT 0,
  reserve_days    NUMERIC NOT NULL DEFAULT 0,
  purchased_days  NUMERIC NOT NULL DEFAULT 0,
  sold_days       NUMERIC NOT NULL DEFAULT 0,
  allow_half_days BOOLEAN NOT NULL DEFAULT true,
  expiry_date     DATE
);

CREATE TABLE IF NOT EXISTS shutdowns (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  label      TEXT
);

CREATE TABLE IF NOT EXISTS mandatory_dates (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
  id           SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  region       TEXT,
  date         DATE NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'bank',
  year         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holidays_country_year ON holidays(country_code, year);

CREATE TABLE IF NOT EXISTS blackouts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  label      TEXT
);

CREATE TABLE IF NOT EXISTS school_holidays (
  id           SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  label        TEXT,
  year         INTEGER NOT NULL
);

-- Colleague / team availability (mock HR signal).
CREATE TABLE IF NOT EXISTS colleague_leave (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  colleague_name TEXT NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS team_settings (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  max_simultaneous   INTEGER NOT NULL DEFAULT 2,
  team_size          INTEGER NOT NULL DEFAULT 8
);

CREATE TABLE IF NOT EXISTS destinations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  country               TEXT NOT NULL,
  country_code          TEXT NOT NULL,
  domestic              BOOLEAN NOT NULL,
  flight_hours          NUMERIC NOT NULL DEFAULT 0,
  flight_cost           NUMERIC NOT NULL DEFAULT 0,
  accommodation_per_night NUMERIC NOT NULL DEFAULT 0,
  daily_spend           NUMERIC NOT NULL DEFAULT 0,
  trip_types            JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS climate (
  id             SERIAL PRIMARY KEY,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  month          INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  avg_temp_c     NUMERIC NOT NULL,
  rainfall_mm    NUMERIC NOT NULL,
  sunshine_hours NUMERIC NOT NULL,
  beach_score    NUMERIC NOT NULL,
  ski_score      NUMERIC NOT NULL,
  hazard         BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (destination_id, month)
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data    JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS budget (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency       TEXT NOT NULL DEFAULT 'GBP',
  holiday_fund   NUMERIC NOT NULL DEFAULT 0,
  monthly_savings NUMERIC NOT NULL DEFAULT 0,
  max_trip_budget NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS personal_dates (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    DATE NOT NULL,
  label   TEXT NOT NULL,
  kind    TEXT NOT NULL
);

-- Persisted sample plans produced by the deterministic engine.
CREATE TABLE IF NOT EXISTS plans (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  strategy   TEXT NOT NULL,
  score      NUMERIC NOT NULL,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
