'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos')
    } finally {
      setFetching(false)
    }
  }, [supabase])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
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
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
              <div className="h-8 w-12 rounded bg-gray-200" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4 h-5 w-36 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-2 text-lg font-medium text-red-600">Error al cargar el dashboard</p>
        <p className="mb-4 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchData}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {user?.nombre ?? 'Operador'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Panel de control del día de hoy
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-gray-500">{stat.label}</p>
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
            <p className="text-gray-500">No hay pedidos aún</p>
            <p className="mt-1 text-sm text-gray-400">
              Crea tu primer pedido desde la sección Pedidos
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Código
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Palabra clave
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell">
                    Retiro
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell">
                    Entrega
                  </th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 lg:table-cell">
                    Creado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pedidos.map((pedido) => (
                  <tr
                    key={pedido.id}
                    onClick={() => router.push(`/operador/pedidos/${pedido.id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-gray-900">
                      {pedido.codigo ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-700">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide">
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
                    <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-500 md:table-cell">
                      {pedido.retiro_direccion}
                    </td>
                    <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-500 md:table-cell">
                      {pedido.entrega_direccion}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-gray-500 lg:table-cell">
                      {formatDate(pedido.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
