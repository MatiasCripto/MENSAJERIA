'use client'

import { createClient } from '@/lib/supabase/client'
import { getEstadoColor, getEstadoLabel, formatDate, formatTime, getTipoIntentoLabel } from '@/lib/utils/format'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const MapWithNoSSR = dynamic(() => import('@/components/shared/Map'), { ssr: false })

type Pedido = {
  id: string
  codigo: number
  palabra_clave: string
  estado: string
  cadete_id: string | null
  retiro_direccion: string
  retiro_contacto: string
  retiro_telefono: string
  entrega_direccion: string
  entrega_contacto: string
  entrega_telefono: string
  notas: string | null
  created_at: string
  updated_at: string
}

type Intento = {
  id: string
  tipo: string
  receptor_nombre: string | null
  created_at: string
}

type Ubicacion = {
  lat: number
  lng: number
  timestamp: string
}

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [intentos, setIntentos] = useState<Intento[]>([])
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    if (!token) return

    const fetchData = async () => {
      const { data, error: err } = await supabase
        .rpc('get_pedido_by_token', { p_token: token })

      if (err || data?.error) {
        setError('Pedido no encontrado')
        setLoading(false)
        return
      }

      setPedido(data.pedido)
      setIntentos(data.intentos || [])
      setUbicacion(data.ubicacion || null)
      setLoading(false)
    }

    fetchData()

    // Subscribe to realtime updates for this pedido
    const channel = supabase
      .channel(`tracking-${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos',
          filter: `token_cliente=eq.${token}`,
        },
        (payload) => {
          if (payload.new) setPedido(payload.new as Pedido)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [token, supabase])

  // Subscribe to cadete position updates
  useEffect(() => {
    if (!pedido?.cadete_id) return

    const channel = supabase
      .channel(`tracking-ubicacion-${pedido.cadete_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ubicaciones_cadete',
          filter: `cadete_id=eq.${pedido.cadete_id}`,
        },
        (payload) => {
          setUbicacion(payload.new as Ubicacion)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [pedido?.cadete_id, supabase])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !pedido) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-[#0a0a0a]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <span className="text-2xl">!</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Pedido no encontrado</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-zinc-400">
            Verificá que el link de seguimiento sea correcto.
          </p>
        </div>
      </div>
    )
  }

  const markers = []
  if (ubicacion) {
    markers.push({
      lat: ubicacion.lat,
      lng: ubicacion.lng,
      label: 'Cadete',
      popup: 'Ubicación actual del cadete',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white px-4 py-6 text-center shadow-sm dark:bg-[#1a1a1a]">
        <p className="text-sm text-gray-500 dark:text-zinc-400">Tu pedido</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{pedido.palabra_clave}</h1>
        <div className="mt-3">
          <span
            className={`inline-block rounded-full px-4 py-1.5 text-sm font-medium ${getEstadoColor(pedido.estado)}`}
          >
            {getEstadoLabel(pedido.estado)}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-4 p-4">
        {/* Map */}
        {markers.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-800">
            <MapWithNoSSR
              markers={markers}
              height="250px"
              center={[ubicacion!.lat, ubicacion!.lng]}
            />
          </div>
        )}

        {/* Delivery Address */}
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-[#1a1a1a]">
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400">Dirección de entrega</h2>
          <p className="mt-1 text-base font-medium text-gray-900 dark:text-white">{pedido.entrega_direccion}</p>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-zinc-300">
            {pedido.entrega_contacto} - {pedido.entrega_telefono}
          </p>
        </div>

        {/* Delivery confirmation */}
        {pedido.estado === 'entregado' && (
          <div className="rounded-xl bg-green-50 p-4 text-center shadow-sm dark:bg-green-950/30">
            <div className="text-3xl">✓</div>
            <h2 className="mt-1 text-lg font-semibold text-green-800 dark:text-green-400">Entregado</h2>
            {intentos.filter(i => i.tipo === 'entregado').length > 0 && (
              <div className="mt-1 text-sm text-green-600 dark:text-green-300">
                <p>Recibió: {intentos.filter(i => i.tipo === 'entregado')[0]?.receptor_nombre}</p>
                <p>{formatDate(intentos.filter(i => i.tipo === 'entregado')[0]?.created_at)}</p>
              </div>
            )}
          </div>
        )}

        {/* Failed attempts (without photos) */}
        {intentos.filter(i => i.tipo === 'no_atendio' || i.tipo === 'cerrado' || i.tipo === 'otro').length > 0 && (
          <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-[#1a1a1a]">
            <h2 className="mb-3 text-sm font-medium text-gray-500 dark:text-zinc-400">Intentos de entrega</h2>
            <div className="space-y-3">
              {intentos
                .filter(i => i.tipo === 'no_atendio' || i.tipo === 'cerrado' || i.tipo === 'otro')
                .map((intento) => (
                  <div key={intento.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-xs font-medium text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-400">
                      !
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {getTipoIntentoLabel(intento.tipo)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">
                        {formatDate(intento.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Pickup info */}
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-[#1a1a1a]">
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400">Dirección de retiro</h2>
          <p className="mt-1 text-sm text-gray-900 dark:text-white">{pedido.retiro_direccion}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="pb-8 text-center">
        <p className="text-xs text-gray-400 dark:text-zinc-500">
          Código: #{pedido.codigo}
        </p>
      </div>
    </div>
  )
}
