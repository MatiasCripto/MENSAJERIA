'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Card } from '@/components/ui/Card'
import { formatTime } from '@/lib/utils/format'

const LiveMap = dynamic(() => import('./LiveMap'), { ssr: false })

type CadetePosition = {
  cadete_id: string
  lat: number
  lng: number
  timestamp: string
  cadete_nombre: string
}

type CadeteInfo = {
  id: string
  nombre: string
}

export default function MapaPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()
  const [positions, setPositions] = useState<CadetePosition[]>([])
  const [fetching, setFetching] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchPositions = useCallback(async () => {
    try {
      setError(null)

      // Get all active cadetes
      const { data: cadetes, error: cadetesError } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .eq('rol', 'cadete')
        .eq('activo', true)

      if (cadetesError) throw cadetesError

      if (!cadetes || cadetes.length === 0) {
        setPositions([])
        setLastUpdate(new Date())
        return
      }

      const cadeteMap = new Map<string, string>()
      cadetes.forEach((c: CadeteInfo) => cadeteMap.set(c.id, c.nombre))

      // Get latest position per cadete
      const { data: ubicaciones, error: ubicacionesError } = await supabase
        .from('ubicaciones_cadete')
        .select('*')

      if (ubicacionesError) throw ubicacionesError

      const latestPositions = new Map<string, CadetePosition>()

      ;(ubicaciones ?? []).forEach((u: { cadete_id: string; lat: number; lng: number; timestamp: string }) => {
        const existing = latestPositions.get(u.cadete_id)
        if (!existing || new Date(u.timestamp) > new Date(existing.timestamp)) {
          latestPositions.set(u.cadete_id, {
            cadete_id: u.cadete_id,
            lat: u.lat,
            lng: u.lng,
            timestamp: u.timestamp,
            cadete_nombre: cadeteMap.get(u.cadete_id) ?? 'Desconocido',
          })
        }
      })

      setPositions(Array.from(latestPositions.values()))
      setLastUpdate(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ubicaciones')
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
      fetchPositions()
    }
  }, [loading, isOperador, router, fetchPositions])

  // Realtime subscription for ubicaciones_cadete updates
  useEffect(() => {
    if (!isOperador) return

    const channel = supabase
      .channel('mapa-ubicaciones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ubicaciones_cadete',
        },
        async () => {
          // Refetch positions on any change
          await fetchPositions()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOperador, supabase, fetchPositions])

  // Periodic refresh every 15 seconds as fallback
  useEffect(() => {
    if (!isOperador) return

    const interval = setInterval(fetchPositions, 15000)
    return () => clearInterval(interval)
  }, [isOperador, fetchPositions])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mapa en vivo</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Ubicación de los cadetes en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-zinc-400">
          {lastUpdate && (
            <span>
              Última actualización: {formatTime(lastUpdate.toISOString())}
            </span>
          )}
          <button
            onClick={fetchPositions}
            disabled={fetching}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-[#1a1a1a] dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
          >
            {fetching ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Cadete count */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Cadetes activos</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {positions.length}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Con ubicación</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {positions.filter((p) => p.lat && p.lng).length}
          </p>
        </Card>
      </div>

      {/* Cadete list */}
      {positions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {positions.map((pos) => (
            <span
              key={pos.cadete_id}
              className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200 dark:bg-green-950/30 dark:text-green-400 dark:ring-green-900"
            >
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {pos.cadete_nombre}
            </span>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={fetchPositions}
            className="mt-2 text-sm font-medium text-red-700 underline hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Map area */}
      <div className="flex-1">
        {fetching && positions.length === 0 ? (
          <div className="flex h-full min-h-[400px] items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800">
            <p className="text-sm text-gray-500 dark:text-zinc-400">Cargando ubicaciones...</p>
          </div>
        ) : (
          <LiveMap positions={positions} />
        )}
      </div>
    </div>
  )
}
