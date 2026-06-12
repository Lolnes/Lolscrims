/* ========================================================================
   useDragon — fetches champion data from Data Dragon CDN
   Caches in localStorage with 24h TTL
   ======================================================================== */

import { useState, useEffect } from 'react';
import { DDRAGON_BASE } from '../constants';

const CACHE_KEY = 'lol-ddragon-cache-v2';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export default function useDragon() {
  const [champions, setChampions] = useState(null); // Map<id, {id, name, tags, icon}>
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Check cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { ts, data, ver } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL && data) {
            if (!cancelled) {
              setChampions(data);
              setVersion(ver);
              setLoading(false);
            }
            return;
          }
        }
      } catch { /* cache miss */ }

      // Fetch from CDN
      try {
        const versionsRes = await fetch(`${DDRAGON_BASE}/api/versions.json`);
        const versions = await versionsRes.json();
        const latestVersion = versions[0];

        const champRes = await fetch(
          `${DDRAGON_BASE}/cdn/${latestVersion}/data/es_ES/champion.json`
        );
        const champData = await champRes.json();

        const champMap = {};
        for (const [key, champ] of Object.entries(champData.data)) {
          champMap[key] = {
            id: champ.id,
            name: champ.name,
            tags: champ.tags || [],
            icon: `${DDRAGON_BASE}/cdn/${latestVersion}/img/champion/${champ.id}.png`,
          };
        }

        // Cache it
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data: champMap, ver: latestVersion })
          );
        } catch { /* storage full, that's ok */ }

        if (!cancelled) {
          setChampions(champMap);
          setVersion(latestVersion);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { champions, version, loading, error };
}
