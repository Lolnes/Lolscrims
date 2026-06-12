/* ========================================================================
   App.jsx — LoL League Planner
   Main application with tabs: Horarios, Composiciones, Scrims, Stats
   ======================================================================== */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DAYS, START_HOUR, NUM_SLOTS, slotHour, fmt, GOLD, GOLD_BRIGHT,
  TEAMS, TEAM_IDS, ROLES, ROLE_MAP, COMP_STYLES, SCRIM_TAGS,
} from './constants';
import {
  loadData, saveData, exportJSON, importJSON,
  getActiveTeamCode, setActiveTeamCode,
  getCurrentUserId, setCurrentUserIdStorage,
  getCurrentUserNameStorage, setCurrentUserNameStorage,
  registerUser, loginUser,
  searchPublicTeams, getUserTeams, getUserPendingRequests,
  createTeamWithCaptain,
  requestJoinTeam, loadJoinRequests,
  acceptJoinRequest, rejectJoinRequest, removeMemberFromTeam,
} from './storage';
import { supabase, isSupabaseConfigured } from './supabase';
import { formatDiscord } from './utils/discord';
import useDragon from './hooks/useDragon';

/* ─────────────────────────── helpers ─────────────────────────── */

function findRuns(pred) {
  const runs = [];
  for (let d = 0; d < 7; d++) {
    let run = null;
    for (let i = 0; i <= NUM_SLOTS; i++) {
      const ok = i < NUM_SLOTS && pred(`${d}-${i}`);
      if (ok) {
        if (!run) run = { day: d, start: i, end: i };
        else run.end = i;
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
  }
  return runs.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.day - b.day);
}

function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

/* ═══════════════════════════ MAIN APP ═══════════════════════════ */

export default function App() {
  /* ─── state ─── */
  const [players, setPlayers] = useState([]);
  const [comps, setComps] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [scrims, setScrims] = useState([]);
  const [threshold, setThreshold] = useState(5);
  const [tab, setTab] = useState('schedule');
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const saveTimer = useRef(null);

  /* Global user auth */
  const [currentUserId, setCurrentUserId] = useState(() => getCurrentUserId());
  const [currentUserName, setCurrentUserName] = useState(() => getCurrentUserNameStorage());

  /* Team state */
  const [teamCode, setTeamCode] = useState(() => getActiveTeamCode());
  const [teamName, setTeamName] = useState('');
  const [myTeamRole, setMyTeamRole] = useState('player');
  const [joinRequests, setJoinRequests] = useState([]);

  /* Derived: current user's member record in this team */
  const sessionPlayer = useMemo(
    () => players.find(p => p.userId === currentUserId) || null,
    [players, currentUserId]
  );
  const sessionPlayerId = sessionPlayer?.id || '';

  /* Dragon */
  const { champions, version: dragonVersion, loading: dragonLoading } = useDragon();

  /* ─── persistence ─── */
  useEffect(() => {
    if (!teamCode) { setLoaded(true); return; }
    setLoaded(false);
    loadData().then((data) => {
      setPlayers(data.players || []);
      setComps(data.comps || []);
      setDrafts(data.drafts || []);
      setScrims(data.scrims || []);
      setThreshold(data.threshold || 5);
      setTeamName(data.teamName || '');
      // Set my team role from loaded members
      const myMember = (data.players || []).find(p => p.userId === currentUserId);
      setMyTeamRole(myMember?.teamRole || 'player');
      setLoaded(true);
    });
  }, [teamCode, currentUserId]);

  useEffect(() => {
    if (!loaded || !teamCode) return;
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await saveData({ players, comps, drafts, scrims, threshold });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [players, comps, drafts, scrims, threshold, loaded, teamCode]);

  // Load join requests for captain
  useEffect(() => {
    if (myTeamRole !== 'captain' || !teamCode) return;
    loadJoinRequests(teamCode).then(setJoinRequests).catch(() => {});
  }, [myTeamRole, teamCode]);

  /* ─── auth & team handlers ─── */
  const handleGlobalLogin = async (name, password) => {
    const user = await loginUser(name, password); // throws on error
    setCurrentUserId(user.id);
    setCurrentUserName(user.name);
    setCurrentUserIdStorage(user.id);
    setCurrentUserNameStorage(user.name);
  };

  const handleGlobalRegister = async (name, password) => {
    const user = await registerUser(name, password); // throws on error
    setCurrentUserId(user.id);
    setCurrentUserName(user.name);
    setCurrentUserIdStorage(user.id);
    setCurrentUserNameStorage(user.name);
  };

  const handleSelectTeam = (teamId, tName, teamRole) => {
    setActiveTeamCode(teamId);
    setTeamCode(teamId);
    setTeamName(tName);
    setMyTeamRole(teamRole);
    setLoaded(false);
  };

  const handleCreateTeamFlow = async (tName, gameRole) => {
    const result = await createTeamWithCaptain(tName, currentUserId, gameRole);
    setActiveTeamCode(result.teamId);
    setTeamCode(result.teamId);
    setTeamName(result.teamName);
    setMyTeamRole('captain');
    setPlayers([]);
    setComps([]);
    setDrafts([]);
    setScrims([]);
    setLoaded(false);
  };

  const handleLeaveTeam = () => {
    setActiveTeamCode('');
    setTeamCode('');
    setTeamName('');
    setMyTeamRole('player');
    setPlayers([]);
    setComps([]);
    setDrafts([]);
    setScrims([]);
    setLoaded(false);
  };

  const handleLogout = () => {
    handleLeaveTeam();
    setCurrentUserId('');
    setCurrentUserName('');
    setCurrentUserIdStorage('');
    setCurrentUserNameStorage('');
    setActiveTeamCode('');
    localStorage.removeItem('lol-local-mode');
  };

  /* ─── cell data (for schedule) ─── */
  const cellData = useMemo(() => {
    const m = {};
    for (const p of players) {
      for (const k of Object.keys(p.avail || {})) {
        if (!m[k]) m[k] = [];
        m[k].push(p.name);
      }
    }
    return m;
  }, [players]);

  const countOf = useCallback(
    (key) => cellData[key]?.length || 0,
    [cellData]
  );

  /* ─── windows ─── */
  const windowDetail = useCallback((run) => {
    const slots = [];
    for (let i = run.start; i <= run.end; i++) slots.push(`${run.day}-${i}`);
    const full = [], partial = [];
    let min = Infinity, max = 0;
    for (const k of slots) {
      const n = countOf(k);
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    for (const p of players) {
      const c = slots.filter((k) => p.avail?.[k]).length;
      if (c === slots.length) full.push(p.name);
      else if (c > 0) partial.push(p.name);
    }
    return { full, partial, min, max };
  }, [players, countOf]);

  const windows = useMemo(
    () => findRuns((k) => countOf(k) >= threshold)
      .map((run) => ({ ...run, detail: windowDetail(run) })),
    [countOf, threshold, windowDetail]
  );

  /* ─── export/import ─── */
  const [showExport, setShowExport] = useState(false);

  const handleExportJSON = () => {
    exportJSON({ players, comps, drafts, scrims, threshold, version: 3 });
  };

  const handleCopyDiscord = () => {
    const text = formatDiscord({ players, comps, threshold }, teamWindows, scrimWindows);
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleImport = (jsonStr) => {
    try {
      const data = importJSON(jsonStr);
      setPlayers(data.players);
      setComps(data.comps);
      setDrafts(data.drafts || []);
      setScrims(data.scrims);
      setThreshold(data.threshold);
      setShowExport(false);
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
  };

  /* ─── routing ─── */
  if (!currentUserId) {
    return (
      <GlobalAuthScreen
        onLogin={handleGlobalLogin}
        onRegister={handleGlobalRegister}
      />
    );
  }

  if (!teamCode) {
    return (
      <TeamDirectoryScreen
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onSelectTeam={handleSelectTeam}
        onCreateTeam={handleCreateTeamFlow}
        onLogout={handleLogout}
      />
    );
  }

  if (!loaded) {
    return (
      <div className="app-container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="text-muted mono text-sm">Cargando datos del equipo…</div>
      </div>
    );
  }

  /* ─── tabs config ─── */
  const TABS = [
    { id: 'schedule', label: 'Horarios',      icon: '📅' },
    { id: 'comps',    label: 'Composiciones', icon: '⚔️' },
    { id: 'scrims',   label: 'Scrims',        icon: '📝' },
    { id: 'stats',    label: 'Stats',         icon: '📊' },
    ...(myTeamRole === 'captain' ? [{ id: 'captain', label: 'Capitán', icon: '👑' }] : []),
  ];

  const isCaptain = myTeamRole === 'captain';
  const isCoachOrManager = myTeamRole === 'coach' || myTeamRole === 'manager';
  const canEdit = !isCoachOrManager;

  return (
    <div className="app-container">
      {/* ═══ Header ═══ */}
      <header className="app-header">
        <div>
          <div className="app-header__brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>League Planner · Patch {dragonVersion || '…'}</span>
            <span className="chip chip--sm chip--gold font-mono" style={{ fontSize: '0.6rem', textTransform: 'none', letterSpacing: 'normal' }}>
              ☁️ {teamName}
            </span>
          </div>
          <h1 className="app-header__title">¿Cuándo jugamos?</h1>
          <p className="app-header__subtitle">
            Gestiona horarios, composiciones, champion pools y notas de tus scrims en un solo lugar.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {sessionPlayer ? (
              <span className="chip chip--sm chip--green font-mono" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                🟢
                <span style={{ fontWeight: 'bold' }}>
                  {ROLE_MAP[sessionPlayer.role]?.icon || '❓'} {sessionPlayer.name}
                </span>
                <span className="text-faint">· {myTeamRole}</span>
                {isCaptain && joinRequests.length > 0 && (
                  <span className="chip chip--sm" style={{ background: 'var(--red-bright)', color: '#fff', padding: '0 0.3rem', fontSize: '0.6rem' }}>
                    {joinRequests.length}
                  </span>
                )}
              </span>
            ) : (
              <span className="chip chip--sm font-mono" style={{ fontSize: '0.7rem', color: 'var(--gold-bright)' }}>
                👤 {currentUserName} · {myTeamRole}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 header-controls">
          <button className="btn btn--outline btn--sm" onClick={handleLeaveTeam}>
            ← Equipos
          </button>
          <button className="btn btn--outline btn--sm" onClick={handleLogout} style={{ color: 'var(--red-text)' }}>
            Cerrar sesión
          </button>
          <button className="btn btn--outline btn--sm" onClick={() => setShowExport(true)}>
            📦 Export / Import
          </button>
          <div className="threshold-control">
            <div className="threshold-control__label">Mínimo jugadores</div>
            <div className="threshold-control__row">
              <button className="threshold-btn" onClick={() => setThreshold((t) => Math.max(2, t - 1))}>−</button>
              <span className="threshold-control__value">{threshold}</span>
              <button className="threshold-btn" onClick={() => setThreshold((t) => Math.min(10, t + 1))}>+</button>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ Tab bar ═══ */}
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-bar__btn ${tab === t.id ? 'tab-bar__btn--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-bar__icon">{t.icon}</span>
            <span className="tab-bar__label">{t.label}</span>
            {t.id === 'captain' && joinRequests.length > 0 && (
              <span style={{ background: 'var(--red-bright)', color: '#fff', borderRadius: '9999px', padding: '0 0.35rem', fontSize: '0.6rem', marginLeft: '0.25rem' }}>
                {joinRequests.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ═══ Tab content ═══ */}
      {tab === 'schedule' && (
        <ScheduleTab
          players={players}
          setPlayers={setPlayers}
          cellData={cellData}
          countOf={countOf}
          threshold={threshold}
          windows={windows}
          champions={champions}
          sessionPlayerId={sessionPlayerId}
          canEdit={canEdit}
        />
      )}
      {tab === 'comps' && (
        <CompsTab
          comps={comps}
          setComps={setComps}
          drafts={drafts}
          setDrafts={setDrafts}
          players={players}
          champions={champions}
          sessionPlayerId={sessionPlayerId}
        />
      )}
      {tab === 'scrims' && (
        <ScrimsTab
          scrims={scrims}
          setScrims={setScrims}
          comps={comps}
          sessionPlayerId={sessionPlayerId}
        />
      )}
      {tab === 'stats' && (
        <StatsTab
          players={players}
          cellData={cellData}
          countOf={countOf}
          threshold={threshold}
          comps={comps}
          scrims={scrims}
        />
      )}

      {tab === 'captain' && (
        <CaptainPanel
          joinRequests={joinRequests}
          setJoinRequests={setJoinRequests}
          players={players}
          setPlayers={setPlayers}
          teamCode={teamCode}
          currentUserId={currentUserId}
        />
      )}

      {/* ═══ Footer ═══ */}
      <footer className="flex items-center justify-between mt-8" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        <span className="mono text-xs text-faint">Horario: 10:00 → 02:00 (hora local)</span>
        <span className={`save-indicator ${saveState === 'saved' ? 'save-indicator--saved' : ''} ${saveState === 'error' ? 'save-indicator--error' : ''}`}>
          {saveState === 'saving' && 'Guardando…'}
          {saveState === 'saved' && '✓ Guardado'}
          {saveState === 'error' && '⚠ No se pudo guardar'}
        </span>
      </footer>

      {/* ═══ Export/Import Modal ═══ */}
      {showExport && (
        <ExportImportModal
          onClose={() => setShowExport(false)}
          onExportJSON={handleExportJSON}
          onCopyDiscord={handleCopyDiscord}
          onImport={handleImport}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCHEDULE TAB
   ═══════════════════════════════════════════════════════════════════ */

function ScheduleTab({ players, setPlayers, cellData, countOf, threshold, windows, champions, sessionPlayerId, canEdit }) {
  const [activeId, setActiveId] = useState(() => {
    if (sessionPlayerId && players.some((p) => p.id === sessionPlayerId)) return sessionPlayerId;
    return 'map';
  });
  const paint = useRef({ active: false, value: true });

  const activePlayer = players.find((p) => p.id === activeId);
  const isMapView = !activePlayer;
  const isEditable = canEdit && activePlayer && sessionPlayerId === activePlayer.id;

  /* player actions */
  const removePlayer = (id) => {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId('map');
  };

  const setPlayerRole = (id, role) => {
    setPlayers((ps) => ps.map((p) => p.id === id ? { ...p, role } : p));
  };

  const setCell = useCallback((playerId, key, value) => {
    setPlayers((ps) =>
      ps.map((p) => {
        if (p.id !== playerId) return p;
        const avail = { ...p.avail };
        if (value) avail[key] = true;
        else delete avail[key];
        return { ...p, avail };
      })
    );
  }, []);

  /* painting */
  const onCellDown = (e, key) => {
    if (isMapView || !isEditable) return;
    e.preventDefault();
    if (e.target.releasePointerCapture) {
      try { e.target.releasePointerCapture(e.pointerId); } catch {}
    }
    const next = !activePlayer.avail?.[key];
    paint.current = { active: true, value: next };
    setCell(activePlayer.id, key, next);
  };
  const onCellEnter = (key) => {
    if (isMapView || !isEditable || !paint.current.active) return;
    setCell(activePlayer.id, key, paint.current.value);
  };

  useEffect(() => {
    const stop = () => { paint.current.active = false; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  /* champion pool management */
  const addToPool = (playerId, championId, tier = 'comfort') => {
    setPlayers((ps) => ps.map((p) => {
      if (p.id !== playerId) return p;
      if (p.pool.some((c) => c.championId === championId)) return p;
      return { ...p, pool: [...p.pool, { championId, tier }] };
    }));
  };

  const removeFromPool = (playerId, championId) => {
    setPlayers((ps) => ps.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, pool: p.pool.filter((c) => c.championId !== championId) };
    }));
  };

  return (
    <div>
      {/* ── Roster ── */}
      <div className="card mb-4">
        <div className="card__header">
          <span className="card__title">Roster del equipo</span>
          <span className="mono text-xs text-muted">{players.length} jugador{players.length === 1 ? '' : 'es'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {players.length === 0 && <span className="text-xs text-faint">Nadie en el equipo aún. El capitán debe aceptar solicitudes de unión.</span>}
          {players.map((p) => (
            <div
              key={p.id}
              className={`player-chip ${activeId === p.id ? 'player-chip--active' : ''}`}
              style={{ borderColor: activeId === p.id ? 'var(--gold-primary)' : undefined }}
              onClick={() => setActiveId(p.id)}
            >
              <span className="player-chip__role">{ROLE_MAP[p.role]?.icon || '❓'}</span>
              <span>{p.name}</span>
              <span className="player-chip__hours">{Object.keys(p.avail || {}).length}h</span>
              {sessionPlayerId === p.id && (
                <button className="player-chip__action player-chip__action--danger" onClick={(e) => { e.stopPropagation(); removePlayer(p.id); }} title="Salir del equipo">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Player selector ── */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          className={`tab-bar__btn ${isMapView ? 'tab-bar__btn--active' : ''}`}
          onClick={() => setActiveId('map')}
          style={{ borderRadius: 'var(--radius-md)', border: isMapView ? 'none' : '1px solid var(--border)' }}
        >
          Vista general
        </button>
        {players.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            style={{
              borderRadius: 'var(--radius-md)',
              border: activeId === p.id ? `1px solid ${GOLD}` : '1px solid var(--border)',
              background: activeId === p.id ? 'var(--bg-surface)' : 'transparent',
              color: activeId === p.id ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '0.2rem 0.6rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            {ROLE_MAP[p.role]?.icon || '❓'} {p.name}
          </button>
        ))}
      </div>

      {/* ── Context bar ── */}
      <div className="flex items-center gap-2 mb-2" style={{ minHeight: '1.75rem' }}>
        <div className="mono text-xs text-faint">
          {isMapView ? (
            players.length > 0 && `Dorado = ${threshold}+ jugadores disponibles`
          ) : isEditable ? (
            <>Pintando disponibilidad de <span style={{ color: GOLD }}>{activePlayer.name}</span> — clic o arrastra</>
          ) : (
            <span style={{ color: 'var(--red-bright)', fontWeight: 'bold' }}>
              ⚠️ Solo lectura: viendo el horario de {activePlayer.name}
            </span>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      {players.length === 0 ? (
        <div className="empty-state">
          No hay jugadores en tu equipo aún. Usa el botón superior para iniciar sesión o registrarte.
        </div>
      ) : (
        <div className="grid-container">
          <div className="schedule-grid">
            <div />
            {DAYS.map((d) => <div key={d} className="grid-header">{d}</div>)}
            {Array.from({ length: NUM_SLOTS }, (_, i) => (
              <GridRow
                key={i}
                i={i}
                isMapView={isMapView}
                activePlayer={activePlayer}
                countOf={countOf}
                threshold={threshold}
                onCellDown={onCellDown}
                onCellEnter={onCellEnter}
              />
            ))}
          </div>
          {isMapView && (
            <div className="grid-legend">
              <span><span className="grid-legend__swatch" style={{ background: 'rgba(201,170,113,0.35)' }} />Disponibles</span>
              <span><span className="grid-legend__swatch" style={{ background: GOLD }} />{threshold}+ jugadores</span>
            </div>
          )}
        </div>
      )}

      {/* ── Player detail (pool & role edit) ── */}
      {activePlayer && (
        <PlayerDetail
          player={activePlayer}
          champions={champions}
          onRoleChange={(role) => setPlayerRole(activePlayer.id, role)}
          onAddToPool={(champId, tier) => addToPool(activePlayer.id, champId, tier)}
          onRemoveFromPool={(champId) => removeFromPool(activePlayer.id, champId)}
          sessionPlayerId={sessionPlayerId}
        />
      )}

      {/* ── Ventanas del equipo ── */}
      {players.length > 0 && (
        <div className="mt-8">
          <h2 className="section-header text-gold">Ventanas del equipo · {threshold}+ jugadores</h2>
          {windows.length === 0 ? (
            <p className="text-sm text-muted">No hay bloques con {threshold}+ jugadores disponibles a la vez. Ajusta el umbral o completa los horarios.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {windows.map((w, idx) => (
                <div key={idx} className={`window-card ${idx === 0 ? 'window-card--best' : ''}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="window-card__time">
                        {DAYS[w.day]} · {fmt(slotHour(w.start))}–{fmt((slotHour(w.end) + 1) % 24)}
                      </span>
                      <span className="window-card__duration">{w.end - w.start + 1}h seguidas</span>
                    </div>
                    {idx === 0 && <span className="chip chip--gold chip--sm uppercase">Mejor bloque</span>}
                  </div>
                  <WindowRosterLine detail={w.detail} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GRID ROW
   ═══════════════════════════════════════════════════════════════════ */

function GridRow({ i, isMapView, activePlayer, countOf, threshold, onCellDown, onCellEnter }) {
  const h = slotHour(i);
  return (
    <>
      <div className="grid-hour">{fmt(h)}</div>
      {Array.from({ length: 7 }, (_, d) => {
        const key = `${d}-${i}`;
        const n = countOf(key);

        // Player painting mode
        if (!isMapView) {
          const on = !!activePlayer.avail?.[key];
          return (
            <div
              key={key}
              onPointerDown={(e) => onCellDown(e, key)}
              onPointerEnter={() => onCellEnter(key)}
              className="grid-cell"
              style={{
                background: on ? GOLD : 'rgba(148,163,184,0.04)',
                boxShadow: on ? 'inset 0 0 0 1px rgba(255,255,255,0.25)' : 'inset 0 0 0 1px rgba(148,163,184,0.08)',
              }}
            />
          );
        }

        // Map view — single team
        const quorum = n >= threshold;
        const alpha = n === 0 ? 0 : 0.15 + 0.6 * Math.min(1, n / threshold);
        return (
          <div
            key={key}
            title={n > 0 ? `${n} jugador${n === 1 ? '' : 'es'} disponibles` : ''}
            className="grid-cell"
            style={{
              background: quorum ? GOLD : n === 0 ? 'rgba(148,163,184,0.04)' : `rgba(201,170,113,${alpha.toFixed(2)})`,
              boxShadow: quorum ? `inset 0 0 0 1px ${GOLD_BRIGHT}, 0 0 10px rgba(201,170,113,0.5)` : 'inset 0 0 0 1px rgba(148,163,184,0.08)',
            }}
          >
            {n > 0 && (
              <span className="grid-cell__count" style={{ color: quorum ? '#1c1306' : '#f1f5f9' }}>{n}</span>
            )}
          </div>
        );

      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   WINDOW ROSTER LINE
   ═══════════════════════════════════════════════════════════════════ */

function WindowRosterLine({ detail }) {
  return (
    <div className="window-card__roster">
      {detail.full.length > 0
        ? <span className="text-primary">{detail.full.join(', ')}</span>
        : <span className="text-muted">nadie disponible todo el bloque</span>}
      {detail.partial.length > 0 && (
        <span className="text-faint"> · parcial: {detail.partial.join(', ')}</span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER DETAIL (Role + Champion Pool)
   ═══════════════════════════════════════════════════════════════════ */

function PlayerDetail({ player, champions, onRoleChange, onAddToPool, onRemoveFromPool, sessionPlayerId }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const isEditable = sessionPlayerId === player.id;

  return (
    <div className="card mt-4" style={{ borderColor: 'var(--border-gold)' }}>
      <div className="card__header">
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>
            {ROLE_MAP[player.role]?.icon} {player.name}
          </span>
          <span className="chip chip--sm">
            {ROLE_MAP[player.role]?.name || player.role}
          </span>
          {!isEditable && (
            <span className="text-[10px]" style={{ color: 'var(--red-bright)' }}>
              (Solo lectura)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-faint">Rol:</span>
          {isEditable ? (
            <select
              className="input btn--sm"
              value={player.role}
              onChange={(e) => onRoleChange(e.target.value)}
              style={{ width: 'auto', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem' }}
            >
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
            </select>
          ) : (
            <span className="chip chip--sm" style={{ fontSize: '0.7rem' }}>
              {ROLE_MAP[player.role]?.name || player.role}
            </span>
          )}
        </div>
      </div>

      {/* Champion Pool */}
      <div className="pool-section">
        <div className="pool-section__title">Champion Pool — Comfort</div>
        <div className="pool-grid">
          {(player.pool || []).filter((c) => c.tier === 'comfort').map((c) => (
            <div key={c.championId} className="pool-champ">
              {champions?.[c.championId] && (
                <ChampionIcon champId={c.championId} champions={champions} size="sm" />
              )}
              <span>{champions?.[c.championId]?.name || c.championId}</span>
              {isEditable && (
                <button className="pool-champ__remove" onClick={() => onRemoveFromPool(c.championId)}>✕</button>
              )}
            </div>
          ))}
          {isEditable && (
            <button className="btn btn--ghost btn--sm" onClick={() => setSearchOpen('comfort')}>+ Añadir</button>
          )}
        </div>
      </div>
      <div className="pool-section">
        <div className="pool-section__title">Pocket Picks</div>
        <div className="pool-grid">
          {(player.pool || []).filter((c) => c.tier === 'pocket').map((c) => (
            <div key={c.championId} className="pool-champ">
              {champions?.[c.championId] && (
                <ChampionIcon champId={c.championId} champions={champions} size="sm" />
              )}
              <span>{champions?.[c.championId]?.name || c.championId}</span>
              {isEditable && (
                <button className="pool-champ__remove" onClick={() => onRemoveFromPool(c.championId)}>✕</button>
              )}
            </div>
          ))}
          {isEditable && (
            <button className="btn btn--ghost btn--sm" onClick={() => setSearchOpen('pocket')}>+ Añadir</button>
          )}
        </div>
      </div>

      {isEditable && searchOpen && (
        <div className="mt-2">
          <ChampionSearch
            champions={champions}
            onSelect={(id) => { onAddToPool(id, searchOpen); setSearchOpen(false); }}
            onClose={() => setSearchOpen(false)}
            exclude={(player.pool || []).map((c) => c.championId)}
          />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CHAMPION ICON
   ═══════════════════════════════════════════════════════════════════ */

function ChampionIcon({ champId, champions, size = 'md', circle = false, borderColor }) {
  const champ = champions?.[champId];
  const cls = `champion-icon champion-icon--${size} ${circle ? 'champion-icon--circle' : ''} ${borderColor ? 'champion-icon--bordered' : ''}`;
  return (
    <div className={cls} style={borderColor ? { borderColor } : {}}>
      {champ ? (
        <img src={champ.icon} alt={champ.name} loading="lazy" />
      ) : (
        <div className="flex items-center justify-center w-full" style={{ height: '100%', fontSize: '0.6rem', color: 'var(--text-faint)' }}>?</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CHAMPION SEARCH
   ═══════════════════════════════════════════════════════════════════ */

function ChampionSearch({ champions, onSelect, onClose, exclude = [] }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!champions) return [];
    const q = query.toLowerCase();
    return Object.values(champions)
      .filter((c) => !exclude.includes(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 20);
  }, [champions, query, exclude]);

  return (
    <div className="champion-search">
      <div className="flex gap-2 items-center">
        <input
          ref={inputRef}
          className="input w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar campeón…"
          style={{ borderRadius: 'var(--radius-md)' }}
        />
        <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
      </div>
      {filtered.length > 0 && (
        <div className="champion-search__dropdown">
          {filtered.map((c) => (
            <button key={c.id} className="champion-search__item" onClick={() => onSelect(c.id)}>
              <ChampionIcon champId={c.id} champions={champions} size="sm" />
              <span>{c.name}</span>
              <span className="champion-search__item-tags">{c.tags.join(', ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   COMPOSITIONS TAB
   ═══════════════════════════════════════════════════════════════════ */

function CompsTab({ comps, setComps, drafts, setDrafts, players, champions, sessionPlayerId }) {
  const [subTab, setSubTab] = useState('comps'); // comps | drafts
  const [editingCompId, setEditingCompId] = useState(null); // null | id
  const [editingDraftId, setEditingDraftId] = useState(null); // null | id
  const isSpectator = sessionPlayerId === 'spectator';

  /* --- Compositions Management --- */
  const addComp = (team) => {
    if (isSpectator) return;
    const newComp = {
      id: `comp_${uid()}`,
      name: `Comp Nueva ${team === 'azul' ? 'Azul' : 'Roja'}`,
      team: team,
      styles: [],
      slots: { top: '', jg: '', mid: '', adc: '', sup: '' },
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setComps((cs) => [newComp, ...cs]);
    setEditingCompId(newComp.id);
  };

  const updateComp = (id, updates) => {
    if (isSpectator) return;
    setComps((cs) => cs.map((c) => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c));
  };

  const deleteComp = (id) => {
    if (isSpectator) return;
    setComps((cs) => cs.filter((c) => c.id !== id));
    if (editingCompId === id) setEditingCompId(null);
  };

  const duplicateComp = (comp) => {
    if (isSpectator) return;
    const dup = { ...comp, id: `comp_${uid()}`, name: `${comp.name} (copia)`, createdAt: Date.now(), updatedAt: Date.now(), slots: { ...comp.slots }, styles: [...comp.styles] };
    setComps((cs) => [dup, ...cs]);
  };

  /* --- Drafts Management --- */
  const addDraft = () => {
    if (isSpectator) return;
    const newDraft = {
      id: `draft_${uid()}`,
      name: 'Nuevo Draft de Scrim',
      bluePicks: { top: '', jg: '', mid: '', adc: '', sup: '' },
      redPicks: { top: '', jg: '', mid: '', adc: '', sup: '' },
      blueBans: ['', '', '', '', ''],
      redBans: ['', '', '', '', ''],
      notes: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setDrafts((ds) => [newDraft, ...ds]);
    setEditingDraftId(newDraft.id);
  };

  const updateDraft = (id, updates) => {
    if (isSpectator) return;
    setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d));
  };

  const deleteDraft = (id) => {
    if (isSpectator) return;
    setDrafts((ds) => ds.filter((d) => d.id !== id));
    if (editingDraftId === id) setEditingDraftId(null);
  };

  /* --- Render checks --- */
  if (editingCompId) {
    const comp = comps.find((c) => c.id === editingCompId);
    if (comp) {
      return (
        <CompEditor
          comp={comp}
          champions={champions}
          players={players}
          onUpdate={(updates) => updateComp(comp.id, updates)}
          onDone={() => setEditingCompId(null)}
          onDelete={() => deleteComp(comp.id)}
        />
      );
    }
  }

  if (editingDraftId) {
    const draft = drafts.find((d) => d.id === editingDraftId);
    if (draft) {
      return (
        <DraftEditor
          draft={draft}
          champions={champions}
          players={players}
          onUpdate={(updates) => updateDraft(draft.id, updates)}
          onDone={() => setEditingDraftId(null)}
          onDelete={() => deleteDraft(draft.id)}
        />
      );
    }
  }

  const blueComps = comps.filter((c) => c.team === 'azul');
  const redComps = comps.filter((c) => c.team === 'rojo');

  return (
    <div>
      {/* Subtab Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="toggle-group">
          <button
            className={`toggle-group__btn ${subTab === 'comps' ? 'toggle-group__btn--active' : ''}`}
            style={subTab === 'comps' ? { background: GOLD, color: '#0b1220' } : {}}
            onClick={() => setSubTab('comps')}
          >
            📋 Composiciones por Equipo
          </button>
          <button
            className={`toggle-group__btn ${subTab === 'drafts' ? 'toggle-group__btn--active' : ''}`}
            style={subTab === 'drafts' ? { background: GOLD, color: '#0b1220' } : {}}
            onClick={() => setSubTab('drafts')}
          >
            ⚔️ Planificador de Draft (Picks & Bans)
          </button>
        </div>
        {subTab === 'drafts' && !isSpectator && (
          <button className="btn btn--gold" onClick={addDraft}>+ Nuevo Draft</button>
        )}
      </div>

      {/* Compositions Subtab (Two-column Team split) */}
      {subTab === 'comps' && (
        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {/* Blue team column */}
          <div className="card card--blue" style={{ borderTop: '4px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card__header" style={{ borderBottom: '1px solid var(--blue-border)', paddingBottom: '0.5rem' }}>
              <span className="card__title font-semibold text-lg" style={{ color: 'var(--blue-text)', fontFamily: 'var(--font-display)' }}>🔵 Equipo Azul</span>
              {!isSpectator && (
                <button className="btn btn--blue btn--sm" onClick={() => addComp('azul')}>+ Nueva Comp Azul</button>
              )}
            </div>
            {blueComps.length === 0 ? (
              <div className="text-center text-muted py-6 text-sm">No hay composiciones del Equipo Azul.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {blueComps.map((comp) => (
                  <CompCard
                    key={comp.id}
                    comp={comp}
                    champions={champions}
                    onEdit={() => setEditingCompId(comp.id)}
                    onDuplicate={() => duplicateComp(comp)}
                    onDelete={() => deleteComp(comp.id)}
                    isSpectator={isSpectator}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Red team column */}
          <div className="card card--red" style={{ borderTop: '4px solid var(--red)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="card__header" style={{ borderBottom: '1px solid var(--red-border)', paddingBottom: '0.5rem' }}>
              <span className="card__title font-semibold text-lg" style={{ color: 'var(--red-text)', fontFamily: 'var(--font-display)' }}>🔴 Equipo Rojo</span>
              {!isSpectator && (
                <button className="btn btn--red btn--sm" onClick={() => addComp('rojo')}>+ Nueva Comp Roja</button>
              )}
            </div>
            {redComps.length === 0 ? (
              <div className="text-center text-muted py-6 text-sm">No hay composiciones del Equipo Rojo.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {redComps.map((comp) => (
                  <CompCard
                    key={comp.id}
                    comp={comp}
                    champions={champions}
                    onEdit={() => setEditingCompId(comp.id)}
                    onDuplicate={() => duplicateComp(comp)}
                    onDelete={() => deleteComp(comp.id)}
                    isSpectator={isSpectator}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drafts Subtab */}
      {subTab === 'drafts' && (
        <div>
          {drafts.length === 0 ? (
            <div className="empty-state">
              No hay borradores de draft guardados. ¡Crea el primero!
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  champions={champions}
                  onEdit={() => setEditingDraftId(draft.id)}
                  onDelete={() => deleteDraft(draft.id)}
                  isSpectator={isSpectator}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Comp Card ─── */
function CompCard({ comp, champions, onEdit, onDuplicate, onDelete, isSpectator }) {
  const T = TEAMS[comp.team];
  return (
    <div className="comp-card" style={{ borderColor: T?.border, background: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="font-semibold text-sm" style={{ color: T?.text }}>{comp.name || 'Sin nombre'}</span>
        {!isSpectator && (
          <div className="flex gap-1">
            <button className="btn btn--ghost btn--sm" onClick={onEdit}>✏️</button>
            <button className="btn btn--ghost btn--sm" onClick={onDuplicate}>📋</button>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>🗑️</button>
          </div>
        )}
      </div>
      <div className="comp-card__champions">
        {ROLES.map((role) => (
          <div key={role.id} className="flex flex-col items-center gap-1">
            <ChampionIcon
              champId={comp.slots[role.id]}
              champions={champions}
              size="md"
              borderColor={comp.slots[role.id] ? T?.color : undefined}
            />
            <span className="mono text-[8px] text-muted">{role.short}</span>
          </div>
        ))}
      </div>
      {comp.styles?.length > 0 && (
        <div className="comp-card__styles">
          {comp.styles.map((s) => <span key={s} className="chip chip--gold chip--sm">{s}</span>)}
        </div>
      )}
      {comp.notes && <p className="text-xs text-muted mt-2 border-t border-light pt-2">{comp.notes}</p>}
    </div>
  );
}

/* ─── Comp Editor ─── */
function CompEditor({ comp, champions, players, onUpdate, onDone, onDelete }) {
  const [editingSlot, setEditingSlot] = useState(null); // role id

  const toggleStyle = (style) => {
    const styles = comp.styles.includes(style)
      ? comp.styles.filter((s) => s !== style)
      : [...comp.styles, style];
    onUpdate({ styles });
  };

  const setSlot = (role, champId) => {
    onUpdate({ slots: { ...comp.slots, [role]: champId } });
    setEditingSlot(null);
  };

  const isInPool = (champId) => {
    return players.some((p) => p.team === comp.team && p.pool?.some((c) => c.championId === champId));
  };

  const T = TEAMS[comp.team];

  return (
    <div className="comp-editor" style={{ borderColor: T?.color }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-header text-gold mb-0">Editar Composición ({T?.name})</h2>
        <div className="flex gap-2">
          <button className="btn btn--danger btn--sm" onClick={onDelete}>🗑️ Eliminar</button>
          <button className="btn btn--gold btn--sm" onClick={onDone}>✓ Listo</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <label className="text-xs text-faint">Nombre de la composición</label>
          <input
            className="input input--rect"
            value={comp.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Ej: Wombo Combo, Poke de Asedio..."
          />
        </div>
      </div>

      {/* Slots */}
      <div className="comp-slots" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))' }}>
        {ROLES.map((role) => {
          const slotVal = comp.slots[role.id];
          return (
            <div
              key={role.id}
              className={`comp-slot ${slotVal ? 'comp-slot--filled' : ''} ${editingSlot === role.id ? 'active-slot' : ''}`}
              style={{
                border: editingSlot === role.id ? '1px solid var(--gold-bright)' : '1px solid var(--border)',
                background: editingSlot === role.id ? 'var(--bg-hover)' : 'var(--bg-primary)',
                padding: '0.75rem',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'pointer',
                gap: '0.25rem'
              }}
              onClick={() => setEditingSlot(editingSlot === role.id ? null : role.id)}
            >
              <span className="comp-slot__role text-xs font-semibold">{role.icon} {role.short}</span>
              {slotVal ? (
                <>
                  <ChampionIcon champId={slotVal} champions={champions} size="xl" borderColor={T?.color} />
                  <span className="text-[10px] text-center font-bold text-primary truncate max-w-full">{champions?.[slotVal]?.name || slotVal}</span>
                  {isInPool(slotVal) && <span className="chip chip--green chip--sm">✓ Pool</span>}
                </>
              ) : (
                <span className="comp-slot__empty text-muted" style={{ fontSize: '1.5rem', fontWeight: 200 }}>+</span>
              )}
            </div>
          );
        })}
      </div>

      {editingSlot && (
        <div className="mt-3 card" style={{ padding: '0.75rem' }}>
          <ChampionSearch
            champions={champions}
            exclude={Object.values(comp.slots).filter(Boolean)}
            onSelect={(id) => setSlot(editingSlot, id)}
            onClose={() => setEditingSlot(null)}
          />
        </div>
      )}

      {/* Styles */}
      <div className="mb-3 mt-4">
        <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Estilos estratégicos</label>
        <div className="style-tags">
          {COMP_STYLES.map((s) => (
            <button
              key={s}
              className={`style-tag ${comp.styles?.includes(s) ? 'style-tag--active' : ''}`}
              onClick={() => toggleStyle(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Notas tácticas y Win Conditions</label>
        <textarea
          className="textarea"
          value={comp.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="Ej: Control de dragones, powerspikes de nivel 6, forzar peleas de equipo..."
        />
      </div>
    </div>
  );
}

/* ─── Draft Card ─── */
function DraftCard({ draft, champions, onEdit, onDelete, isSpectator }) {
  return (
    <div className="comp-card" style={{ borderColor: 'var(--border-gold)', background: 'var(--bg-secondary)', padding: '1rem', borderTop: '4px solid var(--gold-primary)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <span className="font-semibold text-gold text-base" style={{ fontFamily: 'var(--font-display)' }}>{draft.name || 'Draft sin nombre'}</span>
          <span className="text-xs text-muted block">{new Date(draft.createdAt).toLocaleDateString()} · {new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {!isSpectator && (
          <div className="flex gap-1">
            <button className="btn btn--ghost btn--sm" onClick={onEdit}>✏️ Editar</button>
            <button className="btn btn--danger btn--sm" onClick={onDelete}>🗑️</button>
          </div>
        )}
      </div>
      
      {/* Visual comparison row */}
      <div className="flex items-center justify-between gap-4 py-3 border-t border-b border-light" style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-lg)' }}>
        {/* Blue picks */}
        <div className="flex gap-1.5">
          {ROLES.map((r) => (
            <div key={r.id} title={`Azul ${r.name}`}>
              <ChampionIcon champId={draft.bluePicks?.[r.id]} champions={champions} size="lg" borderColor="var(--blue)" />
            </div>
          ))}
        </div>
        <div className="text-xs font-mono text-gold font-bold" style={{ letterSpacing: '0.1em' }}>VS</div>
        {/* Red picks */}
        <div className="flex gap-1.5">
          {ROLES.map((r) => (
            <div key={r.id} title={`Rojo ${r.name}`}>
              <ChampionIcon champId={draft.redPicks?.[r.id]} champions={champions} size="lg" borderColor="var(--red)" />
            </div>
          ))}
        </div>
      </div>

      {/* Bans preview */}
      <div className="flex flex-wrap justify-between items-center mt-3 text-xs mono text-faint">
        <div style={{ color: 'var(--blue-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>Bans 🔵:</span>
          {draft.blueBans?.some(Boolean) ? (
            draft.blueBans.map((b, idx) => b ? (
              <span key={idx} className="chip chip--sm chip--blue" style={{ fontSize: '0.6rem' }}>{champions?.[b]?.name || b}</span>
            ) : null)
          ) : (
            <span className="text-muted italic">Ninguno</span>
          )}
        </div>
        <div style={{ color: 'var(--red-text)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>Bans 🔴:</span>
          {draft.redBans?.some(Boolean) ? (
            draft.redBans.map((b, idx) => b ? (
              <span key={idx} className="chip chip--sm chip--red" style={{ fontSize: '0.6rem' }}>{champions?.[b]?.name || b}</span>
            ) : null)
          ) : (
            <span className="text-muted italic">Ninguno</span>
          )}
        </div>
      </div>

      {draft.notes && <p className="text-xs text-muted mt-2 pt-2 border-t border-light">{draft.notes}</p>}
    </div>
  );
}

/* ─── Draft Editor ─── */
function DraftEditor({ draft, champions, players, onUpdate, onDone, onDelete }) {
  // activeSlot defines which pick/ban we are currently selecting for.
  // format: { type: 'pick' | 'ban', team: 'azul' | 'rojo', id: string (role) | number (index) }
  const [activeSlot, setActiveSlot] = useState({ type: 'pick', team: 'azul', id: 'top' });
  const [searchQuery, setSearchQuery] = useState('');

  const setSlot = (champId) => {
    if (activeSlot.type === 'pick') {
      const picksKey = activeSlot.team === 'azul' ? 'bluePicks' : 'redPicks';
      onUpdate({
        [picksKey]: { ...draft[picksKey], [activeSlot.id]: champId }
      });
      // Move to next pick slot automatically
      const nextRoleIdx = ROLES.findIndex(r => r.id === activeSlot.id);
      if (nextRoleIdx < 4) {
        setActiveSlot({ type: 'pick', team: activeSlot.team, id: ROLES[nextRoleIdx + 1].id });
      } else if (activeSlot.team === 'azul') {
        setActiveSlot({ type: 'pick', team: 'rojo', id: 'top' });
      }
    } else {
      const bansKey = activeSlot.team === 'azul' ? 'blueBans' : 'redBans';
      const newBans = [...(draft[bansKey] || ['', '', '', '', ''])];
      newBans[activeSlot.id] = champId;
      onUpdate({ [bansKey]: newBans });
      // Move to next ban slot automatically
      if (activeSlot.id < 4) {
        setActiveSlot({ type: 'ban', team: activeSlot.team, id: activeSlot.id + 1 });
      } else if (activeSlot.team === 'azul') {
        setActiveSlot({ type: 'ban', team: 'rojo', id: 0 });
      } else {
        setActiveSlot({ type: 'pick', team: 'azul', id: 'top' });
      }
    }
  };

  const getSlotChamp = (type, team, id) => {
    if (type === 'pick') {
      return team === 'azul' ? draft.bluePicks?.[id] : draft.redPicks?.[id];
    } else {
      return (team === 'azul' ? draft.blueBans : draft.redBans)?.[id];
    }
  };

  const getPlayerForRole = (team, roleId) => {
    return players.find((p) => p.team === team && p.role === roleId);
  };

  const getExcludedChamps = () => {
    const list = [];
    if (draft.bluePicks) Object.values(draft.bluePicks).forEach(v => v && list.push(v));
    if (draft.redPicks) Object.values(draft.redPicks).forEach(v => v && list.push(v));
    if (draft.blueBans) draft.blueBans.forEach(v => v && list.push(v));
    if (draft.redBans) draft.redBans.forEach(v => v && list.push(v));
    return list;
  };

  const filteredChamps = useMemo(() => {
    if (!champions) return [];
    const q = searchQuery.toLowerCase();
    const exclude = getExcludedChamps();
    return Object.values(champions)
      .filter((c) => !exclude.includes(c.id) || getSlotChamp(activeSlot.type, activeSlot.team, activeSlot.id) === c.id)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, searchQuery, draft, activeSlot]);

  const T_blue = TEAMS.azul;
  const T_red = TEAMS.rojo;

  return (
    <div className="comp-editor" style={{ borderColor: 'var(--gold-primary)', background: 'var(--bg-secondary)' }}>
      {/* Editor Header */}
      <div className="draft-editor-header flex items-center justify-between mb-4 flex-wrap gap-2">
        <div style={{ flex: 1 }}>
          <h2 className="section-header text-gold mb-0" style={{ fontSize: '1.25rem' }}>Draft Planificador de Scrim</h2>
          <input
            className="draft-name-input input input--rect text-sm font-semibold mt-1"
            value={draft.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Nombre del Draft (Ej: Scrim vs Team X - Game 1)"
            style={{ minWidth: '300px', background: 'var(--bg-primary)' }}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn--danger btn--sm" onClick={onDelete}>🗑️ Eliminar</button>
          <button className="btn btn--gold btn--sm" onClick={onDone}>✓ Guardar y Salir</button>
        </div>
      </div>

      {/* Bans Row */}
      <div className="card mb-4" style={{ background: 'var(--bg-primary)', borderColor: 'rgba(201, 170, 113, 0.15)', padding: '0.75rem' }}>
        <div className="bans-row flex justify-between items-center gap-4">
          {/* Blue Bans */}
          <div className="flex items-center gap-2">
            <span className="mono text-xs font-semibold" style={{ color: 'var(--blue-text)' }}>BANS 🔵:</span>
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, idx) => {
                const bChamp = draft.blueBans?.[idx];
                const isActive = activeSlot.type === 'ban' && activeSlot.team === 'azul' && activeSlot.id === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setActiveSlot({ type: 'ban', team: 'azul', id: idx })}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: isActive ? '2px solid var(--gold-bright)' : '1px dashed var(--blue-border)',
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {bChamp ? (
                      <ChampionIcon champId={bChamp} champions={champions} size="sm" />
                    ) : (
                      <span className="text-muted text-[10px]">{idx + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Red Bans */}
          <div className="flex items-center gap-2">
            <span className="mono text-xs font-semibold" style={{ color: 'var(--red-text)' }}>BANS 🔴:</span>
            <div className="flex gap-1.5">
              {Array.from({ length: 5 }).map((_, idx) => {
                const rChamp = draft.redBans?.[idx];
                const isActive = activeSlot.type === 'ban' && activeSlot.team === 'rojo' && activeSlot.id === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setActiveSlot({ type: 'ban', team: 'rojo', id: idx })}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: isActive ? '2px solid var(--gold-bright)' : '1px dashed var(--red-border)',
                      background: isActive ? 'var(--bg-hover)' : 'transparent',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {rChamp ? (
                      <ChampionIcon champId={rChamp} champions={champions} size="sm" />
                    ) : (
                      <span className="text-muted text-[10px]">{idx + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Board: Blue Picks | Center Selection | Red Picks */}
      <div className="draft-board">
        {/* Blue Team Picks */}
        <div className="draft-board__blue" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="flex items-center justify-between pb-1 border-b border-light">
            <span className="font-bold text-sm" style={{ color: 'var(--blue-text)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>🔵 {T_blue.name}</span>
            <span className="text-[10px] text-muted uppercase tracking-wider">Selección</span>
          </div>

          {ROLES.map((role) => {
            const pChamp = draft.bluePicks?.[role.id];
            const player = getPlayerForRole('azul', role.id);
            const isActive = activeSlot.type === 'pick' && activeSlot.team === 'azul' && activeSlot.id === role.id;
            return (
              <div
                key={role.id}
                onClick={() => setActiveSlot({ type: 'pick', team: 'azul', id: role.id })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem',
                  borderRadius: 'var(--radius-lg)',
                  border: isActive ? '2px solid var(--gold-bright)' : '1px solid var(--blue-border)',
                  background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-primary)',
                  boxShadow: isActive ? '0 0 10px rgba(201,170,113,0.15)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' }}>
                  <span className="text-lg leading-none">{role.icon}</span>
                  <span className="mono text-[8px] text-muted mt-1 uppercase">{role.short}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-1.5">
                    {pChamp ? (
                      <span className="font-bold text-sm text-primary truncate">{champions?.[pChamp]?.name || pChamp}</span>
                    ) : (
                      <span className="text-sm text-muted italic">Seleccionar...</span>
                    )}
                  </div>
                  <span className="text-[10px] text-faint truncate">
                    {player ? `Jugador: ${player.name}` : 'Sin jugador asignado'}
                  </span>

                  {/* Champion Pool quick buttons */}
                  {player && player.pool?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {player.pool.map((c) => (
                        <button
                          key={c.championId}
                          title={`${champions?.[c.championId]?.name || c.championId} (${c.tier})`}
                          onClick={() => {
                            setActiveSlot({ type: 'pick', team: 'azul', id: role.id });
                            setSlot(c.championId);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            opacity: pChamp === c.championId ? 1 : 0.65,
                            transform: pChamp === c.championId ? 'scale(1.15)' : 'none'
                          }}
                        >
                          <ChampionIcon
                            champId={c.championId}
                            champions={champions}
                            size="sm"
                            circle
                            borderColor={c.tier === 'comfort' ? 'var(--gold-bright)' : 'var(--blue-bright)'}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <ChampionIcon champId={pChamp} champions={champions} size="xl" borderColor={pChamp ? 'var(--blue)' : undefined} />
              </div>
            );
          })}
        </div>

        {/* Center Panel (Champion Selector Grid) */}
        <div className="draft-board__selector card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-primary)' }}>
          <div className="flex items-center justify-between pb-1 border-b border-light">
            <span className="mono text-[10px] uppercase text-gold font-bold">
              {activeSlot.type === 'pick'
                ? `Pick ${activeSlot.team === 'azul' ? 'Azul' : 'Rojo'} - ${activeSlot.id.toUpperCase()}`
                : `Ban ${activeSlot.team === 'azul' ? 'Azul' : 'Rojo'} - #${activeSlot.id + 1}`}
            </span>
            <button
              className="btn btn--outline btn--sm text-[10px] px-1 py-0.5"
              onClick={() => {
                if (activeSlot.type === 'pick') {
                  const picksKey = activeSlot.team === 'azul' ? 'bluePicks' : 'redPicks';
                  onUpdate({ [picksKey]: { ...draft[picksKey], [activeSlot.id]: '' } });
                } else {
                  const bansKey = activeSlot.team === 'azul' ? 'blueBans' : 'redBans';
                  const newBans = [...(draft[bansKey] || ['', '', '', '', ''])];
                  newBans[activeSlot.id] = '';
                  onUpdate({ [bansKey]: newBans });
                }
              }}
            >
              Borrar
            </button>
          </div>

          <input
            className="input text-xs w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar campeón..."
            style={{ borderRadius: 'var(--radius-md)', padding: '0.35rem 0.625rem' }}
          />

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '380px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.375rem',
              paddingRight: '0.25rem'
            }}
          >
            {filteredChamps.map((champ) => {
              const isSelected = getSlotChamp(activeSlot.type, activeSlot.team, activeSlot.id) === champ.id;
              return (
                <button
                  key={champ.id}
                  onClick={() => setSlot(champ.id)}
                  title={champ.name}
                  style={{
                    background: isSelected ? 'var(--gold-glow)' : 'var(--bg-secondary)',
                    border: isSelected ? '1px solid var(--gold-bright)' : '1px solid transparent',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.25rem',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.125rem',
                    transition: 'all 0.1s ease'
                  }}
                >
                  <ChampionIcon champId={champ.id} champions={champions} size="md" />
                  <span
                    className="truncate text-[9px] w-full text-center"
                    style={{ color: isSelected ? 'var(--gold-bright)' : 'var(--text-secondary)' }}
                  >
                    {champ.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Red Team Picks */}
        <div className="draft-board__red" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="flex items-center justify-between pb-1 border-b border-light">
            <span className="text-[10px] text-muted uppercase tracking-wider">Selección</span>
            <span className="font-bold text-sm" style={{ color: 'var(--red-text)', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>🔴 {T_red.name}</span>
          </div>

          {ROLES.map((role) => {
            const pChamp = draft.redPicks?.[role.id];
            const player = getPlayerForRole('rojo', role.id);
            const isActive = activeSlot.type === 'pick' && activeSlot.team === 'rojo' && activeSlot.id === role.id;
            return (
              <div
                key={role.id}
                onClick={() => setActiveSlot({ type: 'pick', team: 'rojo', id: role.id })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem',
                  borderRadius: 'var(--radius-lg)',
                  border: isActive ? '2px solid var(--gold-bright)' : '1px solid var(--red-border)',
                  background: isActive ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-primary)',
                  boxShadow: isActive ? '0 0 10px rgba(201,170,113,0.15)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <ChampionIcon champId={pChamp} champions={champions} size="xl" borderColor={pChamp ? 'var(--red)' : undefined} />

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-1.5">
                    {pChamp ? (
                      <span className="font-bold text-sm text-primary truncate">{champions?.[pChamp]?.name || pChamp}</span>
                    ) : (
                      <span className="text-sm text-muted italic">Seleccionar...</span>
                    )}
                  </div>
                  <span className="text-[10px] text-faint truncate">
                    {player ? `Jugador: ${player.name}` : 'Sin jugador asignado'}
                  </span>

                  {/* Champion Pool quick buttons */}
                  {player && player.pool?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {player.pool.map((c) => (
                        <button
                          key={c.championId}
                          title={`${champions?.[c.championId]?.name || c.championId} (${c.tier})`}
                          onClick={() => {
                            setActiveSlot({ type: 'pick', team: 'rojo', id: role.id });
                            setSlot(c.championId);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            opacity: pChamp === c.championId ? 1 : 0.65,
                            transform: pChamp === c.championId ? 'scale(1.15)' : 'none'
                          }}
                        >
                          <ChampionIcon
                            champId={c.championId}
                            champions={champions}
                            size="sm"
                            circle
                            borderColor={c.tier === 'comfort' ? 'var(--gold-bright)' : 'var(--red-bright)'}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px' }}>
                  <span className="text-lg leading-none">{role.icon}</span>
                  <span className="mono text-[8px] text-muted mt-1 uppercase">{role.short}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Notas de Draft y Análisis del Enfrentamiento</label>
        <textarea
          className="textarea"
          value={draft.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          placeholder="Ej: Proteger el primer pick, bans dirigidos a sus confort picks, explotar emparejamiento favorable en mid lane..."
          style={{ minHeight: '80px' }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCRIMS TAB
   ═══════════════════════════════════════════════════════════════════ */

function ScrimsTab({ scrims, setScrims, comps, sessionPlayerId }) {
  const [editing, setEditing] = useState(null);
  const isSpectator = sessionPlayerId === 'spectator';

  const addScrim = () => {
    if (isSpectator) return;
    const newScrim = {
      id: `scrim_${uid()}`,
      date: new Date().toISOString().slice(0, 10),
      time: '20:00',
      compAzul: '',
      compRojo: '',
      winner: '',
      rating: 0,
      notes: '',
      tags: [],
      createdAt: Date.now(),
    };
    setScrims((ss) => [newScrim, ...ss]);
    setEditing(newScrim.id);
  };

  const updateScrim = (id, updates) => {
    if (isSpectator) return;
    setScrims((ss) => ss.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteScrim = (id) => {
    if (isSpectator) return;
    setScrims((ss) => ss.filter((s) => s.id !== id));
    if (editing === id) setEditing(null);
  };

  const editingScrim = scrims.find((s) => s.id === editing);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="section-header text-gold mb-0">Historial de Scrims</h2>
        {!isSpectator && (
          <button className="btn btn--gold" onClick={addScrim}>+ Nuevo Scrim</button>
        )}
      </div>

      {editingScrim && (
        <div className="comp-editor mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-primary">Editar Scrim</h3>
            <div className="flex gap-2">
              <button className="btn btn--danger btn--sm" onClick={() => deleteScrim(editingScrim.id)}>🗑️</button>
              <button className="btn btn--gold btn--sm" onClick={() => setEditing(null)}>✓ Listo</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-faint">Fecha</label>
              <input
                className="input input--rect"
                type="date"
                value={editingScrim.date}
                onChange={(e) => updateScrim(editingScrim.id, { date: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-faint">Hora</label>
              <input
                className="input input--rect"
                type="time"
                value={editingScrim.time}
                onChange={(e) => updateScrim(editingScrim.id, { time: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-faint">Resultado</label>
              <div className="toggle-group">
                {[['', '—'], ['azul', '🔵 Azul'], ['rojo', '🔴 Rojo']].map(([v, label]) => (
                  <button
                    key={v}
                    className={`toggle-group__btn ${editingScrim.winner === v ? 'toggle-group__btn--active' : ''}`}
                    style={editingScrim.winner === v && v ? { background: TEAMS[v]?.color || GOLD, color: '#0b1220' } : {}}
                    onClick={() => updateScrim(editingScrim.id, { winner: v })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-faint">Comp Azul</label>
              <select
                className="input input--rect"
                value={editingScrim.compAzul}
                onChange={(e) => updateScrim(editingScrim.id, { compAzul: e.target.value })}
              >
                <option value="">— Sin comp —</option>
                {comps.filter((c) => c.team === 'azul').map((c) => (
                  <option key={c.id} value={c.id}>{c.name || 'Sin nombre'}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-faint">Comp Rojo</label>
              <select
                className="input input--rect"
                value={editingScrim.compRojo}
                onChange={(e) => updateScrim(editingScrim.id, { compRojo: e.target.value })}
              >
                <option value="">— Sin comp —</option>
                {comps.filter((c) => c.team === 'rojo').map((c) => (
                  <option key={c.id} value={c.id}>{c.name || 'Sin nombre'}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Rating</label>
            <StarRating value={editingScrim.rating} onChange={(v) => updateScrim(editingScrim.id, { rating: v })} />
          </div>
          <div className="mb-3">
            <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Tags</label>
            <div className="style-tags">
              {SCRIM_TAGS.map((t) => (
                <button
                  key={t}
                  className={`style-tag ${editingScrim.tags?.includes(t) ? 'style-tag--active' : ''}`}
                  onClick={() => {
                    const tags = editingScrim.tags?.includes(t)
                      ? editingScrim.tags.filter((x) => x !== t)
                      : [...(editingScrim.tags || []), t];
                    updateScrim(editingScrim.id, { tags });
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-faint mb-1" style={{ display: 'block' }}>Notas</label>
            <textarea
              className="textarea"
              value={editingScrim.notes}
              onChange={(e) => updateScrim(editingScrim.id, { notes: e.target.value })}
              placeholder="¿Qué se practicó? ¿Qué salió bien/mal? Puntos de mejora..."
            />
          </div>
        </div>
      )}

      {scrims.length === 0 ? (
        <div className="empty-state">
          No hay scrims registrados. ¡Registra tu primer scrim!
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {scrims.map((scrim) => {
            const compA = comps.find((c) => c.id === scrim.compAzul);
            const compR = comps.find((c) => c.id === scrim.compRojo);
            return (
              <div key={scrim.id} className="scrim-card" onClick={() => !isSpectator && setEditing(scrim.id)} style={{ cursor: isSpectator ? 'default' : 'pointer' }}>
                <div className="scrim-card__header">
                  <div className="flex items-center gap-2">
                    <span className="scrim-card__date">{scrim.date} · {scrim.time}</span>
                    {scrim.winner && (
                      <span className={`chip chip--sm chip--${scrim.winner === 'azul' ? 'blue' : 'red'}`}>
                        Victoria {TEAMS[scrim.winner]?.short}
                      </span>
                    )}
                  </div>
                  <StarRating value={scrim.rating} onChange={() => {}} readonly />
                </div>
                {(compA || compR) && (
                  <div className="scrim-card__comps">
                    {compA && <span className="chip chip--blue chip--sm">🔵 {compA.name || 'Comp'}</span>}
                    {compR && <span className="chip chip--red chip--sm">🔴 {compR.name || 'Comp'}</span>}
                  </div>
                )}
                {scrim.tags?.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {scrim.tags.map((t) => <span key={t} className="chip chip--gold chip--sm">{t}</span>)}
                  </div>
                )}
                {scrim.notes && <p className="scrim-card__notes">{scrim.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Star Rating ─── */

function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={`star-rating__star ${(hover || value) >= star ? 'star-rating__star--filled' : 'star-rating__star--empty'}`}
          onClick={(e) => { e.stopPropagation(); if (!readonly) onChange(star); }}
          onMouseEnter={() => !readonly && setHover(star)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{ cursor: readonly ? 'default' : 'pointer' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   STATS TAB
   ═══════════════════════════════════════════════════════════════════ */

function StatsTab({ players, cellData, countOf, threshold, comps, scrims }) {
  const stats = useMemo(() => {
    const result = {};

    // Total hours available
    let totalHours = 0;
    for (const p of players) totalHours += Object.keys(p.avail || {}).length;
    result.totalHours = totalHours;

    // Most/least available
    let most = null, least = null;
    for (const p of players) {
      const h = Object.keys(p.avail || {}).length;
      if (!most || h > Object.keys(most.avail || {}).length) most = p;
      if (!least || h < Object.keys(least.avail || {}).length) least = p;
    }
    result.mostAvailable = most;
    result.leastAvailable = least;

    // Peak hour — hour with most players available
    const hourCounts = {};
    for (let i = 0; i < NUM_SLOTS; i++) {
      let total = 0;
      for (let d = 0; d < 7; d++) {
        total += countOf(`${d}-${i}`);
      }
      hourCounts[i] = total;
    }
    const peakSlot = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    result.peakHour = peakSlot ? fmt(slotHour(parseInt(peakSlot[0]))) : '—';
    result.peakCount = peakSlot ? peakSlot[1] : 0;

    // Quorum rate (% of slots with threshold+ players)
    let quorumSlots = 0, totalSlots = NUM_SLOTS * 7;
    for (let d = 0; d < 7; d++) {
      for (let i = 0; i < NUM_SLOTS; i++) {
        if (countOf(`${d}-${i}`) >= threshold) quorumSlots++;
      }
    }
    result.overlapRate = totalSlots > 0 ? Math.round((quorumSlots / totalSlots) * 100) : 0;

    // Best day
    const dayCounts = DAYS.map((_, d) => {
      let count = 0;
      for (let i = 0; i < NUM_SLOTS; i++) {
        if (countOf(`${d}-${i}`) >= threshold) count++;
      }
      return count;
    });
    const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    result.bestDay = dayCounts[bestDayIdx] > 0 ? DAYS[bestDayIdx] : '—';

    // Scrims stats
    result.totalScrims = scrims.length;
    result.winsAzul = scrims.filter((s) => s.winner === 'azul').length;
    result.winsRojo = scrims.filter((s) => s.winner === 'rojo').length;
    result.avgRating = scrims.length > 0
      ? (scrims.reduce((acc, s) => acc + (s.rating || 0), 0) / scrims.length).toFixed(1)
      : '—';

    // Most used comp
    const compUsage = {};
    for (const s of scrims) {
      if (s.compAzul) compUsage[s.compAzul] = (compUsage[s.compAzul] || 0) + 1;
      if (s.compRojo) compUsage[s.compRojo] = (compUsage[s.compRojo] || 0) + 1;
    }
    const topCompId = Object.entries(compUsage).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topComp = comps.find((c) => c.id === topCompId);
    result.topComp = topComp?.name || '—';

    return result;
  }, [players, cellData, countOf, threshold, scrims, comps]);

  // Availability chart data (hours for chart)
  const chartData = useMemo(() => {
    return Array.from({ length: NUM_SLOTS }, (_, i) => {
      let total = 0;
      for (let d = 0; d < 7; d++) total += countOf(`${d}-${i}`);
      return { hour: fmt(slotHour(i)), total };
    });
  }, [countOf]);

  const maxChart = Math.max(...chartData.map((d) => d.total), 1);

  return (
    <div>
      <h2 className="section-header text-gold mb-4">Estadísticas del Equipo</h2>

      <div className="stats-grid mb-6">
        <div className="stat-card">
          <span className="stat-card__label">Horas totales / semana</span>
          <span className="stat-card__value">{stats.totalHours}</span>
          <span className="stat-card__detail">horas marcadas en el equipo</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Hora pico</span>
          <span className="stat-card__value">{stats.peakHour}</span>
          <span className="stat-card__detail">{stats.peakCount} apariciones en la semana</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Disponibilidad con {threshold}+</span>
          <span className="stat-card__value">{stats.overlapRate}%</span>
          <span className="stat-card__detail">slots con quórum de jugadores</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Mejor día</span>
          <span className="stat-card__value">{stats.bestDay}</span>
          <span className="stat-card__detail">más horas con {threshold}+ jugadores</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Más disponible</span>
          <span className="stat-card__value" style={{ fontSize: '1.2rem' }}>
            {stats.mostAvailable?.name || '—'}
          </span>
          <span className="stat-card__detail">
            {stats.mostAvailable ? `${Object.keys(stats.mostAvailable.avail || {}).length}h marcadas` : ''}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Menos disponible</span>
          <span className="stat-card__value" style={{ fontSize: '1.2rem' }}>
            {stats.leastAvailable?.name || '—'}
          </span>
          <span className="stat-card__detail">
            {stats.leastAvailable ? `${Object.keys(stats.leastAvailable.avail || {}).length}h marcadas` : ''}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Scrims jugados</span>
          <span className="stat-card__value">{stats.totalScrims}</span>
          <span className="stat-card__detail">
            {stats.totalScrims > 0 ? `Azul ${stats.winsAzul}W · Rojo ${stats.winsRojo}W` : 'sin datos'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Rating promedio</span>
          <span className="stat-card__value">{stats.avgRating}</span>
          <span className="stat-card__detail">calidad de los scrims</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Comp más usada</span>
          <span className="stat-card__value" style={{ fontSize: '1rem' }}>{stats.topComp}</span>
        </div>
      </div>

      {/* ── Availability Chart ── */}
      <div className="card">
        <div className="card__header">
          <span className="card__title">Disponibilidad por hora (semanal)</span>
        </div>
        <div className="bar-chart">
          {chartData.map((d, i) => (
            <div key={i} className="bar-row">
              <span className="bar-row__label">{d.hour}</span>
              <div className="bar-row__track">
                <div
                  className="bar-row__fill bar-row__fill--blue"
                  style={{ width: `${(d.total / maxChart) * 100}%` }}
                />
              </div>
              <span className="mono text-xs text-faint" style={{ width: 30, fontSize: '0.55rem' }}>
                {d.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   EXPORT / IMPORT MODAL
   ═══════════════════════════════════════════════════════════════════ */

function ExportImportModal({ onClose, onExportJSON, onCopyDiscord, onImport }) {
  const [importText, setImportText] = useState('');
  const [activeTab, setActiveTab] = useState('export');
  const [copyMsg, setCopyMsg] = useState('');

  const handleCopy = () => {
    onCopyDiscord();
    setCopyMsg('✓ Copiado al portapapeles');
    setTimeout(() => setCopyMsg(''), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">📦 Exportar / Importar</h3>
          <button className="btn btn--ghost" onClick={onClose}>✕</button>
        </div>

        <div className="toggle-group mb-4 w-full" style={{ display: 'flex' }}>
          <button
            className={`toggle-group__btn ${activeTab === 'export' ? 'toggle-group__btn--active' : ''}`}
            style={activeTab === 'export' ? { background: GOLD, color: '#0b1220', flex: 1 } : { flex: 1 }}
            onClick={() => setActiveTab('export')}
          >
            Exportar
          </button>
          <button
            className={`toggle-group__btn ${activeTab === 'import' ? 'toggle-group__btn--active' : ''}`}
            style={activeTab === 'import' ? { background: GOLD, color: '#0b1220', flex: 1 } : { flex: 1 }}
            onClick={() => setActiveTab('import')}
          >
            Importar
          </button>
        </div>

        {activeTab === 'export' ? (
          <div>
            <div className="export-section">
              <div className="export-section__label">Archivo JSON</div>
              <p className="text-xs text-muted mb-2">Descarga toda la data (jugadores, horarios, comps, scrims) como archivo JSON.</p>
              <button className="btn btn--gold w-full" onClick={onExportJSON}>
                📥 Descargar JSON
              </button>
            </div>
            <div className="export-section">
              <div className="export-section__label">Formato Discord</div>
              <p className="text-xs text-muted mb-2">Copia un resumen formateado para pegar en Discord.</p>
              <button className="btn btn--outline w-full" onClick={handleCopy}>
                📋 Copiar para Discord
              </button>
              {copyMsg && <p className="text-xs mt-1" style={{ color: 'var(--green)' }}>{copyMsg}</p>}
            </div>
          </div>
        ) : (
          <div>
            <div className="export-section">
              <div className="export-section__label">Importar datos</div>
              <p className="text-xs text-muted mb-2">Pega el contenido de un archivo JSON exportado previamente. Esto reemplazará todos los datos actuales.</p>
              <textarea
                className="textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='Pega aquí el JSON exportado…'
                style={{ minHeight: '8rem' }}
              />
              <button
                className="btn btn--gold w-full mt-2"
                onClick={() => {
                  if (!importText.trim()) return;
                  if (window.confirm('¿Reemplazar todos los datos con los importados?')) {
                    onImport(importText);
                  }
                }}
              >
                📤 Importar y reemplazar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GLOBAL AUTH SCREEN — Login / Register de cuenta global
   ═══════════════════════════════════════════════════════════════════ */

function GlobalAuthScreen({ onLogin, onRegister }) {
  const [activeTab, setActiveTab] = useState('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre no puede estar vacío.'); return; }
    if (password.length < 3) { setError('La contraseña debe tener al menos 3 caracteres.'); return; }
    setLoading(true);
    try {
      if (activeTab === 'login') await onLogin(name, password);
      else await onRegister(name, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', background: 'var(--bg-deepest)', boxSizing: 'border-box' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: '2rem', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)', background: 'var(--bg-secondary)' }}>
        <div className="text-center mb-6">
          <div className="mono text-xs uppercase font-bold mb-1" style={{ letterSpacing: '0.25em', color: 'var(--gold-primary)' }}>League Planner</div>
          <h1 className="font-bold text-2xl mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Acceso de Invocador</h1>
          <p className="text-xs text-muted">Crea una cuenta o inicia sesión para acceder a tu equipo.</p>
        </div>

        <div style={{ display: 'flex', marginBottom: '1.25rem' }}>
          {[['login', 'Iniciar Sesión'], ['register', 'Crear Cuenta']].map(([id, label]) => (
            <button key={id}
              style={activeTab === id
                ? { flex: 1, padding: '0.5rem', background: 'var(--gold-primary)', color: '#0b1220', fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: id === 'login' ? '6px 0 0 6px' : '0 6px 6px 0', fontSize: '0.85rem' }
                : { flex: 1, padding: '0.5rem', background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: id === 'login' ? '6px 0 0 6px' : '0 6px 6px 0', fontSize: '0.85rem' }}
              onClick={() => { setActiveTab(id); setError(''); }}
            >{label}</button>
          ))}
        </div>

        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="text-xs text-faint">Nombre de Invocador</label>
            <input className="input w-full" value={name} onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="Ej: Faker" autoComplete="username" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="text-xs text-faint">Contraseña / PIN</label>
            <input type="password" className="input w-full" value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Mínimo 3 caracteres…"
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'} />
          </div>
          {error && <p className="text-xs" style={{ color: 'var(--red-bright)' }}>⚠ {error}</p>}
          <button className="btn btn--gold w-full" type="submit" disabled={loading}>
            {loading ? 'Procesando…' : activeTab === 'login' ? 'Entrar' : 'Crear Cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TEAM DIRECTORY SCREEN — Buscar/crear equipo
   ═══════════════════════════════════════════════════════════════════ */

function TeamDirectoryScreen({ currentUserId, currentUserName, onSelectTeam, onCreateTeam, onLogout }) {
  const [myTeams, setMyTeams] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState('mid');
  const [joinGameRole, setJoinGameRole] = useState('mid');
  const [joinMessage, setJoinMessage] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('mine');

  useEffect(() => {
    Promise.all([
      getUserTeams(currentUserId),
      getUserPendingRequests(currentUserId),
    ]).then(([teams, requests]) => {
      setMyTeams(teams);
      setPendingRequests(requests);
    }).catch(() => {});
  }, [currentUserId]);

  const doSearch = async (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const results = await searchPublicTeams(q);
      setSearchResults(results);
    } catch { setSearchResults([]); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createName.trim()) { setError('El nombre del equipo no puede estar vacío.'); return; }
    setLoading(true); setError('');
    try {
      await onCreateTeam(createName, createRole);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRequest = async (e) => {
    e.preventDefault();
    if (!selectedTeam) return;
    setLoading(true); setError('');
    try {
      await requestJoinTeam(currentUserId, selectedTeam.id, joinGameRole, joinMessage);
      setSelectedTeam(null);
      const requests = await getUserPendingRequests(currentUserId);
      setPendingRequests(requests);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = { pending: 'var(--gold-primary)', accepted: 'var(--green-text)', rejected: 'var(--red-text)' };
  const statusLabel = { pending: '⏳ Pendiente', accepted: '✓ Aceptado', rejected: '✕ Rechazado' };
  const sectionBtnStyle = (id) => activeSection === id
    ? { flex: 1, padding: '0.4rem 0.5rem', background: 'var(--gold-primary)', color: '#0b1220', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: '0.75rem' }
    : { flex: 1, padding: '0.4rem 0.5rem', background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.75rem' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem', background: 'var(--bg-deepest)', boxSizing: 'border-box' }}>
      <div className="card" style={{ maxWidth: 560, width: '100%', padding: '2rem', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)', background: 'var(--bg-secondary)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <div className="mono text-xs uppercase font-bold" style={{ letterSpacing: '0.2em', color: 'var(--gold-primary)' }}>League Planner</div>
            <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              Bienvenido, {currentUserName}
            </h2>
          </div>
          <button onClick={onLogout} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.3rem 0.7rem', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>
            Cerrar sesión
          </button>
        </div>

        <div style={{ display: 'flex', marginBottom: '1.25rem' }}>
          {[['mine', 'Mis Equipos'], ['search', 'Buscar'], ['create', 'Crear']].map(([id, label], i, arr) => (
            <button key={id} style={{ ...sectionBtnStyle(id), borderRadius: i === 0 ? '6px 0 0 6px' : i === arr.length - 1 ? '0 6px 6px 0' : '0' }}
              onClick={() => { setActiveSection(id); setError(''); setSelectedTeam(null); }}>
              {label}
            </button>
          ))}
        </div>

        {error && <p className="text-xs mb-3" style={{ color: 'var(--red-bright)' }}>⚠ {error}</p>}

        {activeSection === 'mine' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {myTeams.length === 0 ? (
              <p className="text-sm text-muted text-center" style={{ padding: '1rem 0' }}>No estás en ningún equipo todavía.</p>
            ) : myTeams.map(t => (
              <div key={t.teamId} style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer' }}
                onClick={() => onSelectTeam(t.teamId, t.teamName, t.teamRole)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.teamName}</span>
                    <span className="text-xs text-muted" style={{ marginLeft: '0.5rem' }}>
                      · {ROLE_MAP[t.gameRole]?.icon} {ROLE_MAP[t.gameRole]?.name || t.gameRole}
                    </span>
                  </div>
                  <span style={t.teamRole === 'captain'
                    ? { fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--gold-primary)', color: '#0b1220', fontWeight: 700 }
                    : { fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--bg-panel)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {t.teamRole === 'captain' ? '👑 Capitán' : t.teamRole}
                  </span>
                </div>
              </div>
            ))}

            {pendingRequests.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Solicitudes enviadas
                </div>
                {pendingRequests.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.875rem' }}>{r.teamName}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor[r.status] || 'var(--text-muted)' }}>
                      {statusLabel[r.status] || r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input className="input w-full" placeholder="Buscar por nombre de equipo…"
              value={searchQuery} onChange={e => doSearch(e.target.value)} />
            {searchResults.length === 0 && searchQuery.trim() && (
              <p className="text-sm text-muted text-center">Sin resultados para "{searchQuery}".</p>
            )}
            {searchResults.map(t => (
              <div key={t.id} style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.name}</span>
                    <span className="text-xs text-muted" style={{ marginLeft: '0.5rem' }}>· {t.memberCount} miembro{t.memberCount === 1 ? '' : 's'}</span>
                  </div>
                  <button className="btn btn--gold btn--sm"
                    onClick={() => setSelectedTeam(selectedTeam?.id === t.id ? null : t)}
                    disabled={pendingRequests.some(r => r.teamId === t.id && r.status === 'pending')}>
                    {pendingRequests.some(r => r.teamId === t.id && r.status === 'pending') ? 'Enviada' : selectedTeam?.id === t.id ? 'Cancelar' : 'Unirse'}
                  </button>
                </div>
                {selectedTeam?.id === t.id && (
                  <form onSubmit={handleJoinRequest} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <label className="text-xs text-faint">Tu rol en juego</label>
                      <select className="input" value={joinGameRole} onChange={e => setJoinGameRole(e.target.value)}>
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <label className="text-xs text-faint">Mensaje (opcional)</label>
                      <input className="input w-full" value={joinMessage} onChange={e => setJoinMessage(e.target.value)}
                        placeholder="¿Por qué quieres unirte?" />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn--gold btn--sm" type="submit" disabled={loading}>
                        {loading ? 'Enviando…' : 'Enviar Solicitud'}
                      </button>
                      <button className="btn btn--ghost btn--sm" type="button" onClick={() => setSelectedTeam(null)}>Cancelar</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}

        {activeSection === 'create' && (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label className="text-xs text-faint">Nombre del equipo</label>
              <input className="input w-full" value={createName}
                onChange={e => { setCreateName(e.target.value); setError(''); }}
                placeholder="Ej: Team Invictus" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label className="text-xs text-faint">Tu rol en juego (como capitán)</label>
              <select className="input w-full" value={createRole} onChange={e => setCreateRole(e.target.value)}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted">Serás el capitán. Podrás aceptar solicitudes de otros jugadores.</p>
            <button className="btn btn--gold w-full" type="submit" disabled={loading}>
              {loading ? 'Creando…' : '👑 Crear Equipo'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CAPTAIN PANEL — Solicitudes de unión y gestión de roster
   ═══════════════════════════════════════════════════════════════════ */

function CaptainPanel({ joinRequests, setJoinRequests, players, setPlayers, teamCode, currentUserId }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState({});
  const [acceptRole, setAcceptRole] = useState({});

  const handleAccept = async (req, teamRole) => {
    setLoading(l => ({ ...l, [req.id]: true }));
    setError('');
    try {
      await acceptJoinRequest(req.id, req.userId, teamCode, req.gameRole, teamRole || 'player');
      setJoinRequests(rs => rs.filter(r => r.id !== req.id));
      setPlayers(ps => [...ps, {
        id: `tm_${Date.now()}`,
        userId: req.userId,
        name: req.userName,
        role: req.gameRole,
        secondaryRole: '',
        teamRole: teamRole || 'player',
        avail: {},
        pool: [],
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(l => ({ ...l, [req.id]: false }));
    }
  };

  const handleReject = async (reqId) => {
    setLoading(l => ({ ...l, [reqId]: true }));
    try {
      await rejectJoinRequest(reqId);
      setJoinRequests(rs => rs.filter(r => r.id !== reqId));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(l => ({ ...l, [reqId]: false }));
    }
  };

  const handleRemoveMember = async (p) => {
    if (!window.confirm(`¿Expulsar a ${p.name} del equipo?`)) return;
    try {
      await removeMemberFromTeam(p.userId, teamCode);
      setPlayers(ps => ps.filter(x => x.id !== p.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--gold-bright)', marginBottom: '1rem' }}>
        Panel del Capitán
      </h2>

      {error && <p className="text-xs mb-4" style={{ color: 'var(--red-bright)' }}>⚠ {error}</p>}

      <div className="card mb-6">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Solicitudes de Unión</span>
          <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            {joinRequests.length}
          </span>
        </div>
        {joinRequests.length === 0 ? (
          <p className="text-sm text-muted">No hay solicitudes pendientes.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {joinRequests.map(req => (
              <div key={req.id} style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.userName}</span>
                    <span className="text-xs text-muted" style={{ marginLeft: '0.5rem' }}>
                      · {ROLE_MAP[req.gameRole]?.icon} {ROLE_MAP[req.gameRole]?.name || req.gameRole}
                    </span>
                  </div>
                </div>
                {req.message && (
                  <p className="text-xs text-muted mb-2" style={{ fontStyle: 'italic' }}>"{req.message}"</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <select className="input" style={{ width: 'auto', fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                    value={acceptRole[req.id] || 'player'}
                    onChange={e => setAcceptRole(r => ({ ...r, [req.id]: e.target.value }))}>
                    <option value="player">Jugador</option>
                    <option value="substitute">Suplente</option>
                    <option value="coach">Coach</option>
                    <option value="manager">Manager</option>
                  </select>
                  <button className="btn btn--gold btn--sm" disabled={loading[req.id]}
                    onClick={() => handleAccept(req, acceptRole[req.id] || 'player')}>
                    ✓ Aceptar
                  </button>
                  <button className="btn btn--ghost btn--sm" disabled={loading[req.id]}
                    onClick={() => handleReject(req.id)}
                    style={{ color: 'var(--red-text)' }}>
                    ✕ Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Roster del Equipo</span>
          <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: 'var(--bg-panel)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            {players.length} miembros
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {players.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{ROLE_MAP[p.role]?.icon || '❓'}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                <span style={p.teamRole === 'captain'
                  ? { fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'var(--gold-primary)', color: '#0b1220', fontWeight: 700 }
                  : { fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '999px', background: 'var(--bg-panel)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {p.teamRole === 'captain' ? '👑' : p.teamRole}
                </span>
              </div>
              {p.userId !== currentUserId && p.teamRole !== 'captain' && (
                <button onClick={() => handleRemoveMember(p)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.15rem 0.5rem', color: 'var(--red-text)', cursor: 'pointer', fontSize: '0.7rem' }}>
                  Expulsar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
