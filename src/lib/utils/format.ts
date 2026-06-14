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
    asignado: 'bg-blue-100 text-blue-800',
    en_retiro: 'bg-indigo-100 text-indigo-800',
    en_camino: 'bg-purple-100 text-purple-800',
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
