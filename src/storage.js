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

// ---------- uid helper ----------

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

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
    { data: dbMembers },
    { data: dbComps },
    { data: dbDrafts },
    { data: dbScrims }
  ] = await Promise.all([
    supabase.from('team_members').select('*, users(name)').eq('team_id', teamCode),
    supabase.from('comps').select('*').eq('team_id', teamCode),
    supabase.from('drafts').select('*').eq('team_id', teamCode),
    supabase.from('scrims').select('*').eq('team_id', teamCode)
  ]);

  const players = (dbMembers || []).map(m => ({
    id: m.id,
    userId: m.user_id,
    name: m.users?.name || '?',
    role: m.game_role || 'mid',
    secondaryRole: m.secondary_role || '',
    teamRole: m.team_role || 'player',
    avail: m.avail || {},
    pool: m.pool || [],
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

  // Sync team_members (avail + pool + role per member, no bulk replace)
  if (data.players) {
    for (const p of data.players) {
      if (!p.id) continue;
      await supabase.from('team_members')
        .update({
          avail: p.avail || {},
          pool: p.pool || [],
          game_role: p.role || 'mid',
          secondary_role: p.secondaryRole || '',
        })
        .eq('id', p.id);
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

// ═══════════════════════════════════════════════════════════
// GLOBAL USER AUTH
// ═══════════════════════════════════════════════════════════

export function getCurrentUserId() {
  return localStorage.getItem('lol-user-id') || '';
}

export function setCurrentUserIdStorage(id) {
  if (id) localStorage.setItem('lol-user-id', id);
  else localStorage.removeItem('lol-user-id');
}

export function getCurrentUserNameStorage() {
  return localStorage.getItem('lol-user-name') || '';
}

export function setCurrentUserNameStorage(name) {
  if (name) localStorage.setItem('lol-user-name', name);
  else localStorage.removeItem('lol-user-name');
}

export async function registerUser(name, password) {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado');
  const trimmed = name.trim();
  if (!trimmed) throw new Error('El nombre no puede estar vacío');

  const { data: existing } = await supabase
    .from('users').select('id').ilike('name', trimmed).maybeSingle();
  if (existing) throw new Error('Ya existe una cuenta con ese nombre de invocador');

  const hashed = await hashPassword(password);
  const id = `u_${uid()}`;
  const { error } = await supabase.from('users').insert([{ id, name: trimmed, password: hashed }]);
  if (error) throw new Error('Error al crear cuenta: ' + error.message);
  return { id, name: trimmed };
}

export async function loginUser(name, password) {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado');

  const { data: user } = await supabase
    .from('users').select('*').ilike('name', name.trim()).maybeSingle();
  if (!user) throw new Error('Invocador no encontrado');

  const hashed = await hashPassword(password);
  if (user.password !== hashed && user.password !== password) {
    throw new Error('Contraseña incorrecta');
  }
  return { id: user.id, name: user.name };
}

// ═══════════════════════════════════════════════════════════
// TEAM DIRECTORY
// ═══════════════════════════════════════════════════════════

export async function searchPublicTeams(query) {
  if (!isSupabaseConfigured) return [];

  let q = supabase.from('teams').select('id, name').eq('is_public', true).order('name');
  if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);

  const { data } = await q.limit(20);
  if (!data || data.length === 0) return [];

  const { data: counts } = await supabase
    .from('team_members').select('team_id').in('team_id', data.map(t => t.id));

  const countMap = {};
  for (const c of (counts || [])) countMap[c.team_id] = (countMap[c.team_id] || 0) + 1;

  return data.map(t => ({ id: t.id, name: t.name, memberCount: countMap[t.id] || 0 }));
}

export async function getUserTeams(userId) {
  if (!isSupabaseConfigured || !userId) return [];

  const { data } = await supabase
    .from('team_members')
    .select('id, team_id, game_role, team_role, teams(name, captain_id)')
    .eq('user_id', userId);

  if (!data) return [];
  return data.map(m => ({
    memberId: m.id,
    teamId: m.team_id,
    teamName: m.teams?.name || '',
    gameRole: m.game_role,
    teamRole: m.team_role,
  }));
}

export async function getUserPendingRequests(userId) {
  if (!isSupabaseConfigured || !userId) return [];

  const { data } = await supabase
    .from('join_requests')
    .select('id, team_id, game_role, status, teams(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    teamId: r.team_id,
    teamName: r.teams?.name || r.team_id,
    gameRole: r.game_role,
    status: r.status,
  }));
}

// ═══════════════════════════════════════════════════════════
// TEAM MANAGEMENT
// ═══════════════════════════════════════════════════════════

export async function createTeamWithCaptain(teamName, captainUserId, gameRole) {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado');

  const slug = teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
  const teamId = `${slug}-${Date.now().toString(36)}`;

  const { error: teamErr } = await supabase.from('teams').insert([{
    id: teamId,
    name: teamName.trim(),
    captain_id: captainUserId,
    is_public: true,
    threshold: 5,
  }]);
  if (teamErr) throw new Error('Error al crear equipo: ' + teamErr.message);

  const memberId = `tm_${uid()}`;
  const { error: memberErr } = await supabase.from('team_members').insert([{
    id: memberId,
    user_id: captainUserId,
    team_id: teamId,
    game_role: gameRole,
    team_role: 'captain',
    avail: {},
    pool: [],
  }]);
  if (memberErr) throw new Error('Error al crear membresía: ' + memberErr.message);

  return { teamId, teamName: teamName.trim(), memberId };
}

// ═══════════════════════════════════════════════════════════
// JOIN REQUESTS
// ═══════════════════════════════════════════════════════════

export async function requestJoinTeam(userId, teamId, gameRole, message) {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado');

  const { data: existing } = await supabase
    .from('team_members').select('id').eq('user_id', userId).eq('team_id', teamId).maybeSingle();
  if (existing) throw new Error('Ya eres miembro de este equipo');

  const id = `jr_${uid()}`;
  const { error } = await supabase.from('join_requests').upsert(
    [{ id, user_id: userId, team_id: teamId, game_role: gameRole, message: message || '', status: 'pending' }],
    { onConflict: 'user_id,team_id' }
  );
  if (error) throw new Error('Error al enviar solicitud: ' + error.message);
  return true;
}

export async function loadJoinRequests(teamId) {
  if (!isSupabaseConfigured || !teamId) return [];

  const { data } = await supabase
    .from('join_requests')
    .select('*, users(name)')
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at');

  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.users?.name || '?',
    gameRole: r.game_role,
    message: r.message,
    createdAt: r.created_at,
  }));
}

export async function acceptJoinRequest(requestId, userId, teamId, gameRole, teamRole = 'player') {
  const memberId = `tm_${uid()}`;
  const { error: memberErr } = await supabase.from('team_members').insert([{
    id: memberId, user_id: userId, team_id: teamId,
    game_role: gameRole, team_role: teamRole, avail: {}, pool: [],
  }]);
  if (memberErr) throw new Error('Error al agregar miembro: ' + memberErr.message);

  await supabase.from('join_requests').update({ status: 'accepted' }).eq('id', requestId);
  return memberId;
}

export async function rejectJoinRequest(requestId) {
  const { error } = await supabase
    .from('join_requests').update({ status: 'rejected' }).eq('id', requestId);
  if (error) throw new Error('Error al rechazar: ' + error.message);
}

export async function removeMemberFromTeam(userId, teamId) {
  const { error } = await supabase
    .from('team_members').delete().eq('user_id', userId).eq('team_id', teamId);
  if (error) throw new Error('Error al eliminar miembro: ' + error.message);
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

// ═══════════════════════════════════════════════════════════
// CAPTAIN TRANSFER
// ═══════════════════════════════════════════════════════════

export async function transferCaptain(teamId, newMemberUserId, currentCaptainUserId) {
  if (!isSupabaseConfigured) throw new Error('Supabase no está configurado');

  // Quitar capitanía al actual
  const { error: e1 } = await supabase
    .from('team_members')
    .update({ team_role: 'player' })
    .eq('team_id', teamId)
    .eq('user_id', currentCaptainUserId);
  if (e1) throw new Error('Error al quitar capitanía: ' + e1.message);

  // Dar capitanía al nuevo
  const { error: e2 } = await supabase
    .from('team_members')
    .update({ team_role: 'captain' })
    .eq('team_id', teamId)
    .eq('user_id', newMemberUserId);
  if (e2) throw new Error('Error al asignar capitanía: ' + e2.message);

  // Actualizar teams.captain_id
  const { error: e3 } = await supabase
    .from('teams')
    .update({ captain_id: newMemberUserId })
    .eq('id', teamId);
  if (e3) throw new Error('Error al actualizar capitán del equipo: ' + e3.message);
}

// ═══════════════════════════════════════════════════════════
// SCRIM MATCHMAKING — Ventanas compartidas y solicitudes
// ═══════════════════════════════════════════════════════════

export async function getTeamWindows(teamId) {
  if (!isSupabaseConfigured) return { windows: [], threshold: 5 };

  const [{ data: teamInfo }, { data: members }] = await Promise.all([
    supabase.from('teams').select('threshold').eq('id', teamId).maybeSingle(),
    supabase.from('team_members')
      .select('avail')
      .eq('team_id', teamId)
      .in('team_role', ['player', 'captain', 'substitute']),
  ]);

  const threshold = teamInfo?.threshold || 5;

  // Contar disponibilidad por franja
  const counts = {};
  for (const m of (members || [])) {
    for (const k of Object.keys(m.avail || {})) {
      counts[k] = (counts[k] || 0) + 1;
    }
  }

  // Encontrar runs
  const runs = [];
  for (let d = 0; d < 7; d++) {
    let run = null;
    for (let i = 0; i <= 16; i++) {
      const ok = i < 16 && (counts[`${d}-${i}`] || 0) >= threshold;
      if (ok) {
        if (!run) run = { day: d, start: i, end: i };
        else run.end = i;
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
  }

  return { windows: runs, threshold, counts };
}

export async function sendScrimRequest(fromTeamId, toTeamId, day, slot, duration, message) {
  if (!isSupabaseConfigured) throw new Error('Supabase no configurado');
  const id = `sr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const { error } = await supabase.from('scrim_requests').insert([{
    id, from_team_id: fromTeamId, to_team_id: toTeamId,
    day, slot, duration: duration || 1, message: message || '', status: 'pending',
  }]);
  if (error) throw new Error('Error al enviar solicitud: ' + error.message);
}

export async function loadIncomingScrimRequests(teamId) {
  if (!isSupabaseConfigured) return [];
  const { data } = await supabase
    .from('scrim_requests')
    .select('*, teams!scrim_requests_from_team_id_fkey(name)')
    .eq('to_team_id', teamId)
    .eq('status', 'pending')
    .order('created_at');
  if (!data) return [];
  return data.map(r => ({
    id: r.id,
    fromTeamId: r.from_team_id,
    fromTeamName: r.teams?.name || r.from_team_id,
    day: r.day, slot: r.slot, duration: r.duration,
    start: r.slot, end: r.slot + (r.duration || 1) - 1,
    message: r.message,
  }));
}

export async function respondScrimRequest(requestId, accepted) {
  const status = accepted ? 'accepted' : 'rejected';
  const { error } = await supabase
    .from('scrim_requests').update({ status }).eq('id', requestId);
  if (error) throw new Error('Error al responder: ' + error.message);
}

// ═══════════════════════════════════════════════════════════
// FASE 3: LADDERS & TRACKER (SoloQ / Flex)
// ═══════════════════════════════════════════════════════════

export const TIERS = ['UNRANKED', 'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
export const DIVISIONS = ['IV', 'III', 'II', 'I'];

export const TIER_BASES = {
  UNRANKED: 0,
  IRON: 100,
  BRONZE: 500,
  SILVER: 900,
  GOLD: 1300,
  PLATINUM: 1700,
  EMERALD: 2100,
  DIAMOND: 2500,
  MASTER: 2900,
  GRANDMASTER: 3400,
  CHALLENGER: 3900,
};

export function rankToLp(tier, division, lp) {
  const t = (tier || 'UNRANKED').toUpperCase();
  if (t === 'UNRANKED') return 0;
  const base = TIER_BASES[t] ?? 0;
  if (t === 'MASTER' || t === 'GRANDMASTER' || t === 'CHALLENGER') {
    return base + (Number(lp) || 0);
  }
  const divIndex = DIVISIONS.indexOf(division || 'IV');
  const divLp = (divIndex >= 0 ? divIndex : 0) * 100;
  return base + divLp + (Number(lp) || 0);
}

export function lpToRank(lpValue) {
  if (lpValue <= 0) return { tier: 'UNRANKED', division: '', lp: 0, str: 'Unranked' };
  
  if (lpValue >= 3900) {
    return { tier: 'CHALLENGER', division: '', lp: lpValue - 3900, str: `Challenger ${lpValue - 3900} LP` };
  }
  if (lpValue >= 3400) {
    return { tier: 'GRANDMASTER', division: '', lp: lpValue - 3400, str: `Grandmaster ${lpValue - 3400} LP` };
  }
  if (lpValue >= 2900) {
    return { tier: 'MASTER', division: '', lp: lpValue - 2900, str: `Master ${lpValue - 2900} LP` };
  }
  
  const sortedTiers = ['DIAMOND', 'EMERALD', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON'];
  for (const tier of sortedTiers) {
    const base = TIER_BASES[tier];
    if (lpValue >= base) {
      const diff = lpValue - base;
      const divIndex = Math.min(3, Math.floor(diff / 100));
      const division = DIVISIONS[divIndex];
      const lp = diff % 100;
      
      const tierName = tier.charAt(0) + tier.slice(1).toLowerCase();
      return { tier, division, lp, str: `${tierName} ${division} - ${lp} LP` };
    }
  }
  
  return { tier: 'UNRANKED', division: '', lp: 0, str: 'Unranked' };
}

export async function getUserProfile(userId) {
  if (!isSupabaseConfigured || !userId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, summoner_name, games_privacy, current_tier, current_division, current_lp, current_lp_value')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function getSummonerDeterministicLpValue(summonerName) {
  const name = (summonerName || '').trim().toLowerCase();
  if (!name) return 0;
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  
  // Easter eggs
  if (name.includes('faker')) return 3900 + 1520;
  if (name.includes('showmaker') || name.includes('chovy')) return 3900 + 1240;
  if (name.includes('caps')) return 3900 + 950;
  
  // Entre 100 LP (Hierro IV) y 4200 LP (Challenger 300 LP)
  return 100 + (hash % 4100);
}

export async function updateUserProfile(userId, summonerName, privacy) {
  if (!isSupabaseConfigured) return;
  const trimmed = summonerName.trim();
  const lpValue = getSummonerDeterministicLpValue(trimmed);
  const newRank = lpToRank(lpValue);

  const { error } = await supabase
    .from('users')
    .update({
      summoner_name: trimmed,
      games_privacy: privacy,
      current_tier: newRank.tier,
      current_division: newRank.division,
      current_lp: newRank.lp,
      current_lp_value: lpValue
    })
    .eq('id', userId);
  if (error) throw new Error('Error al actualizar perfil: ' + error.message);
  
  // Borrar partidas antiguas de este usuario ya que cambió su Summoner Name
  await supabase
    .from('summoner_games')
    .delete()
    .eq('user_id', userId);

  // Actualizar también en los ladders activos en que participa (tanto start_lp como current_lp para evitar saltos extraños)
  const { data: activeLadders } = await supabase
    .from('ladders')
    .select('id')
    .eq('status', 'active');
  if (activeLadders && activeLadders.length > 0) {
    const activeIds = activeLadders.map(l => l.id);
    await supabase
      .from('ladder_participants')
      .update({ start_lp: lpValue, current_lp: lpValue, last_updated: new Date() })
      .eq('user_id', userId)
      .in('ladder_id', activeIds);
  }
}

export async function createLadder(teamId, name, type, period, endDate, createdBy) {
  if (!isSupabaseConfigured) throw new Error('Supabase no configurado');
  const ladderId = `lad_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  const { error: ladderErr } = await supabase.from('ladders').insert([{
    id: ladderId,
    team_id: teamId,
    name: name.trim(),
    type,
    period,
    end_date: endDate,
    status: 'active',
    created_by: createdBy
  }]);
  if (ladderErr) throw new Error('Error al crear ladder: ' + ladderErr.message);

  // Inscribir al propio equipo creador
  await supabase.from('ladder_teams').insert([{
    id: `lt_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    ladder_id: ladderId,
    team_id: teamId
  }]);

  // Agregar a todos los miembros actuales de ese equipo a ladder_participants
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id, users(current_lp_value)')
    .eq('team_id', teamId);
  
  if (members && members.length > 0) {
    const participants = members.map(m => ({
      id: `lp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      ladder_id: ladderId,
      user_id: m.user_id,
      team_id: teamId,
      start_lp: m.users?.current_lp_value || 0,
      current_lp: m.users?.current_lp_value || 0
    }));
    await supabase.from('ladder_participants').insert(participants);
  }

  return ladderId;
}

export async function loadTeamLadders(teamId) {
  if (!isSupabaseConfigured || !teamId) return [];
  
  // Buscar ladders en que participa el equipo
  const { data: lTeams } = await supabase
    .from('ladder_teams')
    .select('ladder_id')
    .eq('team_id', teamId);
  
  if (!lTeams || lTeams.length === 0) return [];
  const ladderIds = lTeams.map(lt => lt.ladder_id);

  const { data: ladders, error } = await supabase
    .from('ladders')
    .select('*, teams!ladders_team_id_fkey(name)')
    .in('id', ladderIds)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return ladders.map(l => ({
    id: l.id,
    teamId: l.team_id,
    ownerTeamName: l.teams?.name || '',
    name: l.name,
    type: l.type,
    period: l.period,
    startDate: l.start_date,
    endDate: l.end_date,
    status: l.status,
    createdAt: l.created_at
  }));
}

export async function loadLadderDetails(ladderId) {
  if (!isSupabaseConfigured || !ladderId) return null;

  const [
    { data: ladder },
    { data: teams },
    { data: participants }
  ] = await Promise.all([
    supabase.from('ladders').select('*').eq('id', ladderId).maybeSingle(),
    supabase.from('ladder_teams').select('team_id, teams(name)').eq('ladder_id', ladderId),
    supabase.from('ladder_participants').select('*, users(name, summoner_name, games_privacy, current_tier, current_division, current_lp), teams(name)').eq('ladder_id', ladderId)
  ]);

  if (!ladder) return null;

  return {
    id: ladder.id,
    teamId: ladder.team_id,
    name: ladder.name,
    type: ladder.type,
    period: ladder.period,
    startDate: ladder.start_date,
    endDate: ladder.end_date,
    status: ladder.status,
    teams: (teams || []).map(t => ({ id: t.team_id, name: t.teams?.name || '' })),
    participants: (participants || []).map(p => ({
      userId: p.user_id,
      userName: p.users?.name || '?',
      summonerName: p.users?.summoner_name || '',
      gamesPrivacy: p.users?.games_privacy || 'public',
      teamId: p.team_id,
      teamName: p.teams?.name || '?',
      startLp: p.start_lp,
      currentLp: p.current_lp,
      delta: p.current_lp - p.start_lp,
      lastUpdated: p.last_updated,
      currentTier: p.users?.current_tier || 'UNRANKED',
      currentDivision: p.users?.current_division || 'IV',
      currentLpNum: p.users?.current_lp || 0
    })).sort((a, b) => b.delta - a.delta)
  };
}

export async function ensureUserInLadder(ladderId, userId, teamId) {
  if (!isSupabaseConfigured || !ladderId || !userId || !teamId) return;
  const { data: existing } = await supabase
    .from('ladder_participants')
    .select('id')
    .eq('ladder_id', ladderId)
    .eq('user_id', userId)
    .maybeSingle();
  
  if (!existing) {
    const { data: u } = await supabase
      .from('users')
      .select('current_lp_value')
      .eq('id', userId)
      .maybeSingle();
    
    const lpVal = u?.current_lp_value || 0;
    await supabase.from('ladder_participants').insert([{
      id: `lp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      ladder_id: ladderId,
      user_id: userId,
      team_id: teamId,
      start_lp: lpVal,
      current_lp: lpVal
    }]);
  }
}

export async function sendLadderInvite(ladderId, fromTeamId, toTeamId) {
  if (!isSupabaseConfigured) throw new Error('Supabase no configurado');
  const id = `li_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from('ladder_invites').insert([{
    id,
    ladder_id: ladderId,
    from_team_id: fromTeamId,
    to_team_id: toTeamId,
    status: 'pending'
  }]);
  if (error) {
    if (error.code === '23505') throw new Error('Este equipo ya está invitado o ya forma parte del ladder');
    throw new Error('Error al enviar invitación: ' + error.message);
  }
}

export async function loadIncomingLadderInvites(teamId) {
  if (!isSupabaseConfigured || !teamId) return [];
  const { data, error } = await supabase
    .from('ladder_invites')
    .select('*, ladders(name), teams!ladder_invites_from_team_id_fkey(name)')
    .eq('to_team_id', teamId)
    .eq('status', 'pending');
  if (error) throw error;
  return data.map(i => ({
    id: i.id,
    ladderId: i.ladder_id,
    ladderName: i.ladders?.name || '?',
    fromTeamId: i.from_team_id,
    fromTeamName: i.teams?.name || '?',
    createdAt: i.created_at
  }));
}

export async function respondLadderInvite(inviteId, accepted) {
  if (!isSupabaseConfigured) throw new Error('Supabase no configurado');
  const status = accepted ? 'accepted' : 'rejected';
  
  const { data: invite } = await supabase
    .from('ladder_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle();
  if (!invite) throw new Error('Invitación no encontrada');

  const { error: updateErr } = await supabase
    .from('ladder_invites')
    .update({ status })
    .eq('id', inviteId);
  if (updateErr) throw new Error('Error al responder invitación: ' + updateErr.message);

  if (accepted) {
    // Agregar a la tabla de equipos del ladder
    await supabase.from('ladder_teams').insert([{
      id: `lt_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      ladder_id: invite.ladder_id,
      team_id: invite.to_team_id
    }]);

    // Inscribir a todos los jugadores del equipo invitado
    const { data: members } = await supabase
      .from('team_members')
      .select('user_id, users(current_lp_value)')
      .eq('team_id', invite.to_team_id);
    
    if (members && members.length > 0) {
      const participants = members.map(m => ({
        id: `lp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        ladder_id: invite.ladder_id,
        user_id: m.user_id,
        team_id: invite.to_team_id,
        start_lp: m.users?.current_lp_value || 0,
        current_lp: m.users?.current_lp_value || 0
      }));
      await supabase.from('ladder_participants').insert(participants);
    }
  }
}

export async function loadUserGames(userId) {
  if (!isSupabaseConfigured || !userId) return [];
  const { data, error } = await supabase
    .from('summoner_games')
    .select('*')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data.map(g => ({
    id: g.id,
    champion: g.champion,
    role: g.role,
    result: g.result,
    kills: g.kda_kills,
    deaths: g.kda_deaths,
    assists: g.kda_assists,
    lpChange: g.lp_change,
    playedAt: g.played_at,
    playersMatched: g.players_matched || []
  }));
}

export async function syncUserGames(userId, teamId, summonerName, isManual = true) {
  if (!isSupabaseConfigured || !userId) {
    return { success: false, gamesAdded: 0, status: 'Supabase no configurado' };
  }

  // 1. Obtener usuario
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (!user) throw new Error('Usuario no encontrado');

  // 2. Obtener la última partida de este invocador para saber la marca temporal
  const { data: lastGame } = await supabase
    .from('summoner_games')
    .select('played_at')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Buscar otros usuarios con summoner name para simular enfrentamientos directos
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, name, summoner_name')
    .neq('id', userId)
    .neq('summoner_name', '')
    .not('summoner_name', 'is', null);

  const CHAMPIONS_LIST = ['Aatrox', 'Ahri', 'Akali', 'Alistar', 'Amumu', 'Ashe', 'Bard', 'Camille', 'Darius', 'Ezreal', 'Galio', 'Garen', 'Janna', 'Jax', 'KaiSa', 'Karma', 'LeeSin', 'Leona', 'Lulu', 'Lux', 'Malphite', 'MissFortune', 'Nautilus', 'Nidalee', 'Nocturne', 'Orianna', 'Ornn', 'Ryze', 'Sejuani', 'Sivir', 'Syndra', 'Thresh', 'Vayne', 'Yasuo', 'Yone', 'Zoe'];
  const ROLES_LIST = ['top', 'jg', 'mid', 'adc', 'sup'];

  let lpAccumulator = user.current_lp_value || 1200;
  let gamesToSimulate = [];
  const now = new Date();

  // Función interna para crear una partida simulada individual
  const generateSimulatedGame = (playedAt, index) => {
    const result = Math.random() > 0.5 ? 'win' : 'loss';
    const lpChange = result === 'win' 
      ? (Math.floor(Math.random() * 8) + 15) 
      : -(Math.floor(Math.random() * 7) + 13);
    
    lpAccumulator = Math.max(0, lpAccumulator + lpChange);
    
    const champ = CHAMPIONS_LIST[Math.floor(Math.random() * CHAMPIONS_LIST.length)];
    const role = ROLES_LIST[Math.floor(Math.random() * ROLES_LIST.length)];
    
    let kills = 0, deaths = 0, assists = 0;
    if (result === 'win') {
      kills = Math.floor(Math.random() * 7) + 2;
      deaths = Math.floor(Math.random() * 4);
      assists = Math.floor(Math.random() * 10) + 4;
    } else {
      kills = Math.floor(Math.random() * 4) + 1;
      deaths = Math.floor(Math.random() * 6) + 2;
      assists = Math.floor(Math.random() * 7);
    }

    // Cruces Head-to-Head
    const matched = [];
    if (allUsers && allUsers.length > 0 && Math.random() < 0.4) {
      const numMatched = Math.min(allUsers.length, Math.random() < 0.8 ? 1 : 2);
      const shuffled = [...allUsers].sort(() => 0.5 - Math.random());
      
      for (let j = 0; j < numMatched; j++) {
        const matchedUser = shuffled[j];
        const sameTeam = Math.random() > 0.5;
        const matchedResult = sameTeam ? result : (result === 'win' ? 'loss' : 'win');
        matched.push({
          userId: matchedUser.id,
          summonerName: matchedUser.summoner_name,
          champion: CHAMPIONS_LIST[Math.floor(Math.random() * CHAMPIONS_LIST.length)],
          sameTeam,
          result: matchedResult
        });
      }
    }

    return {
      id: `g_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: userId,
      champion: champ,
      role,
      result,
      kda_kills: kills,
      kda_deaths: deaths,
      kda_assists: assists,
      lp_change: lpChange,
      played_at: playedAt,
      players_matched: matched
    };
  };

  if (!lastGame) {
    // CASO A: No hay partidas registradas (Invocador nuevo)
    // Generar un historial inicial de 5 partidas jugadas en las últimas 24 horas
    for (let i = 0; i < 5; i++) {
      const gameTime = new Date(now.getTime() - (5 - i) * 3.5 * 60 * 60 * 1000); // Espaciadas cada 3.5 horas
      gamesToSimulate.push(generateSimulatedGame(gameTime, i));
    }
  } else {
    // CASO B: Ya tiene partidas
    const lastGameTime = new Date(lastGame.played_at);
    const msDiff = now.getTime() - lastGameTime.getTime();
    const hoursDiff = msDiff / (60 * 60 * 1000);
    const minsDiff = msDiff / (60 * 1000);

    // Cada 3 horas se juega una partida de forma natural
    const naturalGamesCount = Math.floor(hoursDiff / 3);
    
    if (naturalGamesCount > 0) {
      for (let i = 0; i < naturalGamesCount; i++) {
        const gameTime = new Date(lastGameTime.getTime() + (i + 1) * 3 * 60 * 60 * 1000);
        gamesToSimulate.push(generateSimulatedGame(gameTime, i));
      }
    } else if (isManual) {
      // Si el usuario da clic manual a "Refresh" y no ha pasado suficiente tiempo para una partida natural:
      // Permitir forzar 1 partida si han pasado al menos 5 minutos desde la última para dar feedback visual
      if (minsDiff >= 5) {
        gamesToSimulate.push(generateSimulatedGame(now, 0));
      } else {
        // Hace menos de 5 minutos, devolver que está al día
        const minWaitLeft = Math.ceil(5 - minsDiff);
        return { 
          success: true, 
          gamesAdded: 0, 
          status: `Tu cuenta ya está actualizada. Espera ${minWaitLeft} min para volver a escanear.` 
        };
      }
    }
  }

  // 3. Si hay partidas a insertar
  if (gamesToSimulate.length > 0) {
    const { error: insertErr } = await supabase
      .from('summoner_games')
      .insert(gamesToSimulate);
    if (insertErr) throw new Error('Error al guardar partidas: ' + insertErr.message);

    // 4. Actualizar rango y LP acumulados en la cuenta del usuario
    const newRank = lpToRank(lpAccumulator);
    const { error: profileErr } = await supabase
      .from('users')
      .update({
        current_tier: newRank.tier,
        current_division: newRank.division,
        current_lp: newRank.lp,
        current_lp_value: lpAccumulator
      })
      .eq('id', userId);
    if (profileErr) throw new Error('Error al actualizar perfil del invocador: ' + profileErr.message);

    // 5. Sincronizar en los ladders activos de este usuario
    const { data: activeLadders } = await supabase
      .from('ladders')
      .select('id')
      .eq('status', 'active');
    
    if (activeLadders && activeLadders.length > 0) {
      const activeIds = activeLadders.map(l => l.id);
      await supabase
        .from('ladder_participants')
        .update({ current_lp: lpAccumulator, last_updated: new Date() })
        .eq('user_id', userId)
        .in('ladder_id', activeIds);
    }

    return { 
      success: true, 
      gamesAdded: gamesToSimulate.length, 
      status: `¡Historial actualizado! Se sincronizaron ${gamesToSimulate.length} partida(s) nueva(s).` 
    };
  }

  return { 
    success: true, 
    gamesAdded: 0, 
    status: 'Tu clasificación y partidas están al día.' 
  };
}

export async function backgroundSyncParticipant(ladderId, userId, teamId, summonerName, currentLpVal) {
  if (!isSupabaseConfigured || !userId) return;

  // Actualizar marca temporal inmediatamente para evitar ejecuciones concurrentes
  await supabase
    .from('ladder_participants')
    .update({ last_updated: new Date() })
    .eq('ladder_id', ladderId)
    .eq('user_id', userId);

  // Llamar a syncUserGames con isManual = false para simular partidas basadas en tiempo transcurrido
  await syncUserGames(userId, teamId, summonerName, false);
}


