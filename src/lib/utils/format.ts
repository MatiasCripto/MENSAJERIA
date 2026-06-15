export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function getEstadoColor(estado: string) {
  const colors: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    asignado: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
    en_retiro: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400',
    en_camino: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400',
    entregado: 'bg-green-100 text-green-800',
    fallido: 'bg-red-100 text-red-800',
  }
  return colors[estado] || 'bg-gray-100 text-gray-800'
}

export function getEstadoLabel(estado: string) {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    asignado: 'Asignado',
    en_retiro: 'En retiro',
    en_camino: 'En camino',
    entregado: 'Entregado',
    fallido: 'Fallido',
  }
  return labels[estado] || estado
}

export function getTipoIntentoLabel(tipo: string) {
  const labels: Record<string, string> = {
    entregado: 'Entregado',
    no_atendio: 'No atendió',
    cerrado: 'Cerrado',
    otro: 'Otro',
  }
  return labels[tipo] || tipo
}

const PALABRAS = ['FAROL', 'MONTE', 'BRISA', 'CORAL', 'PALMA', 'RIO', 'LUNA', 'SOL', 'PICO', 'LAGO', 'FARO', 'NUBE', 'MAR', 'VELA', 'ROCA', 'PINO', 'ALBA', 'DUNA', 'LOMA', 'CIMA']

export function generarPalabraClave() {
  return PALABRAS[Math.floor(Math.random() * PALABRAS.length)]
}
