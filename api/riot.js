export default async function handler(req, res) {
  // Configuración de CORS para permitir peticiones desde desarrollo local (localhost)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Extraer la URL de destino desde los parámetros de consulta
  const targetUrlStr = req.query?.url || new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('url');

  if (!targetUrlStr) {
    return res.status(400).json({ error: 'Falta el parámetro de consulta "url"' });
  }

  // Obtener la clave API de Riot configurada en el Dashboard de Vercel
  const apiKey = process.env.VITE_RIOT_API_KEY || '';
  if (!apiKey) {
    return res.status(500).json({ error: 'Riot API Key no configurada en las variables de entorno de Vercel' });
  }

  try {
    // Re-escribir la URL agregando de forma segura la API Key en el servidor
    const targetUrlObj = new URL(targetUrlStr);
    targetUrlObj.searchParams.set('api_key', apiKey);
    const finalRiotUrl = targetUrlObj.toString();

    const response = await fetch(finalRiotUrl);
    
    // Retornar el mismo estado HTTP devuelto por Riot Games
    res.status(response.status);
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const text = await response.text();
      return res.send(text);
    }
  } catch (err) {
    console.error('Error en el proxy de Vercel:', err);
    return res.status(500).json({ error: 'Error interno en el servidor proxy de Vercel: ' + err.message });
  }
}
