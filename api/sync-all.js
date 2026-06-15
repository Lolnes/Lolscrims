import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase desde el entorno del servidor
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const isSupabaseConfigured = !!(supabaseUrl && supabaseServiceKey);

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Rangos de League of Legends y su LP base correspondiente para calcular el valor total
const TIER_BASES = {
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
const DIVISIONS = ['IV', 'III', 'II', 'I'];

function rankToLp(tier, division, lp) {
  const t = (tier || 'UNRANKED').toUpperCase();
  if (t === 'UNRANKED') return 0;
  
  if (t === 'MASTER' || t === 'GRANDMASTER' || t === 'CHALLENGER') {
    return 2900 + (Number(lp) || 0);
  }
  
  const base = TIER_BASES[t] ?? 0;
  const divIndex = DIVISIONS.indexOf(division || 'IV');
  const divLp = (divIndex >= 0 ? divIndex : 0) * 100;
  return base + divLp + (Number(lp) || 0);
}

function getRiotRegionsFromTag(tag) {
  const t = (tag || '').toUpperCase().trim();
  if (t === 'KR' || t === 'KR1') return { region: 'kr', routing: 'asia' };
  if (t === 'EUW' || t === 'EUW1') return { region: 'euw1', routing: 'europe' };
  if (t === 'EUNE' || t === 'EUN1') return { region: 'eun1', routing: 'europe' };
  if (t === 'NA' || t === 'NA1') return { region: 'na1', routing: 'americas' };
  if (t === 'LAS' || t === 'LA2') return { region: 'la2', routing: 'americas' };
  if (t === 'BR' || t === 'BR1') return { region: 'br1', routing: 'americas' };
  return { region: 'la1', routing: 'americas' };
}

// Helper para hacer llamadas a la API de Riot con reintentos si nos topamos con rate limits
async function fetchRiot(url, apiKey, retries = 1) {
  const res = await fetch(url, {
    headers: { 'X-Riot-Token': apiKey }
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
    if (retries > 0) {
      console.warn(`[Riot API] Rate limit (429) detectado. Esperando ${retryAfter}s para reintentar...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000 + 500));
      return fetchRiot(url, apiKey, retries - 1);
    }
    throw new Error('Límite de peticiones de Riot excedido.');
  }

  if (!res.ok) {
    throw new Error(`Riot API Error (${res.status}): ${res.statusText}`);
  }

  return res.json();
}

export default async function handler(req, res) {
  // 1. Proteger el endpoint si estamos en Vercel y hay CRON_SECRET definido
  const vercelCronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (vercelCronSecret && authHeader !== `Bearer ${vercelCronSecret}`) {
    return res.status(401).json({ error: 'No autorizado. Token de cron inválido.' });
  }

  if (!isSupabaseConfigured) {
    return res.status(500).json({ error: 'Supabase no está configurado en el servidor.' });
  }

  const apiKey = process.env.RIOT_API_KEY || process.env.VITE_RIOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RIOT_API_KEY no configurada en el servidor.' });
  }

  try {
    // 2. Obtener usuarios con summoner name activo
    const { data: users, error: dbError } = await supabase
      .from('users')
      .select('id, name, summoner_name, current_lp_value')
      .neq('summoner_name', '')
      .not('summoner_name', 'is', null);

    if (dbError) throw dbError;
    if (!users || users.length === 0) {
      return res.status(200).json({ status: 'success', message: 'No hay usuarios registrados con Summoner Name para sincronizar.' });
    }

    console.log(`[Cron Sync] Iniciando actualización de ${users.length} usuarios...`);
    const results = [];

    // 3. Procesar usuarios uno por uno de forma secuencial para respetar el rate limit de Riot
    for (const user of users) {
      const parts = user.summoner_name.split('#');
      const gameName = parts[0]?.trim();
      const tagLine = parts[1]?.trim();

      if (!gameName || !tagLine) {
        results.push({ user: user.name, status: 'error', reason: 'Formato Riot ID incorrecto' });
        continue;
      }

      const { region, routing } = getRiotRegionsFromTag(tagLine);

      try {
        // A. Obtener PUUID
        const accountUrl = `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
        const account = await fetchRiot(accountUrl, apiKey);
        const puuid = account.puuid;

        if (!puuid) {
          throw new Error('No se pudo resolver el PUUID.');
        }

        // B. Obtener liga (SoloQ)
        const leagueUrl = `https://${region}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
        const leagueEntries = await fetchRiot(leagueUrl, apiKey);

        const soloQEntry = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5');
        
        let tier = 'UNRANKED';
        let division = 'IV';
        let lp = 0;
        let lpValue = 0;
        let isRanked = false;

        if (soloQEntry) {
          tier = soloQEntry.tier;
          division = soloQEntry.rank || 'IV';
          lp = soloQEntry.leaguePoints;
          lpValue = rankToLp(tier, division, lp);
          isRanked = true;
          if (lpValue < 0) lpValue = 0;
        }

        // C. Actualizar perfil de usuario
        const { error: updateProfileErr } = await supabase
          .from('users')
          .update({
            current_tier: tier,
            current_division: division,
            current_lp: lp,
            current_lp_value: lpValue
          })
          .eq('id', user.id);

        if (updateProfileErr) throw updateProfileErr;

        // D. Actualizar ladders activos (solo si está rankeado y tiene LP)
        if (isRanked && lpValue > 0) {
          const { data: activeLadders } = await supabase
            .from('ladders')
            .select('id')
            .eq('status', 'active');

          if (activeLadders && activeLadders.length > 0) {
            const activeIds = activeLadders.map(l => l.id);
            await supabase
              .from('ladder_participants')
              .update({ current_lp: lpValue, last_updated: new Date() })
              .eq('user_id', user.id)
              .in('ladder_id', activeIds);
          }
        }

        results.push({
          user: user.name,
          summoner: user.summoner_name,
          status: 'success',
          rank: `${tier} ${division} (${lp} LP)`
        });

        // Espera mínima de 1.5 segundos entre usuarios para evitar saturar la cuota de la Riot API key
        await new Promise(r => setTimeout(r, 1500));

      } catch (err) {
        console.error(`[Cron Sync] Error sincronizando usuario ${user.name}:`, err.message);
        results.push({
          user: user.name,
          summoner: user.summoner_name,
          status: 'error',
          reason: err.message
        });
      }
    }

    return res.status(200).json({
      status: 'success',
      processedCount: users.length,
      results
    });

  } catch (globalError) {
    console.error('[Cron Sync] Error global en el job:', globalError.message);
    return res.status(502).json({ error: 'Error en la sincronización global: ' + globalError.message });
  }
}
