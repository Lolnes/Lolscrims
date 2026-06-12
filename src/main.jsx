import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

/* Contenedor global de toasts: vive fuera de App para funcionar
   también en las pantallas de login y directorio de equipos. */
function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const t = e.detail
      setToasts((ts) => [...ts, t])
      setTimeout(() => setToasts((ts) => ts.map((x) => (x.id === t.id ? { ...x, leaving: true } : x))), 3800)
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== t.id)), 4060)
    }
    window.addEventListener('app-toast', onToast)
    return () => window.removeEventListener('app-toast', onToast)
  }, [])

  if (toasts.length === 0) return null
  const icons = { success: '✓', error: '⚠', info: 'ℹ' }
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type} ${t.leaving ? 'toast--leaving' : ''}`}>
          <span>{icons[t.type] || 'ℹ'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ToastContainer />
  </React.StrictMode>,
)
