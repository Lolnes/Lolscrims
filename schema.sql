-- ============================================================
-- LoL Team Planner — Schema completo
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Idempotente: seguro correr en DB vacía o existente.
-- ============================================================

-- ============================================================
-- 1. USUARIOS GLOBALES
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,          -- "u_<uid>"
  name       TEXT NOT NULL,
  password   TEXT NOT NULL DEFAULT '',  -- SHA-256 hash
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_name_unique UNIQUE (name)
);

-- ============================================================
-- 2. EQUIPOS
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id         TEXT PRIMARY KEY,          -- código de equipo
  name       TEXT NOT NULL DEFAULT '',
  password   TEXT NOT NULL DEFAULT '',  -- SHA-256 hash (acceso legacy)
  threshold  INTEGER NOT NULL DEFAULT 5,
  captain_id TEXT REFERENCES users(id),
  is_public  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columnas agregadas por migraciones anteriores (seguro si ya existen)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS threshold  INTEGER NOT NULL DEFAULT 5;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS captain_id TEXT REFERENCES users(id);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_public  BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- 3. JUGADORES (tabla legacy — los equipos nuevos usan team_members)
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id             TEXT PRIMARY KEY,      -- "p_<uid>"
  team_id        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  team           TEXT NOT NULL DEFAULT 'azul',
  role           TEXT NOT NULL DEFAULT 'mid',
  secondary_role TEXT NOT NULL DEFAULT '',
  avail          JSONB NOT NULL DEFAULT '{}',
  pool           JSONB NOT NULL DEFAULT '[]',
  password       TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS password TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS players_team_id_idx ON players(team_id);

-- ============================================================
-- 4. MEMBRESÍAS DE EQUIPO
--    game_role: top | jg | mid | adc | sup
--    team_role: captain | player | substitute | coach | manager
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id             TEXT PRIMARY KEY,      -- "tm_<uid>"
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id        TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_role      TEXT NOT NULL DEFAULT 'mid',
  secondary_role TEXT NOT NULL DEFAULT '',
  team_role      TEXT NOT NULL DEFAULT 'player',
  avail          JSONB NOT NULL DEFAULT '{}',
  pool           JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members(user_id);

-- ============================================================
-- 5. SOLICITUDES DE UNIÓN
-- ============================================================
CREATE TABLE IF NOT EXISTS join_requests (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_role  TEXT NOT NULL DEFAULT 'mid',
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

CREATE INDEX IF NOT EXISTS join_requests_team_id_idx ON join_requests(team_id);
CREATE INDEX IF NOT EXISTS join_requests_user_id_idx ON join_requests(user_id);

-- ============================================================
-- 6. COMPOSICIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS comps (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  style      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  slots      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comps_team_id_idx ON comps(team_id);

-- ============================================================
-- 7. DRAFTS
-- ============================================================
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

-- ============================================================
-- 8. SCRIMS
-- ============================================================
CREATE TABLE IF NOT EXISTS scrims (
  id         TEXT PRIMARY KEY,
  team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  date       TEXT NOT NULL DEFAULT '',
  opponent   TEXT NOT NULL DEFAULT '',
  result     TEXT NOT NULL DEFAULT '',
  score      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  tags       JSONB NOT NULL DEFAULT '[]',
  games      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scrims_team_id_idx ON scrims(team_id);

-- ============================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE comps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrims        ENABLE ROW LEVEL SECURITY;

-- DROP + CREATE porque CREATE POLICY no soporta IF NOT EXISTS en PostgreSQL
DROP POLICY IF EXISTS "anon_all_users"          ON users;
DROP POLICY IF EXISTS "anon_all_teams"          ON teams;
DROP POLICY IF EXISTS "anon_all_players"        ON players;
DROP POLICY IF EXISTS "anon_all_team_members"   ON team_members;
DROP POLICY IF EXISTS "anon_all_join_requests"  ON join_requests;
DROP POLICY IF EXISTS "anon_all_comps"          ON comps;
DROP POLICY IF EXISTS "anon_all_drafts"         ON drafts;
DROP POLICY IF EXISTS "anon_all_scrims"         ON scrims;
DROP POLICY IF EXISTS "Allow public update teams" ON teams;

CREATE POLICY "anon_all_users"         ON users         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_teams"         ON teams         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_players"       ON players       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_team_members"  ON team_members  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_join_requests" ON join_requests FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_comps"         ON comps         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_drafts"        ON drafts        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scrims"        ON scrims        FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Listo. La app crea filas al primer guardado.
-- ============================================================
