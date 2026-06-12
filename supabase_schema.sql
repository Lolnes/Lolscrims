-- ============================================================
-- LoL Team Planner — Supabase Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,          -- team code (e.g. "ABC123")
  name        TEXT NOT NULL DEFAULT '',
  password    TEXT NOT NULL DEFAULT '',  -- SHA-256 hash of team password
  threshold   INTEGER NOT NULL DEFAULT 5,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PLAYERS
CREATE TABLE IF NOT EXISTS players (
  id             TEXT PRIMARY KEY,       -- "p_<uid>"
  team_id        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  team           TEXT NOT NULL DEFAULT 'azul',  -- 'azul' | 'rojo'
  role           TEXT NOT NULL DEFAULT 'mid',
  secondary_role TEXT NOT NULL DEFAULT '',
  avail          JSONB NOT NULL DEFAULT '{}',   -- { "Lun_0": true, ... }
  pool           JSONB NOT NULL DEFAULT '[]',   -- [{ id, comfort, isPocket }]
  password       TEXT NOT NULL DEFAULT '',      -- SHA-256 hash
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS players_team_id_idx ON players(team_id);

-- 3. COMPS
CREATE TABLE IF NOT EXISTS comps (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  style      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  slots      JSONB NOT NULL DEFAULT '[]',   -- [{ role, champion, notes }]
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comps_team_id_idx ON comps(team_id);

-- 4. DRAFTS
CREATE TABLE IF NOT EXISTS drafts (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  blue_bans  JSONB NOT NULL DEFAULT '[]',
  red_bans   JSONB NOT NULL DEFAULT '[]',
  blue_picks JSONB NOT NULL DEFAULT '[]',
  red_picks  JSONB NOT NULL DEFAULT '[]',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drafts_team_id_idx ON drafts(team_id);

-- 5. SCRIMS
CREATE TABLE IF NOT EXISTS scrims (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  date        TEXT NOT NULL DEFAULT '',   -- ISO date string
  opponent    TEXT NOT NULL DEFAULT '',
  result      TEXT NOT NULL DEFAULT '',  -- 'win' | 'loss' | 'draw' | ''
  score       TEXT NOT NULL DEFAULT '',  -- e.g. "2-1"
  notes       TEXT NOT NULL DEFAULT '',
  tags        JSONB NOT NULL DEFAULT '[]',
  games       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scrims_team_id_idx ON scrims(team_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE comps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrims  ENABLE ROW LEVEL SECURITY;

-- Allow full access via anon key (the app validates team password in JS).
-- For a production setup, move password validation to a DB function or Edge Function.

CREATE POLICY IF NOT EXISTS "anon_all_teams"   ON teams   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "anon_all_players" ON players FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "anon_all_comps"   ON comps   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "anon_all_drafts"  ON drafts  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "anon_all_scrims"  ON scrims  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Done. No sample data — the app creates rows on first save.
-- ============================================================
