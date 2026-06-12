import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Réplica local de api/riot.js para `npm run dev` (Vite no levanta las
// funciones serverless de Vercel). La clave se lee del .env en el proceso
// del servidor de desarrollo y nunca llega al bundle del cliente.
function riotDevProxy(env) {
  return {
    name: 'riot-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/riot', async (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        const reqUrl = new URL(req.url, 'http://localhost')
        const targetUrlStr = reqUrl.searchParams.get('url')
        if (!targetUrlStr) return send(400, { error: 'Falta el parámetro de consulta "url"' })

        const apiKey = env.RIOT_API_KEY || env.VITE_RIOT_API_KEY || ''
        if (!apiKey) return send(503, { error: 'RIOT_KEY_MISSING' })

        let targetUrlObj
        try {
          targetUrlObj = new URL(targetUrlStr)
        } catch {
          return send(400, { error: 'URL de destino inválida' })
        }
        if (targetUrlObj.protocol !== 'https:' || !targetUrlObj.hostname.endsWith('.api.riotgames.com')) {
          return send(403, { error: 'Host de destino no permitido' })
        }
        targetUrlObj.searchParams.delete('api_key')

        try {
          const response = await fetch(targetUrlObj.toString(), {
            headers: { 'X-Riot-Token': apiKey },
          })
          const text = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
          const retryAfter = response.headers.get('retry-after')
          if (retryAfter) res.setHeader('Retry-After', retryAfter)
          res.end(text)
        } catch (err) {
          send(502, { error: 'Error al conectar con Riot: ' + err.message })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), riotDevProxy(env)],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@supabase')) return 'vendor-supabase'
              if (id.includes('react')) return 'vendor-react'
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
