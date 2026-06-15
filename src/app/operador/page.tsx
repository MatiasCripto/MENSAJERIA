'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import {
  formatDate,
  getEstadoColor,
  getEstadoLabel,
} from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

type Pedido = {
  id: string
  codigo: string
  palabra_clave: string
  estado: string
  retiro_direccion: string
  entrega_direccion: string
  created_at: string
}

type Stats = {
  total: number
  pendiente: number
  en_camino: number
  entregado: number
}

type CadeteStats = {
  id: string
  nombre: string
  entregados: number
  kmRecorridos: number
  tiempoParadas: number
  ultimoMovimiento: string | null
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function detectarParadas(puntos: Array<{ lat: number; lng: number; timestamp: string }>): number {
  if (puntos.length < 2) return 0
  let totalMin = 0
  let enParada = false
  let inicioParada = ''

  for (let i = 1; i < puntos.length; i++) {
    const p = puntos[i]
    const ant = puntos[i - 1]
    const dist = haversineDistance(ant.lat, ant.lng, p.lat, p.lng)
    const tiempoMs = new Date(p.timestamp).getTime() - new Date(ant.timestamp).getTime()
    const tiempoMin = tiempoMs / 60000

    if (dist < 50 && tiempoMin > 2) {
      if (!enParada) {
        enParada = true
        inicioParada = ant.timestamp
      }
    } else if (enParada) {
      const duracion = (new Date(p.timestamp).getTime() - new Date(inicioParada).getTime()) / 60000
      if (duracion >= 1) totalMin += duracion
      enParada = false
    }
  }

  return Math.round(totalMin)
}

function calcularKm(puntos: Array<{ lat: number; lng: number }>): number {
  let total = 0
  for (let i = 1; i < puntos.length; i++) {
    total += haversineDistance(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng)
  }
  return Math.round((total / 1000) * 100) / 100
}

export default function OperadorDashboard() {
  const { user, loading, isOperador } = useSession()
  const router = useRouter()
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pendiente: 0,
    en_camino: 0,
    entregado: 0,
  })
  const [cadeteStats, setCadeteStats] = useState<CadeteStats[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)

      // Fetch recent orders
      const { data: pedidosData, error: pedidosError } = await supabase
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)

      if (pedidosError) throw pedidosError

      setPedidos(pedidosData ?? [])

      // Fetch today's stats
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: todayData, error: todayError } = await supabase
        .from('pedidos')
        .select('estado')
        .gte('created_at', todayStart.toISOString())

      if (todayError) throw todayError

      const all = todayData ?? []
      setStats({
        total: all.length,
        pendiente: all.filter((p) => p.estado === 'pendiente').length,
        en_camino: all.filter(
          (p) => p.estado === 'en_camino' || p.estado === 'en_retiro' || p.estado === 'asignado',
        ).length,
        entregado: all.filter((p) => p.estado === 'entregado').length,
      })
      // Fetch cadete day stats from recorridos
      const { data: cadetesActivos } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .eq('rol', 'cadete')
        .eq('activo', true)

      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)

      // Get today's recorridos for all cadetes
      const { data: recorridosHoy } = await supabase
        .from('recorridos')
        .select('cadete_id, lat, lng, timestamp')
        .gte('timestamp', hoy.toISOString())

      // Get today's delivered pedidos per cadete
      const { data: entregadosHoy } = await supabase
        .from('pedidos')
        .select('cadete_id')
        .eq('estado', 'entregado')
        .gte('updated_at', hoy.toISOString())

      const entregadosPorCadete: Record<string, number> = {}
      if (entregadosHoy) {
        for (const p of entregadosHoy) {
          if (p.cadete_id) {
            entregadosPorCadete[p.cadete_id] = (entregadosPorCadete[p.cadete_id] ?? 0) + 1
          }
        }
      }

      // Build cadete stats
      const statsList: CadeteStats[] = []
      const recorridosPorCadete: Record<string, Array<{ lat: number; lng: number; timestamp: string }>> = {}
      if (recorridosHoy) {
        for (const r of recorridosHoy) {
          if (!recorridosPorCadete[r.cadete_id]) recorridosPorCadete[r.cadete_id] = []
          recorridosPorCadete[r.cadete_id]!.push(r)
        }
      }

      if (cadetesActivos) {
        for (const c of cadetesActivos) {
          const puntos = recorridosPorCadete[c.id] ?? []
          const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null

          statsList.push({
            id: c.id,
            nombre: c.nombre,
            entregados: entregadosPorCadete[c.id] ?? 0,
            kmRecorridos: calcularKm(puntos),
            tiempoParadas: detectarParadas(puntos),
            ultimoMovimiento: ultimo?.timestamp ?? null,
          })
        }
      }

      setCadeteStats(statsList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setFetching(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!loading && !isOperador) {
      if (Capacitor.isNativePlatform()) {
        localStorage.setItem('redirectAfterLogin', '/login')
        window.location.reload()
      } else {
        router.replace('/login')
      }
      return
    }

    if (!loading && isOperador) {
      fetchData()
    }
  }, [loading, isOperador, router, fetchData])

  // Realtime subscription for pedidos changes
  useEffect(() => {
    if (!isOperador) return

    const channel = supabase
      .channel('operador-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => {
          fetchData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOperador, supabase, fetchData])

  if (loading || fetching) {
    return (
      <div className="space-y-6">
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
              <div className="mb-2 h-4 w-20 rounded bg-gray-200 dark:bg-zinc-700" />
              <div className="h-8 w-12 rounded bg-gray-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
          <div className="mb-4 h-5 w-36 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100 dark:bg-zinc-800" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-2 text-lg font-medium text-red-600 dark:text-red-400">Error al cargar el dashboard</p>
        <p className="mb-4 text-sm text-gray-500 dark:text-zinc-400">{error}</p>
        <button
          onClick={fetchData}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const statCards = [
    { label: 'Hoy', value: stats.total, color: 'text-gray-900' },
    { label: 'Pendientes', value: stats.pendiente, color: 'text-yellow-600' },
    { label: 'En tránsito', value: stats.en_camino, color: 'text-blue-600' },
    { label: 'Entregados', value: stats.entregado, color: 'text-green-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Bienvenido, {user?.nombre ?? 'Operador'}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Panel de control del día de hoy
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-gray-500 dark:text-zinc-400">{stat.label}</p>
            <p className={cn('mt-1 text-2xl font-bold', stat.color)}>
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Recent orders */}
      <Card title="Últimos pedidos">
        {pedidos.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-500 dark:text-zinc-400">No hay pedidos aún</p>
            <p className="mt-1 text-sm text-gray-400 dark:text-zinc-500">
              Crea tu primer pedido desde la sección Pedidos
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Código
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Palabra clave
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Estado
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400 md:table-cell">
                    Retiro
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400 md:table-cell">
                    Entrega
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400 lg:table-cell">
                    Creado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {pedidos.map((pedido) => (
                  <tr
                    key={pedido.id}
                    onClick={() => router.push(`/operador/pedidos/${pedido.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {pedido.codigo ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide dark:bg-zinc-800">
                        {pedido.palabra_clave}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                          getEstadoColor(pedido.estado),
                        )}
                      >
                        {getEstadoLabel(pedido.estado)}
                      </span>
                    </td>
                    <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-500 dark:text-zinc-400 md:table-cell">
                      {pedido.retiro_direccion}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-500 dark:text-zinc-400 md:table-cell">
                      {pedido.entrega_direccion}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-zinc-400 lg:table-cell">
                      {formatDate(pedido.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Cadetes hoy */}
      {cadeteStats.length > 0 && (
        <Card title="Cadetes hoy">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Cadete</th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Entregados</th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Km</th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Paradas</th>
                  <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Último movimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {cadeteStats.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700 dark:text-zinc-300">{c.entregados}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700 dark:text-zinc-300">{c.kmRecorridos} km</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700 dark:text-zinc-300">{c.tiempoParadas} min</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-500 dark:text-zinc-400">
                      {c.ultimoMovimiento
                        ? formatDate(c.ultimoMovimiento)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cadeteStats.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400 dark:text-zinc-500">
              No hay datos de cadetes para hoy
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
