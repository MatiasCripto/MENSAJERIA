'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getEstadoColor, getEstadoLabel, formatDate } from '@/lib/utils/format'
import Link from 'next/link'

type Pedido = {
  id: string
  palabra_clave: string
  estado: string
  retiro_direccion: string
  retiro_contacto: string | null
  retiro_telefono: string | null
  entrega_direccion: string
  entrega_contacto: string | null
  entrega_telefono: string | null
  notas: string | null
  created_at: string
  cadete_id: string
}

const PRIORITY: Record<string, number> = {
  en_retiro: 0,
  en_camino: 1,
  asignado: 2,
}

export default function CadetePage() {
  const { user, loading: sessionLoading } = useSession()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const fetchPedidos = useCallback(async () => {
    if (!user?.id) return

    const { data } = await supabase
      .from('pedidos')
      .select('*')
      .eq('cadete_id', user.id)
      .in('estado', ['asignado', 'en_retiro', 'en_camino'])
      .order('created_at', { ascending: false })

    if (data) setPedidos(data)
    setLoading(false)
    setRefreshing(false)
  }, [user, supabase])

  useEffect(() => {
    if (!sessionLoading && user) {
      fetchPedidos()
    }
  }, [sessionLoading, user, fetchPedidos])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchPedidos()
  }

  // Loading skeleton
  if (sessionLoading || loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]"
          >
            <div className="mb-2 h-6 w-24 rounded bg-gray-200 dark:bg-zinc-700" />
            <div className="mb-1 h-4 w-48 rounded bg-gray-100 dark:bg-zinc-800" />
            <div className="h-4 w-36 rounded bg-gray-100 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    )
  }

  // Sort by priority: en_retiro > en_camino > asignado
  const groupedPedidos = [...pedidos].sort(
    (a, b) => (PRIORITY[a.estado] ?? 99) - (PRIORITY[b.estado] ?? 99),
  )

  // Empty state
  if (pedidos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="mb-4 h-16 w-16 text-gray-300 dark:text-zinc-600"
        >
          <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM13.5 15h-12v2.625c0 1.036.84 1.875 1.875 1.875h.375v-1.5a1.5 1.5 0 0 1 3 0v1.5h1.5v-1.5a1.5 1.5 0 0 1 3 0v1.5h.375c1.035 0 1.875-.84 1.875-1.875V15Z" />
        </svg>
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          No tenés pedidos asignados
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Cuando te asignen un pedido, aparecerá acá.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={handleRefresh}
        >
          Buscar pedidos
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Mis pedidos</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.413a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.413l.311.312a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.45-.408Zm-.857-3.717a5.5 5.5 0 0 1-8.496-1.05L5.66 7.969h2.413a.75.75 0 0 1 0 1.5H3.989a.75.75 0 0 1-.75-.75V4.477a.75.75 0 0 1 1.5 0v2.412l.311-.312a7 7 0 0 1 11.502 3.052.75.75 0 0 1-1.447.408Z"
              clipRule="evenodd"
            />
          </svg>
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </Button>
      </div>

      {/* Pedido Cards */}
      <div className="space-y-3">
        {groupedPedidos.map((pedido) => {
          const direccion =
            pedido.estado === 'en_retiro'
              ? pedido.retiro_direccion
              : pedido.entrega_direccion
          const contacto =
            pedido.estado === 'en_retiro'
              ? pedido.retiro_contacto
              : pedido.entrega_contacto
          const telefono =
            pedido.estado === 'en_retiro'
              ? pedido.retiro_telefono
              : pedido.entrega_telefono

          return (
            <Link
              key={pedido.id}
              href={`/cadete/pedidos/${pedido.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md active:scale-[0.99] dark:border-zinc-800 dark:bg-[#1a1a1a]"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {pedido.estado === 'en_retiro'
                    ? 'Retiro'
                    : pedido.estado === 'en_camino'
                      ? 'Entrega'
                      : 'Pedido'}
                </h2>
                <Badge className={getEstadoColor(pedido.estado)}>
                  {getEstadoLabel(pedido.estado)}
                </Badge>
              </div>
              <p className="mb-1 text-sm text-gray-600 dark:text-zinc-300">{direccion}</p>
              {contacto && (
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  {contacto}
                  {telefono ? ` — ${telefono}` : ''}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                {formatDate(pedido.created_at)}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
