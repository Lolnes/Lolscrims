/* ========================================================================
   Discord formatter — generates a formatted message for Discord
   ======================================================================== */

import { DAYS, ROLES, ROLE_MAP, TEAMS, TEAM_IDS, slotHour, fmt } from '../constants';

export function formatDiscord(data, windows, scrimWindows) {
  const { players, comps, threshold } = data;
  const lines = [];

  lines.push('⚔️ **Scrims disponibles esta semana** ⚔️');
  lines.push('');

  for (const t of TEAM_IDS) {
    const T = TEAMS[t];
    const roster = players.filter((p) => p.team === t);
    const emoji = t === 'azul' ? '🔵' : '🔴';
    lines.push(`${emoji} **${T.name}** (${roster.length} jugadores)`);

    for (const role of ROLES) {
      const p = roster.find((pl) => pl.role === role.id);
      const prefix = role === ROLES[ROLES.length - 1] ? '┗' : '┣';
      lines.push(`${prefix} ${role.icon} ${role.name}: ${p ? p.name : '*vacante*'}`);
    }
    lines.push('');
  }

  if (scrimWindows && scrimWindows.length > 0) {
    lines.push('📅 **Mejores ventanas de scrim:**');
    scrimWindows.slice(0, 5).forEach((w, i) => {
      const h = w.end - w.start + 1;
      lines.push(
        `• ${DAYS[w.day]} ${fmt(slotHour(w.start))}–${fmt((slotHour(w.end) + 1) % 24)} (${h}h)`
      );
    });
    lines.push('');
  }

  if (comps && comps.length > 0) {
    lines.push('🟢 **Comps guardadas:**');
    comps.slice(0, 3).forEach((c) => {
      const picks = ROLES.map((r) => c.slots[r.id] || '?').join('/');
      const team = c.team ? ` [${TEAMS[c.team]?.short || c.team}]` : '';
      lines.push(`• "${c.name}"${team} — ${picks}`);
    });
  }

  return lines.join('\n');
}
