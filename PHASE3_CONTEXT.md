# LoL Team Planner — Phase 3 (Ladder & Game Tracker) Context & State

Este documento sirve como resumen del estado actual del proyecto, las características implementadas en la Fase 3, el funcionamiento técnico de la API de Riot Games y los puntos de resolución de problemas para compartir con una IA.

---

## 1. Contexto y Arquitectura Actual

El proyecto es un planificador web para equipos amateur y competitivos de League of Legends.

* **Frontend**: React 19 + Vite (JavaScript puro).
* **Base de Datos**: Supabase (PostgreSQL) con políticas RLS públicas habilitadas para modo serverless.
* **Hosting**: Desplegado en Vercel.
* **Seguridad de Riot API Key**: La API Key se configura como variable de entorno **`RIOT_API_KEY`** (sin prefijo `VITE_` — ese prefijo hace que Vite la compile dentro del bundle público del cliente). Solo el proxy del servidor la conoce.
* **Estructura del Proyecto**:
  * `src/App.jsx`: Monolito de componentes de la interfaz de usuario (incluye `LadderTab`).
  * `src/storage.js`: Capa de lógica de negocio y persistencia.
  * `api/riot.js`: **Función Serverless en Vercel** (Proxy de Node.js) que intercepta las consultas de Riot, inyecta la API Key del lado del servidor y las reenvía a Riot. Resuelve las políticas de CORS y el límite de peso de proxies públicos.
  * `schema.sql`: Migraciones de tablas en Supabase.

---

## 2. Lo que se ha implementado (Fase 3)

### A. Sistema de Ladder / Clasificación
* Permite crear ladders dentro de cada equipo (semanal, mensual, por season o personalizado).
* Se pueden invitar equipos rivales completos a participar de un mismo ladder local (competencias tipo "SoloQ Challenge").
* Tabla de posiciones ordenada por **LP Delta** (Progreso de puntos ganados desde el inicio del período del ladder).

### B. Mapeo por Servidores Reales (Challenger & Grandmaster)
* Eliminada toda lógica de porcentajes locales. Los rangos superiores se calculan comparando los LP absolutos con los **límites mínimos de corte reales de cada servidor** de League of Legends (ej. NA, EUW, LAS, LAN, KR).
* Los cortes de corte se obtienen de Riot API y se guardan en el `localStorage` del navegador bajo `lol-cutoffs-{region}`.
* Los rangos de Apex (Master, GM y Challenger) usan una escala continua a partir de Maestro (`currentLpNum` = LP real, `currentTier` = tier oficial en español).

### C. Tracker de Partidas y Cruces ("Head-to-Head")
* Al refrescar los puntos, se obtienen las 5 partidas más recientes del invocador vía Riot Match API.
* El sistema analiza a los otros 9 jugadores de cada partida y busca si coinciden con algún invocador registrado en Supabase.
* Destaca automáticamente las partidas con distintivos visuales si hubo un aliado (`🤝 Aliado con...`) o un rival (`⚔️ vs...`) de nuestra base de datos.

### D. Seguridad de Acceso
* Los nombres de usuario de las cuentas de la aplicación son **insensibles a mayúsculas** (case-insensitive) y únicos gracias a la adición del índice:
  `CREATE UNIQUE INDEX users_name_lower_idx ON users (LOWER(name));`

---

## 3. Estado de la Integración con Riot Games API

La API Key vive **únicamente en el servidor**. El cliente nunca la conoce ni la envía. Todas las llamadas pasan por `/api/riot?url={targetUrl}`:

1. **En Producción (Vercel)**:
   La función serverless `api/riot.js` lee `process.env.RIOT_API_KEY` (con fallback a `VITE_RIOT_API_KEY` por compatibilidad), valida que el destino sea `*.api.riotgames.com` (no es un proxy abierto) y añade la clave vía header `X-Riot-Token`.
2. **En Desarrollo Local (Localhost)**:
   `vite.config.js` incluye un middleware (`riotDevProxy`) que replica `/api/riot` en el servidor de desarrollo, leyendo `RIOT_API_KEY` desde `.env`. **Ya no se usan proxies públicos** (allorigins/corsproxy) — exponían la clave a terceros y truncaban respuestas >1MB.
3. **Sin clave configurada**: el proxy responde `503 {error:'RIOT_KEY_MISSING'}` y `syncUserGames` cae automáticamente a la simulación local.

Optimizaciones aplicadas:
- League entries se consulta por PUUID (`/lol/league/v4/entries/by-puuid/`) — se eliminó la llamada intermedia a summoner-v4.
- Los detalles de partidas se descargan en paralelo (`Promise.all`, máx. 5).
- Los cortes de Challenger/GM se cachean en localStorage con TTL de 6 horas.
- Fix: el campo de división de Riot es `rank` (no `division`) — antes todos quedaban en división IV.

---

## 4. Problemas Comunes y su Resolución (Troubleshooting)

### A. Error: "Riot API Key inválida o expirada (403 Forbidden)"
La clave solo existe en el servidor, así que el problema siempre está en la variable de entorno:
1. **Verificar la clave en Vercel**: Settings > Environment Variables debe tener `RIOT_API_KEY` con un valor vigente. La "Development API Key" de `developer.riotgames.com` **expira cada 24 horas** — hay que regenerarla y actualizar la variable. La "Personal API Key" aprobada dura más.
2. **Redeploy obligatorio**: cambiar una variable de entorno en Vercel NO afecta la web activa; las funciones serverless leen la variable solo al desplegarse. Hacer "Redeploy" desde el dashboard.
3. **En local**: la clave se lee de `.env` (`RIOT_API_KEY=RGAPI-...`). Reiniciar `npm run dev` después de cambiarla.
4. **Ya no aplica** limpiar localStorage por claves obsoletas: el cliente compilado no contiene ninguna clave.

### B. Error: "Content-Length header of network response exceeds response Body"
* *Ya no puede ocurrir*: los proxies públicos (causa del límite de 1MB) fueron eliminados. Todas las llamadas, también en desarrollo local, pasan por proxies propios sin límite de tamaño.

### C. ⚠️ Acción pendiente de seguridad
La clave anterior estuvo expuesta (compilada en el bundle del cliente con prefijo `VITE_` y enviada por proxies públicos). **Regenerar la API Key en developer.riotgames.com**, guardarla como `RIOT_API_KEY` en Vercel y en `.env` local, y hacer redeploy.
