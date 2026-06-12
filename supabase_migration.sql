-- ============================================================
-- LoL Team Planner — Migration (ejecutar sobre el schema existente)
-- Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Agregar columna threshold a teams (para guardar el umbral de disponibilidad)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS threshold INTEGER NOT NULL DEFAULT 5;

-- 2. Agregar columna password a players (hash SHA-256 para login de jugadores)
ALTER TABLE players ADD COLUMN IF NOT EXISTS password TEXT NOT NULL DEFAULT '';

-- 3. Agregar policy de UPDATE para teams (sync de threshold falla sin esto)
CREATE POLICY "Allow public update teams"
  ON teams FOR UPDATE
  USING (true) WITH CHECK (true);

-- ============================================================
-- Verificación: las demás tablas ya tienen el esquema correcto.
-- comps  → tiene team, styles (jsonb), slots (jsonb), notes  ✓
-- drafts → tiene blue_picks, red_picks, blue_bans, red_bans, created_at (bigint) ✓
-- scrims → tiene time, comp_azul, comp_rojo, winner, rating, tags, created_at ✓
-- ============================================================
