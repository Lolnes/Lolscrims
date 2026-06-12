/* ========================================================================
   Toast notifications — reemplazo de alert()
   Uso: notify('Guardado correctamente', 'success' | 'error' | 'info')
   ======================================================================== */

let counter = 0;

export function notify(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('app-toast', {
    detail: { id: `t_${Date.now()}_${counter++}`, message: String(message), type },
  }));
}
