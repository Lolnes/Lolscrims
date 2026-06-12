/* ========================================================================
   Constants — LoL Team Planner
   ======================================================================== */

export const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const START_HOUR = 10;
export const NUM_SLOTS = 16;
export const slotHour = (i) => (START_HOUR + i) % 24;
export const fmt = (h) => `${String(h).padStart(2, '0')}:00`;

export const STORAGE_KEY = 'lol-team-planner-v3';
export const OLD_KEYS = ['lol-scheduler-v2', 'lol-scheduler-v1'];

export const GOLD = '#c9aa71';
export const GOLD_BRIGHT = '#f0c75e';

export const TEAMS = {
  azul: {
    name: 'Equipo Azul',
    short: 'Azul',
    color: '#3b82f6',
    bright: '#60a5fa',
    rgb: '59,130,246',
    chip: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.35)',
    text: '#93c5fd',
  },
  rojo: {
    name: 'Equipo Rojo',
    short: 'Rojo',
    color: '#ef4444',
    bright: '#f87171',
    rgb: '239,68,68',
    chip: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.35)',
    text: '#fca5a5',
  },
};

export const TEAM_IDS = ['azul', 'rojo'];

export const ROLES = [
  { id: 'top', name: 'Top',     icon: '🛡️', short: 'TOP' },
  { id: 'jg',  name: 'Jungla',  icon: '🌿', short: 'JG'  },
  { id: 'mid', name: 'Mid',     icon: '⚡', short: 'MID' },
  { id: 'adc', name: 'ADC',     icon: '🏹', short: 'ADC' },
  { id: 'sup', name: 'Soporte', icon: '💚', short: 'SUP' },
];

export const ROLE_MAP = Object.fromEntries(ROLES.map((r) => [r.id, r]));

export const COMP_STYLES = [
  'Teamfight',
  'Split',
  'Poke',
  'Pick',
  'Early',
  'Late',
  'Protect',
  'Dive',
  'Engage',
];

export const SCRIM_TAGS = [
  'Teamfight',
  'Early game',
  'Late game',
  'Drake control',
  'Baron control',
  'Macro',
  'Comunicación',
  'Rotaciones',
  'Vision control',
  'Dive comp',
];

export const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
