/* ========================================================================
   Storage — persistence layer with Supabase and localStorage support
   ======================================================================== */

import { STORAGE_KEY, OLD_KEYS } from './constants';
import { supabase, isSupabaseConfigured } from './supabase';

// ---------- Low-level localStorage adapter ----------

async function get(key) {
  if (window.storage && typeof window.storage.get === 'function') {
    try {
      const res = await window.storage.get(key);
      return res?.value ?? null;
    } catch { return null; }
  }
  return localStorage.getItem(key);
}

async function set(key, value) {
  if (window.storage && typeof window.storage.set === 'function') {
    await window.storage.set(key, value);
    return;
  }
  localStorage.setItem(key, value);
}

// ---------- Active Team Code Helpers ----------

export function getActiveTeamCode() {
  return localStorage.getItem('lol-team-code') || '';
}

export function setActiveTeamCode(code) {
  if (code) {
    localStorage.setItem('lol-team-code', code);
  } else {
    localStorage.removeItem('lol-team-code');
  }
}

// ---------- Active Player Session Helpers ----------

export function getCurrentSessionPlayerId() {
  return localStorage.getItem('lol-session-player-id') || '';
}

export function setCurrentSessionPlayerId(id) {
  if (id) {
    localStorage.setItem('lol-session-player-id', id);
  } else {
    localStorage.removeItem('lol-session-player-id');
  }
}

// ---------- Default data ----------

function defaultCompositions() {
  return [
    {
      id: 'comp_default_1',
      name: 'Composición Poke & Acoso',
      team: 'azul',
      styles: ['Poke', 'Early'],
      slots: { top: 'Jayce', jg: 'Nidalee', mid: 'Zoe', adc: 'Ezreal', sup: 'Karma' },
      notes: 'Desgastar al enemigo antes de disputar los objetivos. Evitar peleas directas de 5v5 completas.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'comp_default_2',
      name: 'Composición Wombo Combo',
      team: 'rojo',
      styles: ['Teamfight', 'Late'],
      slots: { top: 'Malphite', jg: 'Amumu', mid: 'Orianna', adc: 'MissFortune', sup: 'Leona' },
      notes: 'Buscar peleas agrupados en dragón y barón. Esperar al iniciador para encadenar las habilidades definitivas.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'comp_default_3',
      name: 'Presión Dividida (Split Push 1-3-1)',
      team: 'azul',
      styles: ['Split', 'Late'],
      slots: { top: 'Jax', jg: 'Sejuani', mid: 'Ryze', adc: 'Sivir', sup: 'Lulu' },
      notes: 'El carrilero superior (Jax) empuja las líneas laterales. El resto defiende bajo torre o zonea la jungla.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'comp_default_4',
      name: 'Hipercarry Kog\'Maw (Proteger al ADC)',
      team: 'rojo',
      styles: ['Protect', 'Late'],
      slots: { top: 'Ornn', jg: 'Ivern', mid: 'Lulu', adc: 'KogMaw', sup: 'Janna' },
      notes: 'Proteger y dar escudos a Kog\'Maw. Él hace todo el daño mientras Ornn y Ivern absorben daño y crean espacio.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'comp_default_5',
      name: 'Composición Dive / Asalto',
      team: 'azul',
      styles: ['Dive', 'Engage'],
      slots: { top: 'Camille', jg: 'Nocturne', mid: 'Galio', adc: 'KaiSa', sup: 'Nautilus' },
      notes: 'Pelea explosiva. Entrar todos a la vez al carry enemigo cuando Nocturne inicie con su definitiva.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
}

function defaultDrafts() {
  return [
    {
      id: 'draft_default_1',
      name: 'Draft Scrim vs KR Team - Game 1',
      bluePicks: { top: 'Jayce', jg: 'Nidalee', mid: 'Zoe', adc: 'Ezreal', sup: 'Karma' },
      redPicks: { top: 'Ornn', jg: 'Ivern', mid: 'Lulu', adc: 'KogMaw', sup: 'Janna' },
      blueBans: ['Maokai', 'Rumble', 'Ashe', 'Kalista', 'Poppy'],
      redBans: ['Renekton', 'Nidalee', 'Taliyah', 'Varus', 'Caitlyn'],
      notes: 'Draft enfocado en desgastar su composición antes de pelear por objetivos neutrales.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    {
      id: 'draft_default_2',
      name: 'Draft Finals - Game 5',
      bluePicks: { top: 'Camille', jg: 'Nocturne', mid: 'Galio', adc: 'KaiSa', sup: 'Nautilus' },
      redPicks: { top: 'Malphite', jg: 'Amumu', mid: 'Orianna', adc: 'MissFortune', sup: 'Leona' },
      blueBans: ['KSante', 'Ahri', 'Varus', 'Bard', 'Lulu'],
      redBans: ['Jax', 'Vi', 'Sylas', 'Zeri', 'Alistar'],
      notes: 'Camille y Nocturne deben fijar a Miss Fortune. Galio apoya con la definitiva.',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  ];
}

function defaultData() {
  return {
    version: 3,
    players: [],
    comps: defaultCompositions(),
    drafts: defaultDrafts(),
    scrims: [],
    threshold: 5,
    settings: { language: 'es_ES' },
  };
}

// ---------- Migration ----------

function migrateV1(old) {
  const players = (old.players || []).map((p, idx) => ({
    id: p.id,
    name: p.name,
    team: idx % 2 === 0 ? 'azul' : 'rojo',
    role: 'mid',
    secondaryRole: '',
    avail: p.avail || {},
    pool: [],
  }));
  return {
    ...defaultData(),
    players,
    threshold: typeof old.threshold === 'number' ? old.threshold : 5,
  };
}

function migrateV2(old) {
  const players = (old.players || []).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team || 'azul',
    role: p.role || 'mid',
    secondaryRole: p.secondaryRole || '',
    avail: p.avail || {},
    pool: p.pool || [],
  }));
  return {
    ...defaultData(),
    players,
    threshold: typeof old.threshold === 'number' ? old.threshold : 5,
  };
}

// ---------- Password Hashing ----------

export async function hashPassword(password) {
  const msgUint8 = new TextEncoder().encode('lol-planner:' + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Supabase Sync Methods ----------

export async function createTeam(teamCode, teamName) {
  if (!isSupabaseConfigured) return false;

  const { data: existing } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamCode)
    .maybeSingle();

  if (existing) {
    throw new Error('El código de equipo ya está en uso');
  }

  const { error } = await supabase
    .from('teams')
    .insert([{ id: teamCode, name: teamName }]);

  if (error) {
    throw new Error('Error al crear el equipo: ' + error.message);
  }

  return true;
}

export async function loadTeamData(teamCode) {
  if (!isSupabaseConfigured || !teamCode) return null;

  const { data: teamInfo } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamCode)
    .maybeSingle();

  if (!teamInfo) return null;

  const [
    { data: dbPlayers },
    { data: dbComps },
    { data: dbDrafts },
    { data: dbScrims }
  ] = await Promise.all([
    supabase.from('players').select('*').eq('team_id', teamCode),
    supabase.from('comps').select('*').eq('team_id', teamCode),
    supabase.from('drafts').select('*').eq('team_id', teamCode),
    supabase.from('scrims').select('*').eq('team_id', teamCode)
  ]);

  const players = (dbPlayers || []).map(p => ({
    id: p.id,
    name: p.name,
    team: p.team,
    role: p.role,
    secondaryRole: p.secondary_role || '',
    avail: p.avail || {},
    pool: p.pool || [],
    password: p.password || ''
  }));

  const comps = (dbComps || []).map(c => ({
    id: c.id,
    name: c.name,
    team: c.team,
    styles: c.styles || [],
    slots: c.slots || {},
    notes: c.notes || ''
  }));

  const drafts = (dbDrafts || []).map(d => ({
    id: d.id,
    name: d.name,
    bluePicks: d.blue_picks || {},
    redPicks: d.red_picks || {},
    blueBans: d.blue_bans || ['', '', '', '', ''],
    redBans: d.red_bans || ['', '', '', '', ''],
    notes: d.notes || '',
    createdAt: Number(d.created_at)
  }));

  const scrims = (dbScrims || []).map(s => ({
    id: s.id,
    date: s.date,
    time: s.time,
    compAzul: s.comp_azul || '',
    compRojo: s.comp_rojo || '',
    winner: s.winner || '',
    rating: s.rating || 0,
    notes: s.notes || '',
    tags: s.tags || [],
    createdAt: Number(s.created_at)
  }));

  return {
    players,
    comps,
    drafts,
    scrims,
    teamName: teamInfo.name,
    threshold: typeof teamInfo.threshold === 'number' ? teamInfo.threshold : 5,
  };
}

export async function syncTeamData(teamCode, data) {
  if (!isSupabaseConfigured || !teamCode) return;

  // Sync team metadata (threshold)
  if (data.threshold !== undefined) {
    await supabase
      .from('teams')
      .update({ threshold: data.threshold })
      .eq('id', teamCode);
  }

  // Sync players
  if (data.players) {
    const { data: dbPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('team_id', teamCode);

    const dbIds = (dbPlayers || []).map(p => p.id);
    const newIds = data.players.map(p => p.id);
    const idsToDelete = dbIds.filter(id => !newIds.includes(id));

    if (idsToDelete.length > 0) {
      await supabase.from('players').delete().in('id', idsToDelete);
    }

    if (data.players.length > 0) {
      const rows = data.players.map(p => ({
        id: p.id,
        team_id: teamCode,
        name: p.name,
        team: p.team,
        role: p.role,
        secondary_role: p.secondaryRole || '',
        avail: p.avail || {},
        pool: p.pool || [],
        password: p.password || ''
      }));
      await supabase.from('players').upsert(rows);
    }
  }

  // Sync comps
  if (data.comps) {
    const { data: dbComps } = await supabase
      .from('comps')
      .select('id')
      .eq('team_id', teamCode);

    const dbIds = (dbComps || []).map(c => c.id);
    const newIds = data.comps.map(c => c.id);
    const idsToDelete = dbIds.filter(id => !newIds.includes(id));

    if (idsToDelete.length > 0) {
      await supabase.from('comps').delete().in('id', idsToDelete);
    }

    if (data.comps.length > 0) {
      const rows = data.comps.map(c => ({
        id: c.id,
        team_id: teamCode,
        name: c.name,
        team: c.team,
        styles: c.styles || [],
        slots: c.slots || {},
        notes: c.notes || ''
      }));
      await supabase.from('comps').upsert(rows);
    }
  }

  // Sync drafts
  if (data.drafts) {
    const { data: dbDrafts } = await supabase
      .from('drafts')
      .select('id')
      .eq('team_id', teamCode);

    const dbIds = (dbDrafts || []).map(d => d.id);
    const newIds = data.drafts.map(d => d.id);
    const idsToDelete = dbIds.filter(id => !newIds.includes(id));

    if (idsToDelete.length > 0) {
      await supabase.from('drafts').delete().in('id', idsToDelete);
    }

    if (data.drafts.length > 0) {
      const rows = data.drafts.map(d => ({
        id: d.id,
        team_id: teamCode,
        name: d.name,
        blue_picks: d.bluePicks || {},
        red_picks: d.redPicks || {},
        blue_bans: d.blueBans || ['', '', '', '', ''],
        red_bans: d.redBans || ['', '', '', '', ''],
        notes: d.notes || '',
        created_at: d.createdAt
      }));
      await supabase.from('drafts').upsert(rows);
    }
  }

  // Sync scrims
  if (data.scrims) {
    const { data: dbScrims } = await supabase
      .from('scrims')
      .select('id')
      .eq('team_id', teamCode);

    const dbIds = (dbScrims || []).map(s => s.id);
    const newIds = data.scrims.map(s => s.id);
    const idsToDelete = dbIds.filter(id => !newIds.includes(id));

    if (idsToDelete.length > 0) {
      await supabase.from('scrims').delete().in('id', idsToDelete);
    }

    if (data.scrims.length > 0) {
      const rows = data.scrims.map(s => ({
        id: s.id,
        team_id: teamCode,
        date: s.date,
        time: s.time,
        comp_azul: s.compAzul || '',
        comp_rojo: s.compRojo || '',
        winner: s.winner || '',
        rating: s.rating || 0,
        notes: s.notes || '',
        tags: s.tags || [],
        created_at: s.createdAt
      }));
      await supabase.from('scrims').upsert(rows);
    }
  }
}

// ---------- Public API ----------

export async function loadData() {
  const teamCode = getActiveTeamCode();
  if (isSupabaseConfigured && teamCode) {
    try {
      const dbData = await loadTeamData(teamCode);
      if (dbData) {
        return {
          version: 3,
          players: dbData.players,
          comps: dbData.comps,
          drafts: dbData.drafts,
          scrims: dbData.scrims,
          threshold: dbData.threshold ?? 5,
          teamName: dbData.teamName,
        };
      }
    } catch (err) {
      console.error('Failed to load data from Supabase, falling back to local storage', err);
    }
  }

  // Try current localStorage version
  try {
    const raw = await get(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.version === 3) {
        if (!data.comps || data.comps.length === 0) {
          data.comps = defaultCompositions();
        }
        if (!data.drafts || data.drafts.length === 0) {
          data.drafts = defaultDrafts();
        }
        return data;
      }
    }
  } catch { /* continue to legacy */ }

  // Try v2
  try {
    const raw = await get(OLD_KEYS[0]);
    if (raw) {
      const data = JSON.parse(raw);
      return migrateV2(data);
    }
  } catch { /* continue */ }

  // Try v1
  try {
    const raw = await get(OLD_KEYS[1]);
    if (raw) {
      const data = JSON.parse(raw);
      return migrateV1(data);
    }
  } catch { /* fresh start */ }

  return defaultData();
}

export async function saveData(data) {
  const teamCode = getActiveTeamCode();
  if (isSupabaseConfigured && teamCode) {
    try {
      await syncTeamData(teamCode, data);
    } catch (err) {
      console.error('Failed to sync data to Supabase', err);
    }
  }
  await set(STORAGE_KEY, JSON.stringify({ ...data, version: 3 }));
}

export function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lol-team-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data || !Array.isArray(data.players)) {
    throw new Error('Formato inválido: falta el array de jugadores');
  }
  return {
    ...defaultData(),
    ...data,
    version: 3,
    players: (data.players || []).map((p) => ({
      id: p.id || `p${Date.now()}${Math.random()}`,
      name: p.name || 'Sin nombre',
      team: p.team || 'azul',
      role: p.role || 'mid',
      secondaryRole: p.secondaryRole || '',
      avail: p.avail || {},
      pool: p.pool || [],
      password: p.password || '',
    })),
    comps: data.comps || [],
    drafts: data.drafts || [],
    scrims: data.scrims || [],
    threshold: typeof data.threshold === 'number' ? data.threshold : 5,
  };
}
