'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { formatDate, getEstadoColor, getEstadoLabel } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

type Pedido = {
  id: string
  codigo: string
  palabra_clave: string
  estado: string
  retiro_direccion: string
  retiro_contacto: string | null
  entrega_direccion: string
  entrega_contacto: string | null
  created_at: string
  cadete_id: string | null
}

type Cadete = {
  id: string
  nombre: string
}

type Filters = {
  estado: string
  cadete: string
}

const ESTADO_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'asignado', label: 'Asignado' },
  { value: 'en_retiro', label: 'En retiro' },
  { value: 'en_camino', label: 'En camino' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'fallido', label: 'Fallido' },
]

export default function PedidosPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [cadetes, setCadetes] = useState<Cadete[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>({ estado: '', cadete: '' })

  const fetchCadetes = useCallback(async () => {
    const { data } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('rol', 'cadete')
      .eq('activo', true)

    setCadetes(data ?? [])
  }, [supabase])

  const fetchPedidos = useCallback(async () => {
    try {
      setError(null)
      setFetching(true)

      let query = supabase
        .from('pedidos')
        .select('*')
        .order('created_at', { ascending: false })

      if (filters.estado) {
        query = query.eq('estado', filters.estado)
      }

      if (filters.cadete) {
        query = query.eq('cadete_id', filters.cadete)
      }

      const { data, error: pedidosError } = await query

      if (pedidosError) throw pedidosError

      setPedidos(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar pedidos')
    } finally {
      setFetching(false)
    }
  }, [supabase, filters])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
      return
    }

    if (!loading && isOperador) {
      fetchCadetes()
      fetchPedidos()
    }
  }, [loading, isOperador, router, fetchCadetes, fetchPedidos])

  const CADETE_OPTIONS = [
    { value: '', label: 'Todos los cadetes' },
    ...cadetes.map((c) => ({ value: c.id, label: c.nombre })),
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pedidos</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Gestiona todos los pedidos del sistema
          </p>
        </div>
        <Button onClick={() => router.push('/operador/pedidos/nuevo')}>
          + Nuevo Pedido
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="w-full sm:w-56">
          <Select
            label="Estado"
            options={ESTADO_OPTIONS}
            value={filters.estado}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, estado: e.target.value }))
            }
          />
        </div>
        <div className="w-full sm:w-56">
          <Select
            label="Cadete"
            options={CADETE_OPTIONS}
            value={filters.cadete}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, cadete: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={fetchPedidos}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {fetching && !error && (
        <Card>
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100 dark:bg-zinc-800" />
            ))}
          </div>
        </Card>
      )}

      {/* Table */}
      {!fetching && !error && (
        <Card>
          {pedidos.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-lg font-medium text-gray-500 dark:text-zinc-400">
                No hay pedidos
              </p>
              <p className="mt-1 text-sm text-gray-400 dark:text-zinc-500">
                {filters.estado || filters.cadete
                  ? 'No se encontraron pedidos con los filtros seleccionados'
                  : 'Crea tu primer pedido para comenzar'}
              </p>
              {!filters.estado && !filters.cadete && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.push('/operador/pedidos/nuevo')}
                >
                  + Nuevo Pedido
                </Button>
              )}
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
                      Destinatario
                    </th>
                    <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400 md:table-cell">
                      Entrega
                    </th>
                    <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400 lg:table-cell">
                      Creado
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                  {pedidos.map((pedido) => (
                    <tr
                      key={pedido.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                      onClick={() =>
                        router.push(`/operador/pedidos/${pedido.id}`)
                      }
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
                      <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-700 dark:text-zinc-300 md:table-cell">
                        {pedido.entrega_contacto || '-'}
                      </td>
                      <td className="hidden max-w-[200px] truncate px-3 py-3 text-sm text-gray-500 dark:text-zinc-400 md:table-cell">
                        {pedido.entrega_direccion}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-3 text-sm text-gray-500 dark:text-zinc-400 lg:table-cell">
                        {formatDate(pedido.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/operador/pedidos/${pedido.id}`)
                          }}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Realtime subscription */}
      {isOperador && (
        <RealtimePedidos onUpdate={fetchPedidos} />
      )}
    </div>
  )
}

/** Subscribes to realtime changes on pedidos table */
function RealtimePedidos({ onUpdate }: { onUpdate: () => void }) {
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('pedidos-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
        },
        () => {
          onUpdate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, onUpdate])

  return null
}
