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
-- 10. FASE 2: Solicitudes de Scrim entre equipos
-- ============================================================
CREATE TABLE IF NOT EXISTS scrim_requests (
  id           TEXT PRIMARY KEY,
  from_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  to_team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  day          INTEGER NOT NULL,       -- 0=Lun … 6=Dom
  slot         INTEGER NOT NULL,       -- índice de franja (0..15, START_HOUR=10)
  duration     INTEGER NOT NULL DEFAULT 1,  -- cantidad de franjas (generalmente 2-3h)
  message      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|rejected|cancelled
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scrim_requests_from_idx ON scrim_requests(from_team_id);
CREATE INDEX IF NOT EXISTS scrim_requests_to_idx   ON scrim_requests(to_team_id);

ALTER TABLE scrim_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_scrim_requests" ON scrim_requests;
CREATE POLICY "anon_all_scrim_requests" ON scrim_requests FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- 11. FASE 3: LADDERS Y TRACKER DE PARTIDAS (SoloQ / Flex)
-- ============================================================

-- Columnas de Summoner en users
ALTER TABLE users ADD COLUMN IF NOT EXISTS summoner_name TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_privacy TEXT NOT NULL DEFAULT 'public'; -- public | private
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_tier TEXT NOT NULL DEFAULT 'UNRANKED';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_division TEXT NOT NULL DEFAULT 'IV';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_lp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_lp_value INTEGER NOT NULL DEFAULT 0;

-- Tabla de Ladders
CREATE TABLE IF NOT EXISTS ladders (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'soloq',      -- soloq | flex
  period      TEXT NOT NULL DEFAULT 'monthly',    -- weekly | monthly | season | custom
  start_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date    TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',     -- active | completed
  created_by  TEXT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de Equipos participantes en un Ladder
CREATE TABLE IF NOT EXISTS ladder_teams (
  id          TEXT PRIMARY KEY,
  ladder_id   TEXT NOT NULL REFERENCES ladders(id) ON DELETE CASCADE,
  team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ladder_teams_unique UNIQUE(ladder_id, team_id)
);

-- Tabla de Participantes individuales del Ladder
CREATE TABLE IF NOT EXISTS ladder_participants (
  id           TEXT PRIMARY KEY,
  ladder_id    TEXT NOT NULL REFERENCES ladders(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id      TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  start_lp     INTEGER NOT NULL DEFAULT 0,
  current_lp   INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ladder_participants_unique UNIQUE(ladder_id, user_id)
);

-- Tabla de Invitaciones de Ladder entre equipos
CREATE TABLE IF NOT EXISTS ladder_invites (
  id           TEXT PRIMARY KEY,
  ladder_id    TEXT NOT NULL REFERENCES ladders(id) ON DELETE CASCADE,
  from_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  to_team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | rejected | cancelled
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ladder_invites_unique UNIQUE(ladder_id, to_team_id)
);

-- Tabla de historial de partidas de invocador
CREATE TABLE IF NOT EXISTS summoner_games (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  champion        TEXT NOT NULL,
  role            TEXT NOT NULL,
  result          TEXT NOT NULL,                  -- win | loss
  kda_kills       INTEGER NOT NULL DEFAULT 0,
  kda_deaths      INTEGER NOT NULL DEFAULT 0,
  kda_assists     INTEGER NOT NULL DEFAULT 0,
  lp_change       INTEGER NOT NULL DEFAULT 0,
  played_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  players_matched JSONB DEFAULT '[]'              -- Array de { userId, summonerName, champion, sameTeam, result }
);

-- Habilitar RLS
ALTER TABLE ladders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder_teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE summoner_games      ENABLE ROW LEVEL SECURITY;

-- Crear políticas públicas anon
DROP POLICY IF EXISTS "anon_all_ladders"             ON ladders;
DROP POLICY IF EXISTS "anon_all_ladder_teams"        ON ladder_teams;
DROP POLICY IF EXISTS "anon_all_ladder_participants" ON ladder_participants;
DROP POLICY IF EXISTS "anon_all_ladder_invites"      ON ladder_invites;
DROP POLICY IF EXISTS "anon_all_summoner_games"      ON summoner_games;

CREATE POLICY "anon_all_ladders"             ON ladders             FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ladder_teams"        ON ladder_teams        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ladder_participants" ON ladder_participants FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ladder_invites"      ON ladder_invites      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_summoner_games"      ON summoner_games      FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Listo. La app crea filas al primer guardado.
-- ============================================================


