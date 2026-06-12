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
  getActiveTeamCode, setActiveTeamCode, createTeam,
  getCurrentSessionPlayerId, setCurrentSessionPlayerId,
  hashPassword,
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
  const [tab, setTab] = useState('schedule'); // schedule | comps | scrims | stats
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const saveTimer = useRef(null);

  /* Player session state */
  const [sessionPlayerId, setSessionPlayerId] = useState(() => getCurrentSessionPlayerId());

  const sessionPlayer = useMemo(() => {
    return players.find(p => p.id === sessionPlayerId);
  }, [players, sessionPlayerId]);

  /* Supabase Collaborative States */
  const [teamCode, setTeamCode] = useState(() => getActiveTeamCode());
  const [teamName, setTeamName] = useState('');
  const [localMode, setLocalMode] = useState(() => localStorage.getItem('lol-local-mode') === 'true');

  const [joinCode, setJoinCode] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createName, setCreateName] = useState('');
  const [loadingCode, setLoadingCode] = useState(false);

  /* Dragon */
  const { champions, version: dragonVersion, loading: dragonLoading } = useDragon();

  /* ─── persistence ─── */
  useEffect(() => {
    loadData().then((data) => {
      setPlayers(data.players || []);
      setComps(data.comps || []);
      setDrafts(data.drafts || []);
      setScrims(data.scrims || []);
      setThreshold(data.threshold || 5);
      setTeamName(data.teamName || '');
      setLoaded(true);
    });
  }, [teamCode, localMode]);

  useEffect(() => {
    if (!loaded) return;
    // Don't auto-save if in portal screen and not yet loaded
    if (isSupabaseConfigured && !teamCode && !localMode) return;

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
  }, [players, comps, drafts, scrims, threshold, loaded, teamCode, localMode]);

  /* ─── portal actions ─── */
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    const cleanCode = joinCode.trim().toLowerCase();
    setLoadingCode(true);
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('name')
        .eq('id', cleanCode)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        alert('Código de equipo no encontrado. Verifica e intenta de nuevo.');
        return;
      }

      setActiveTeamCode(cleanCode);
      localStorage.setItem('lol-local-mode', 'false');
      setTeamCode(cleanCode);
      setLocalMode(false);
      setTeamName(data.name);
    } catch (err) {
      alert('Error al unirse: ' + err.message);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createCode.trim() || !createName.trim()) return;
    const cleanCode = createCode.trim().toLowerCase();
    const cleanName = createName.trim();
    
    if (!/^[a-z0-9-_]+$/.test(cleanCode)) {
      alert('El código solo puede contener letras minúsculas, números, guiones y guiones bajos.');
      return;
    }

    setLoadingCode(true);
    try {
      const success = await createTeam(cleanCode, cleanName);
      if (success) {
        setActiveTeamCode(cleanCode);
        localStorage.setItem('lol-local-mode', 'false');
        setTeamCode(cleanCode);
        setLocalMode(false);
        setTeamName(cleanName);
        // Reset state for new team
        setPlayers([]);
        setComps([]);
        setDrafts([]);
        setScrims([]);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingCode(false);
    }
  };

  const handleLocalMode = () => {
    setActiveTeamCode('');
    localStorage.setItem('lol-local-mode', 'true');
    setLocalMode(true);
    setTeamCode('');
  };

  const handleLogout = () => {
    if (window.confirm('¿Deseas salir del equipo? Se mantendrá una copia en tu almacenamiento local.')) {
      setActiveTeamCode('');
      localStorage.setItem('lol-local-mode', 'false');
      setCurrentSessionPlayerId('');
      setSessionPlayerId('');
      setTeamCode('');
      setLocalMode(false);
      setTeamName('');
    }
  };

  const handleGoCloud = () => {
    localStorage.removeItem('lol-local-mode');
    setLocalMode(false);
  };

  /* ─── cell data (for schedule) ─── */
  const cellData = useMemo(() => {
    const m = {};
    for (const p of players) {
      for (const k of Object.keys(p.avail || {})) {
        if (!m[k]) m[k] = { azul: [], rojo: [] };
        m[k][p.team].push(p.name);
      }
    }
    return m;
  }, [players]);

  const countOf = useCallback(
    (key, team) => cellData[key]?.[team]?.length || 0,
    [cellData]
  );

  /* ─── windows ─── */
  const windowDetail = useCallback((run, team) => {
    const slots = [];
    for (let i = run.start; i <= run.end; i++) slots.push(`${run.day}-${i}`);
    const full = [], partial = [];
    let min = Infinity, max = 0;
    for (const k of slots) {
      const n = countOf(k, team);
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
    for (const p of players) {
      if (p.team !== team) continue;
      const c = slots.filter((k) => p.avail?.[k]).length;
      if (c === slots.length) full.push(p.name);
      else if (c > 0) partial.push(p.name);
    }
    return { full, partial, min, max };
  }, [players, countOf]);

  const teamWindows = useMemo(() => {
    const out = {};
    for (const t of TEAM_IDS) {
      out[t] = findRuns((k) => countOf(k, t) >= threshold)
        .map((run) => ({ ...run, detail: windowDetail(run, t) }));
    }
    return out;
  }, [countOf, threshold, windowDetail]);

  const scrimWindows = useMemo(
    () => findRuns((k) => countOf(k, 'azul') >= threshold && countOf(k, 'rojo') >= threshold)
      .map((run) => ({
        ...run,
        azul: windowDetail(run, 'azul'),
        rojo: windowDetail(run, 'rojo'),
      })),
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

  /* ─── loading screen ─── */
  const showPortal = isSupabaseConfigured && !teamCode && !localMode;

  if (showPortal) {
    return (
      <PortalView
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        createCode={createCode}
        setCreateCode={setCreateCode}
        createName={createName}
        setCreateName={setCreateName}
        loading={loadingCode}
        onJoin={handleJoin}
        onCreate={handleCreate}
        onLocal={handleLocalMode}
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

  if (!sessionPlayerId) {
    return (
      <PlayerPortalView
        players={players}
        onLogin={async (playerId, password) => {
          const p = players.find(x => x.id === playerId);
          if (!p) return 'Invocador no encontrado.';
          const hashed = await hashPassword(password);
          // Support both legacy plaintext (dev) and hashed passwords
          const match = p.password === hashed || p.password === password;
          if (!match) return 'Contraseña incorrecta.';
          setCurrentSessionPlayerId(playerId);
          setSessionPlayerId(playerId);
          return null; // null = success
        }}
        onRegister={async (name, team, role, password) => {
          if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            return 'Ya existe un invocador con este nombre en el equipo.';
          }
          const hashed = await hashPassword(password);
          const id = `p_${uid()}`;
          const newPlayer = {
            id, name, team, role,
            secondaryRole: '',
            avail: {},
            pool: [],
            password: hashed,
          };
          setPlayers(ps => [...ps, newPlayer]);
          setCurrentSessionPlayerId(id);
          setSessionPlayerId(id);
          return null; // null = success
        }}
        onSpectator={() => {
          setCurrentSessionPlayerId('spectator');
          setSessionPlayerId('spectator');
        }}
        teamName={teamCode ? `${teamCode} (${teamName})` : 'Modo Local'}
        onExitTeam={handleLogout}
        isLocalMode={localMode}
      />
    );
  }

  /* ─── tabs config ─── */
  const TABS = [
    { id: 'schedule', label: 'Horarios',      icon: '📅' },
    { id: 'comps',    label: 'Composiciones', icon: '⚔️' },
    { id: 'scrims',   label: 'Scrims',        icon: '📝' },
    { id: 'stats',    label: 'Stats',         icon: '📊' },
  ];

  return (
    <div className="app-container">
      {/* ═══ Header ═══ */}
      <header className="app-header">
        <div>
          <div className="app-header__brand" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>League Planner · Patch {dragonVersion || '…'}</span>
            {isSupabaseConfigured && (
              <span className="chip chip--sm chip--gold font-mono" style={{ fontSize: '0.6rem', textTransform: 'none', letterSpacing: 'normal' }}>
                {teamCode ? `☁️ Sincronizado: ${teamCode} (${teamName})` : '📴 Modo Local'}
              </span>
            )}
          </div>
          <h1 className="app-header__title">¿Cuándo jugamos?</h1>
          <p className="app-header__subtitle">
            Gestiona horarios, composiciones, champion pools y notas de tus scrims en un solo lugar.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {sessionPlayerId === 'spectator' ? (
              <span className="chip chip--sm chip--red font-mono" style={{ fontSize: '0.7rem' }}>
                👓 Modo Espectador (Solo Lectura)
              </span>
            ) : (
              sessionPlayer && (
                <span className="chip chip--sm chip--green font-mono" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🟢 Sesión:</span>
                  <span style={{ color: TEAMS[sessionPlayer.team].color, fontWeight: 'bold' }}>
                    {ROLE_MAP[sessionPlayer.role]?.icon || '❓'} {sessionPlayer.name} ({TEAMS[sessionPlayer.team].short})
                  </span>
                </span>
              )
            )}
            <button
              className="btn btn--outline btn--sm"
              onClick={() => {
                setCurrentSessionPlayerId('');
                setSessionPlayerId('');
              }}
              style={{ padding: '0.1rem 0.5rem', fontSize: '0.65rem', borderRadius: '4px', height: 'auto' }}
            >
              🔄 Cambiar de Perfil
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 header-controls">
          {isSupabaseConfigured && (
            teamCode ? (
              <button className="btn btn--outline btn--sm" onClick={handleLogout} style={{ color: 'var(--red-text)' }}>
                🚪 Salir del Equipo
              </button>
            ) : (
              <button className="btn btn--gold btn--sm" onClick={handleGoCloud}>
                🌐 Sincronizar en Nube
              </button>
            )
          )}
          <button className="btn btn--outline btn--sm" onClick={() => setShowExport(true)}>
            📦 Export / Import
          </button>
          <div className="threshold-control">
            <div className="threshold-control__label">Mínimo por equipo</div>
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
          teamWindows={teamWindows}
          scrimWindows={scrimWindows}
          champions={champions}
          sessionPlayerId={sessionPlayerId}
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

function ScheduleTab({ players, setPlayers, cellData, countOf, threshold, teamWindows, scrimWindows, champions, sessionPlayerId }) {
  const [activeId, setActiveId] = useState(() => {
    if (sessionPlayerId && sessionPlayerId !== 'spectator' && players.some((p) => p.id === sessionPlayerId)) {
      return sessionPlayerId;
    }
    return 'map';
  });
  const [mapView, setMapView] = useState('ambos');
  const paint = useRef({ active: false, value: true });

  const activePlayer = players.find((p) => p.id === activeId);
  const isMapView = !activePlayer;
  const isEditable = activePlayer && sessionPlayerId === activePlayer.id;

  /* player actions */
  const removePlayer = (id) => {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    if (activeId === id) setActiveId('map');
  };

  const switchTeam = (id) => {
    setPlayers((ps) => ps.map((p) => p.id === id ? { ...p, team: p.team === 'azul' ? 'rojo' : 'azul' } : p));
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

  const rosterOf = (t) => players.filter((p) => p.team === t);

  return (
    <div>
      {/* ── Rosters ── */}
      <div className="two-col mb-4">
        {TEAM_IDS.map((t) => (
          <div key={t} className={`card card--${t === 'azul' ? 'blue' : 'red'}`}>
            <div className="card__header">
              <span className="card__title" style={{ color: TEAMS[t].text }}>{TEAMS[t].name}</span>
              <span className="mono text-xs text-muted">{rosterOf(t).length} jugador{rosterOf(t).length === 1 ? '' : 'es'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {rosterOf(t).length === 0 && <span className="text-xs text-faint">Sin jugadores todavía.</span>}
              {rosterOf(t).map((p) => (
                <div
                  key={p.id}
                  className={`player-chip ${activeId === p.id ? 'player-chip--active' : ''}`}
                  style={{ background: TEAMS[t].chip, borderColor: TEAMS[t].border }}
                  onClick={() => setActiveId(p.id)}
                >
                  <span className="player-chip__role">{ROLE_MAP[p.role]?.icon || '❓'}</span>
                  <span>{p.name}</span>
                  <span className="player-chip__hours">{Object.keys(p.avail || {}).length}h</span>
                  {sessionPlayerId === p.id && (
                    <>
                      <button className="player-chip__action" onClick={(e) => { e.stopPropagation(); switchTeam(p.id); }} title="Cambiar de equipo">⇄</button>
                      <button className="player-chip__action player-chip__action--danger" onClick={(e) => { e.stopPropagation(); removePlayer(p.id); }} title="Quitar">✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Player tabs ── */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          className={`tab-bar__btn ${isMapView ? 'tab-bar__btn--active' : ''}`}
          onClick={() => setActiveId('map')}
          style={{ borderRadius: 'var(--radius-md)', border: isMapView ? 'none' : '1px solid var(--border)' }}
        >
          Mapa de equipos
        </button>
        {players.map((p) => (
          <button
            key={p.id}
            className={`tab-bar__btn ${activeId === p.id ? '' : ''}`}
            onClick={() => setActiveId(p.id)}
            style={{
              borderRadius: 'var(--radius-md)',
              border: activeId === p.id ? `1px solid ${TEAMS[p.team].color}` : '1px solid var(--border)',
              background: activeId === p.id ? 'var(--bg-surface)' : 'transparent',
              color: activeId === p.id ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TEAMS[p.team].color, display: 'inline-block', marginRight: 6 }} />
            {p.name}
          </button>
        ))}
      </div>

      {/* ── Context bar ── */}
      <div className="flex items-center justify-between gap-2 mb-2" style={{ minHeight: '1.75rem' }}>
        <div className="mono text-xs text-faint">
          {isMapView ? (
            players.length > 0 && `Dorado = scrim posible (ambos equipos con ${threshold}+)`
          ) : (
            isEditable ? (
              <>Pintando tu disponibilidad como <span style={{ color: TEAMS[activePlayer.team].color }}>{activePlayer.name}</span> — clic o arrastra</>
            ) : (
              <span style={{ color: 'var(--red-bright)', fontWeight: 'bold' }}>
                ⚠️ Solo lectura: Estás viendo el horario de {activePlayer.name}
              </span>
            )
          )}
        </div>
        {isMapView && players.length > 0 && (
          <div className="toggle-group">
            {[['ambos', 'Ambos', GOLD], ['azul', 'Azul', TEAMS.azul.color], ['rojo', 'Rojo', TEAMS.rojo.color]].map(([v, label, c]) => (
              <button
                key={v}
                className={`toggle-group__btn ${mapView === v ? 'toggle-group__btn--active' : ''}`}
                style={mapView === v ? { background: c, color: '#0b1220' } : {}}
                onClick={() => setMapView(v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
                mapView={mapView}
                activePlayer={activePlayer}
                countOf={countOf}
                cellData={cellData}
                threshold={threshold}
                onCellDown={onCellDown}
                onCellEnter={onCellEnter}
              />
            ))}
          </div>
          {isMapView && mapView === 'ambos' && (
            <div className="grid-legend">
              <span><span className="grid-legend__swatch" style={{ background: TEAMS.azul.color }} />Izq: Azul</span>
              <span><span className="grid-legend__swatch" style={{ background: TEAMS.rojo.color }} />Der: Rojo</span>
              <span><span className="grid-legend__swatch" style={{ background: GOLD }} />Scrim posible</span>
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

      {/* ── Scrim windows ── */}
      {players.length > 0 && (
        <div className="mt-8">
          <h2 className="section-header text-gold">Scrims posibles · ambos equipos con {threshold}+</h2>
          {scrimWindows.length === 0 ? (
            <p className="text-sm text-muted">Aún no hay bloques donde ambos equipos lleguen a {threshold} jugadores a la vez.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {scrimWindows.map((w, idx) => (
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
                  <div className="two-col mt-2">
                    {TEAM_IDS.map((t) => <RosterLine key={t} team={t} detail={w[t]} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Per-team windows ── */}
      {players.length > 0 && (
        <div className="two-col mt-8">
          {TEAM_IDS.map((t) => (
            <div key={t}>
              <h2 className="section-header" style={{ color: TEAMS[t].text }}>
                Ventanas {TEAMS[t].name} · {threshold}+
              </h2>
              {teamWindows[t].length === 0 ? (
                <p className="text-sm text-muted">Sin bloques de {threshold}+ jugadores todavía.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {teamWindows[t].map((w, idx) => (
                    <div key={idx} className="window-card" style={{ borderColor: idx === 0 ? TEAMS[t].color : undefined }}>
                      <div className="window-card__time">
                        {DAYS[w.day]} · {fmt(slotHour(w.start))}–{fmt((slotHour(w.end) + 1) % 24)}
                        <span className="window-card__duration">{w.end - w.start + 1}h</span>
                      </div>
                      <RosterLine team={t} detail={w.detail} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   GRID ROW
   ═══════════════════════════════════════════════════════════════════ */

function GridRow({ i, isMapView, mapView, activePlayer, countOf, cellData, threshold, onCellDown, onCellEnter }) {
  const h = slotHour(i);
  return (
    <>
      <div className="grid-hour">{fmt(h)}</div>
      {Array.from({ length: 7 }, (_, d) => {
        const key = `${d}-${i}`;
        const a = countOf(key, 'azul');
        const r = countOf(key, 'rojo');

        // Player painting mode
        if (!isMapView) {
          const on = !!activePlayer.avail?.[key];
          const T = TEAMS[activePlayer.team];
          return (
            <div
              key={key}
              onPointerDown={(e) => onCellDown(e, key)}
              onPointerEnter={() => onCellEnter(key)}
              className="grid-cell"
              style={{
                background: on ? T.color : 'rgba(148,163,184,0.04)',
                boxShadow: on ? 'inset 0 0 0 1px rgba(255,255,255,0.25)' : 'inset 0 0 0 1px rgba(148,163,184,0.08)',
              }}
            />
          );
        }

        const names = cellData[key];
        const title = `Azul ${a}${names?.azul?.length ? ` (${names.azul.join(', ')})` : ''} · Rojo ${r}${names?.rojo?.length ? ` (${names.rojo.join(', ')})` : ''}`;

        // Single team view
        if (mapView !== 'ambos') {
          const t = mapView;
          const n = t === 'azul' ? a : r;
          const T = TEAMS[t];
          const quorum = n >= threshold;
          const alpha = n === 0 ? 0 : 0.15 + 0.6 * Math.min(1, n / threshold);
          return (
            <div
              key={key}
              title={title}
              className="grid-cell"
              style={{
                background: quorum ? GOLD : n === 0 ? 'rgba(148,163,184,0.04)' : `rgba(${T.rgb},${alpha.toFixed(2)})`,
                boxShadow: quorum ? `inset 0 0 0 1px ${GOLD_BRIGHT}, 0 0 10px rgba(201,170,113,0.5)` : 'inset 0 0 0 1px rgba(148,163,184,0.08)',
              }}
            >
              {n > 0 && (
                <span className="grid-cell__count" style={{ color: quorum ? '#1c1306' : '#f1f5f9' }}>{n}</span>
              )}
            </div>
          );
        }

        // Combined view
        const scrim = a >= threshold && r >= threshold;
        const alphaA = a === 0 ? 0.03 : 0.15 + 0.6 * Math.min(1, a / threshold);
        const alphaR = r === 0 ? 0.03 : 0.15 + 0.6 * Math.min(1, r / threshold);
        return (
          <div
            key={key}
            title={title}
            className={`grid-cell grid-cell--split ${scrim ? 'grid-cell--scrim' : ''}`}
            style={{
              boxShadow: scrim ? `inset 0 0 0 1.5px ${GOLD}, 0 0 10px rgba(201,170,113,0.5)` : 'inset 0 0 0 1px rgba(148,163,184,0.08)',
            }}
          >
            <div style={{ background: `rgba(${TEAMS.azul.rgb},${alphaA.toFixed(2)})` }}>
              {a > 0 && <span className="mono" style={{ fontSize: '0.55rem', fontWeight: 700, color: '#f1f5f9' }}>{a}</span>}
            </div>
            <div style={{ background: `rgba(${TEAMS.rojo.rgb},${alphaR.toFixed(2)})` }}>
              {r > 0 && <span className="mono" style={{ fontSize: '0.55rem', fontWeight: 700, color: '#f1f5f9' }}>{r}</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ROSTER LINE
   ═══════════════════════════════════════════════════════════════════ */

function RosterLine({ team, detail }) {
  const T = TEAMS[team];
  return (
    <div className="window-card__roster">
      <span className="font-semibold" style={{ color: T.text }}>{T.short}: </span>
      {detail.full.length > 0
        ? <span className="text-primary">{detail.full.join(', ')}</span>
        : <span className="text-muted">nadie todo el bloque</span>}
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
    <div className="card mt-4" style={{ borderColor: TEAMS[player.team].border }}>
      <div className="card__header">
        <div className="flex items-center gap-2">
          <span style={{ color: TEAMS[player.team].text, fontWeight: 600 }}>
            {ROLE_MAP[player.role]?.icon} {player.name}
          </span>
          <span className="chip chip--sm" style={{ background: TEAMS[player.team].chip, borderColor: TEAMS[player.team].border, color: TEAMS[player.team].text }}>
            {TEAMS[player.team].short}
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

    // Hours per team
    for (const t of TEAM_IDS) {
      const teamPlayers = players.filter((p) => p.team === t);
      let totalHours = 0;
      for (const p of teamPlayers) totalHours += Object.keys(p.avail || {}).length;
      result[`hours_${t}`] = totalHours;
    }

    // Most/least available
    let most = null, least = null;
    for (const p of players) {
      const h = Object.keys(p.avail || {}).length;
      if (!most || h > Object.keys(most.avail || {}).length) most = p;
      if (!least || h < Object.keys(least.avail || {}).length) least = p;
    }
    result.mostAvailable = most;
    result.leastAvailable = least;

    // Peak hour — hour with most players available (across all teams)
    const hourCounts = {};
    for (let i = 0; i < NUM_SLOTS; i++) {
      let total = 0;
      for (let d = 0; d < 7; d++) {
        const key = `${d}-${i}`;
        total += (cellData[key]?.azul?.length || 0) + (cellData[key]?.rojo?.length || 0);
      }
      hourCounts[i] = total;
    }
    const peakSlot = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    result.peakHour = peakSlot ? fmt(slotHour(parseInt(peakSlot[0]))) : '—';
    result.peakCount = peakSlot ? peakSlot[1] : 0;

    // Overlap rate
    let overlapSlots = 0, totalSlots = NUM_SLOTS * 7;
    for (let d = 0; d < 7; d++) {
      for (let i = 0; i < NUM_SLOTS; i++) {
        const key = `${d}-${i}`;
        if (countOf(key, 'azul') >= threshold && countOf(key, 'rojo') >= threshold) overlapSlots++;
      }
    }
    result.overlapRate = totalSlots > 0 ? Math.round((overlapSlots / totalSlots) * 100) : 0;

    // Best day
    const dayCounts = DAYS.map((_, d) => {
      let count = 0;
      for (let i = 0; i < NUM_SLOTS; i++) {
        const key = `${d}-${i}`;
        if (countOf(key, 'azul') >= threshold && countOf(key, 'rojo') >= threshold) count++;
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
      let blue = 0, red = 0;
      for (let d = 0; d < 7; d++) {
        const key = `${d}-${i}`;
        blue += cellData[key]?.azul?.length || 0;
        red += cellData[key]?.rojo?.length || 0;
      }
      return { hour: fmt(slotHour(i)), blue, red };
    });
  }, [cellData]);

  const maxChart = Math.max(...chartData.map((d) => Math.max(d.blue, d.red)), 1);

  return (
    <div>
      <h2 className="section-header text-gold mb-4">Estadísticas del Equipo</h2>

      <div className="stats-grid mb-6">
        <div className="stat-card">
          <span className="stat-card__label">Horas Azul / semana</span>
          <span className="stat-card__value" style={{ color: 'var(--blue-text)' }}>{stats.hours_azul}</span>
          <span className="stat-card__detail">horas totales marcadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Horas Rojo / semana</span>
          <span className="stat-card__value" style={{ color: 'var(--red-text)' }}>{stats.hours_rojo}</span>
          <span className="stat-card__detail">horas totales marcadas</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Hora pico</span>
          <span className="stat-card__value">{stats.peakHour}</span>
          <span className="stat-card__detail">{stats.peakCount} apariciones en la semana</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Tasa de overlap</span>
          <span className="stat-card__value">{stats.overlapRate}%</span>
          <span className="stat-card__detail">slots con scrim posible</span>
        </div>
        <div className="stat-card">
          <span className="stat-card__label">Mejor día</span>
          <span className="stat-card__value">{stats.bestDay}</span>
          <span className="stat-card__detail">más horas de scrim posible</span>
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
            {stats.totalScrims > 0 ? `🔵 ${stats.winsAzul}W · 🔴 ${stats.winsRojo}W` : 'sin datos'}
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
                  style={{ width: `${(d.blue / maxChart) * 50}%` }}
                />
                <div
                  className="bar-row__fill bar-row__fill--red"
                  style={{ width: `${(d.red / maxChart) * 50}%` }}
                />
              </div>
              <span className="mono text-xs text-faint" style={{ width: 50, fontSize: '0.55rem' }}>
                {d.blue}B / {d.red}R
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
   PORTAL VIEW (Supabase Collaborative Team Sign-In)
   ═══════════════════════════════════════════════════════════════════ */

function PortalView({
  joinCode, setJoinCode,
  createCode, setCreateCode,
  createName, setCreateName,
  loading, onJoin, onCreate, onLocal
}) {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ padding: '1rem', background: 'var(--bg-deepest)', minHeight: '100vh', width: '100vw', boxSizing: 'border-box' }}>
      <div className="card" style={{ maxWidth: '650px', width: '100%', padding: '2rem', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)', background: 'var(--bg-secondary)' }}>
        
        {/* Title branding */}
        <div className="text-center mb-6">
          <div className="mono text-xs uppercase text-gold font-bold mb-1" style={{ letterSpacing: '0.25em' }}>League Planner</div>
          <h1 className="font-bold text-3xl mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Lobby de Equipos</h1>
          <p className="text-sm text-muted max-w-md mx-auto">
            Únete a tu equipo para colaborar y sincronizar horarios, pools y composiciones en tiempo real, o trabaja de forma local sin conexión.
          </p>
        </div>

        {/* Action columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
          
          {/* Join team */}
          <div className="portal-join-col" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
            <h3 className="font-semibold text-gold mb-1" style={{ fontSize: '0.95rem', borderBottom: '1px solid var(--border-gold)', paddingBottom: '0.25rem' }}>🔵 Unirse a Equipo</h3>
            <form onSubmit={onJoin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label className="text-xs text-faint">Código de equipo existente</label>
                <input
                  className="input input--rect text-sm"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Ej: udp-scrims"
                  disabled={loading}
                />
              </div>
              <button className="btn btn--blue btn--sm w-full mt-2" type="submit" disabled={loading} style={{ padding: '0.5rem' }}>
                {loading ? 'Ingresando...' : 'Unirse al Equipo'}
              </button>
            </form>
          </div>

          {/* Create team */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 className="font-semibold text-gold mb-1" style={{ fontSize: '0.95rem', borderBottom: '1px solid var(--border-gold)', paddingBottom: '0.25rem' }}>🔴 Registrar Nuevo Equipo</h3>
            <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label className="text-xs text-faint">Código único (letras y guiones)</label>
                <input
                  className="input input--rect text-sm"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                  placeholder="Ej: team-invictus"
                  disabled={loading}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label className="text-xs text-faint">Nombre visible de tu equipo</label>
                <input
                  className="input input--rect text-sm"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ej: Invictus Gaming"
                  disabled={loading}
                />
              </div>
              <button className="btn btn--gold btn--sm w-full mt-2" type="submit" disabled={loading} style={{ padding: '0.5rem' }}>
                {loading ? 'Creando...' : 'Crear y Registrar'}
              </button>
            </form>
          </div>

        </div>

        {/* Footer offline link */}
        <div className="text-center mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn--outline btn--sm" onClick={onLocal} disabled={loading}>
            📴 Continuar en Modo Local (Sin Conexión)
          </button>
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PLAYER PORTAL VIEW (Profile Login & Registration Gate)
   ═══════════════════════════════════════════════════════════════════ */

function PlayerPortalView({
  players, onLogin, onRegister, onSpectator, teamName, onExitTeam, isLocalMode
}) {
  const [activeTab, setActiveTab] = useState(players.length > 0 ? 'login' : 'register');

  // Login form state
  const [loginPlayerId, setLoginPlayerId] = useState(players[0]?.id || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regTeam, setRegTeam] = useState('azul');
  const [regRole, setRegRole] = useState('mid');
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  // Keep dropdown in sync when players load
  useEffect(() => {
    if (players.length > 0 && !loginPlayerId) {
      setLoginPlayerId(players[0].id);
    }
  }, [players, loginPlayerId]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginPlayerId) { setLoginError('Selecciona un invocador.'); return; }
    setLoginLoading(true);
    const err = await onLogin(loginPlayerId, loginPassword);
    setLoginLoading(false);
    if (err) setLoginError(err);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    const name = regName.trim();
    const pwd = regPassword.trim();
    if (!name) { setRegError('El nombre de invocador no puede estar vacío.'); return; }
    if (pwd.length < 3) { setRegError('La contraseña debe tener al menos 3 caracteres.'); return; }
    setRegLoading(true);
    const err = await onRegister(name, regTeam, regRole, pwd);
    setRegLoading(false);
    if (err) setRegError(err);
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ padding: '1rem', background: 'var(--bg-deepest)', minHeight: '100vh', width: '100vw', boxSizing: 'border-box' }}>
      <div className="card" style={{ maxWidth: '500px', width: '100%', padding: '2rem', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-gold)', background: 'var(--bg-secondary)' }}>

        {/* Title */}
        <div className="text-center mb-6">
          <div className="mono text-xs uppercase text-gold font-bold mb-1" style={{ letterSpacing: '0.25em' }}>League Planner</div>
          <h2 className="font-bold text-2xl mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>Acceso de Invocador</h2>
          <p className="text-xs text-muted">
            Equipo: <span style={{ color: 'var(--gold-bright)' }}>{teamName}</span>
          </p>
        </div>

        {/* Tab Selection */}
        <div className="toggle-group mb-5 w-full" style={{ display: 'flex' }}>
          <button
            className={`toggle-group__btn ${activeTab === 'login' ? 'toggle-group__btn--active' : ''}`}
            style={activeTab === 'login' ? { background: 'var(--gold-primary)', color: '#0b1220', flex: 1 } : { flex: 1 }}
            onClick={() => { setActiveTab('login'); setLoginError(''); }}
          >
            Iniciar Sesión
          </button>
          <button
            className={`toggle-group__btn ${activeTab === 'register' ? 'toggle-group__btn--active' : ''}`}
            style={activeTab === 'register' ? { background: 'var(--gold-primary)', color: '#0b1220', flex: 1 } : { flex: 1 }}
            onClick={() => { setActiveTab('register'); setRegError(''); }}
          >
            Registrarse
          </button>
        </div>

        {/* Login Tab */}
        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {players.length === 0 ? (
              <p className="text-xs text-muted text-center py-4">
                No hay invocadores registrados en este equipo aún. ¡Regístrate en la pestaña de al lado!
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label className="text-xs text-faint">Selecciona tu Invocador</label>
                  <select
                    className="input w-full"
                    value={loginPlayerId}
                    onChange={(e) => setLoginPlayerId(e.target.value)}
                  >
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {ROLE_MAP[p.role]?.icon || '❓'} {p.name} ({TEAMS[p.team]?.short || p.team})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label className="text-xs text-faint">Contraseña / PIN</label>
                  <input
                    type="password"
                    className="input w-full"
                    value={loginPassword}
                    onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }}
                    placeholder="Escribe tu clave..."
                    autoComplete="current-password"
                  />
                </div>
                {loginError && (
                  <p className="text-xs" style={{ color: 'var(--red-bright)', marginTop: '-0.5rem' }}>⚠ {loginError}</p>
                )}
                <button className="btn btn--gold w-full mt-2" type="submit" disabled={loginLoading}>
                  {loginLoading ? 'Verificando…' : 'Entrar al Planificador'}
                </button>
              </>
            )}
          </form>
        ) : (
          /* Register Tab */
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label className="text-xs text-faint">Nombre de Invocador</label>
              <input
                className="input w-full"
                value={regName}
                onChange={(e) => { setRegName(e.target.value); setRegError(''); }}
                placeholder="Ej: Faker"
                autoComplete="username"
              />
            </div>

            <div className="register-row" style={{ display: 'flex', gap: '1rem', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                <label className="text-xs text-faint">Bando / Equipo</label>
                <div className="toggle-group w-full" style={{ display: 'flex' }}>
                  {TEAM_IDS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`toggle-group__btn ${regTeam === t ? 'toggle-group__btn--active' : ''}`}
                      style={regTeam === t ? { background: TEAMS[t].color, color: '#0b1220', flex: 1 } : { flex: 1 }}
                      onClick={() => setRegTeam(t)}
                    >
                      {TEAMS[t].short}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                <label className="text-xs text-faint">Rol Principal</label>
                <select
                  className="input w-full"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label className="text-xs text-faint">Establecer Contraseña / PIN</label>
              <input
                type="password"
                className="input w-full"
                value={regPassword}
                onChange={(e) => { setRegPassword(e.target.value); setRegError(''); }}
                placeholder="Mínimo 3 caracteres…"
                autoComplete="new-password"
              />
              <span className="text-[10px] text-muted">La usarás para modificar tu horario o pool de campeones.</span>
            </div>

            {regError && (
              <p className="text-xs" style={{ color: 'var(--red-bright)', marginTop: '-0.5rem' }}>⚠ {regError}</p>
            )}
            <button className="btn btn--blue w-full mt-2" type="submit" disabled={regLoading}>
              {regLoading ? 'Registrando…' : 'Registrarse y Entrar'}
            </button>
          </form>
        )}

        {/* Spectator and Exit Actions */}
        <div className="text-center mt-5 pt-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn--outline btn--sm w-full" onClick={onSpectator}>
            👓 Continuar como Espectador (Solo Lectura)
          </button>
          {!isLocalMode && (
            <button className="btn btn--ghost btn--sm" onClick={onExitTeam} style={{ color: 'var(--red-text)', fontSize: '0.75rem' }}>
              🚪 Salir del Equipo
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
