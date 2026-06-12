export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const targetUrlStr = req.query?.url || new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('url');

  if (!targetUrlStr) {
    return res.status(400).json({ error: 'Falta el parámetro de consulta "url"' });
  }

  // RIOT_API_KEY (server-only) es la preferida; VITE_RIOT_API_KEY queda como
  // compatibilidad con la variable ya configurada en el dashboard de Vercel.
  const apiKey = process.env.RIOT_API_KEY || process.env.VITE_RIOT_API_KEY || '';
  if (!apiKey) {
    return res.status(503).json({ error: 'RIOT_KEY_MISSING' });
  }

  let targetUrlObj;
  try {
    targetUrlObj = new URL(targetUrlStr);
  } catch {
    return res.status(400).json({ error: 'URL de destino inválida' });
  }

  // Solo se permite reenviar a la API oficial de Riot — evita que terceros
  // usen este endpoint como proxy abierto con nuestra clave/cuota.
  if (targetUrlObj.protocol !== 'https:' || !targetUrlObj.hostname.endsWith('.api.riotgames.com')) {
    return res.status(403).json({ error: 'Host de destino no permitido' });
  }

  targetUrlObj.searchParams.delete('api_key');

  try {
    const response = await fetch(targetUrlObj.toString(), {
      headers: { 'X-Riot-Token': apiKey },
    });

    res.status(response.status);

    // Reenviar Retry-After para que el cliente respete el rate limit (docs de Riot)
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) res.setHeader('Retry-After', retryAfter);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    }
    const text = await response.text();
    return res.send(text);
  } catch (err) {
    console.error('Error en el proxy de Vercel:', err);
    return res.status(502).json({ error: 'Error al conectar con Riot: ' + err.message });
  }
}
