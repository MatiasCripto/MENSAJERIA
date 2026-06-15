'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import dynamic from 'next/dynamic'
import type { Recorrido, Parada } from '@/lib/types'

const RecorridosMap = dynamic(() => import('./RecorridosMap'), { ssr: false })

type CadeteOption = { id: string; nombre: string }

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

function detectarParadas(puntos: Recorrido[]): Parada[] {
  if (puntos.length < 2) return []

  const paradas: Parada[] = []
  let enParada = false
  let inicioParada: Recorrido | null = null
  let inicioLat = 0
  let inicioLng = 0
  let prevLat = 0
  let prevLng = 0

  for (let i = 1; i < puntos.length; i++) {
    const p = puntos[i]
    const ant = puntos[i - 1]
    const dist = haversineDistance(ant.lat, ant.lng, p.lat, p.lng)
    const tiempoMs = new Date(p.timestamp).getTime() - new Date(ant.timestamp).getTime()
    const tiempoMin = tiempoMs / 60000

    if (dist < 50 && tiempoMin > 2) {
      if (!enParada) {
        enParada = true
        inicioParada = ant
        prevLat = ant.lat
        prevLng = ant.lng
        inicioLat = ant.lat
        inicioLng = ant.lng
      }
    } else {
      if (enParada && inicioParada) {
        const fin = ant
        const duracion = (new Date(fin.timestamp).getTime() - new Date(inicioParada.timestamp).getTime()) / 60000
        if (duracion >= 1) {
          paradas.push({
            lat: (inicioLat + prevLat) / 2,
            lng: (inicioLng + prevLng) / 2,
            inicio: new Date(inicioParada.timestamp),
            fin: new Date(fin.timestamp),
            duracionMinutos: Math.round(duracion),
          })
        }
        enParada = false
        inicioParada = null
      }
    }
  }

  // Handle case where the track ends while still stopped
  if (enParada && inicioParada) {
    const last = puntos[puntos.length - 1]
    const duracion = (new Date(last.timestamp).getTime() - new Date(inicioParada.timestamp).getTime()) / 60000
    if (duracion >= 1) {
      paradas.push({
        lat: (inicioLat + last.lat) / 2,
        lng: (inicioLng + last.lng) / 2,
        inicio: new Date(inicioParada.timestamp),
        fin: new Date(last.timestamp),
        duracionMinutos: Math.round(duracion),
      })
    }
  }

  return paradas
}

function calcularKmRecorridos(puntos: Recorrido[]): number {
  let total = 0
  for (let i = 1; i < puntos.length; i++) {
    total += haversineDistance(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng)
  }
  return Math.round((total / 1000) * 100) / 100
}

export default function RecorridosPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [cadetes, setCadetes] = useState<CadeteOption[]>([])
  const [cadeteId, setCadeteId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [puntos, setPuntos] = useState<Recorrido[]>([])
  const [selectedParadaIndex, setSelectedParadaIndex] = useState<number | null>(null)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
    }
  }, [loading, isOperador, router])

  // Load cadetes for filter
  useEffect(() => {
    if (!isOperador) return
    supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('rol', 'cadete')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (data) setCadetes(data)
      })
  }, [isOperador, supabase])

  const fetchRecorridos = async () => {
    if (!cadeteId || !fecha) return
    setFetching(true)

    const fechaInicio = `${fecha}T00:00:00Z`
    const fechaFin = `${fecha}T23:59:59Z`

    const { data } = await supabase
      .from('recorridos')
      .select('*')
      .eq('cadete_id', cadeteId)
      .gte('timestamp', fechaInicio)
      .lte('timestamp', fechaFin)
      .order('timestamp', { ascending: true })

    setPuntos(data ?? [])
    setFetching(false)
  }

  useEffect(() => {
    if (cadeteId && fecha) {
      fetchRecorridos()
    }
  }, [cadeteId, fecha])

  const paradas = useMemo(() => detectarParadas(puntos), [puntos])
  const kmRecorridos = useMemo(() => calcularKmRecorridos(puntos), [puntos])
  const tiempoParadas = useMemo(
    () => paradas.reduce((acc, p) => acc + p.duracionMinutos, 0),
    [paradas],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recorridos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visualizá el recorrido de los cadetes por fecha
        </p>
      </div>

      {/* Filters */}
      <Card title="Filtros">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <Input
              label="Fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="w-64">
            <Select
              label="Cadete"
              options={[
                { value: '', label: 'Seleccionar cadete...' },
                ...cadetes.map((c) => ({ value: c.id, label: c.nombre })),
              ]}
              value={cadeteId}
              onChange={(e) => setCadeteId(e.target.value)}
            />
          </div>
          <Button onClick={fetchRecorridos} disabled={fetching || !cadeteId}>
            {fetching ? 'Cargando...' : 'Buscar'}
          </Button>
        </div>
      </Card>

      {puntos.length === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-gray-400">
            {cadeteId
              ? 'No hay recorridos registrados para la fecha seleccionada.'
              : 'Seleccioná un cadete y una fecha para ver su recorrido.'}
          </p>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <p className="text-sm text-gray-500">Puntos registrados</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{puntos.length}</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Km recorridos</p>
              <p className="mt-1 text-2xl font-bold text-white">{kmRecorridos} km</p>
            </Card>
            <Card>
              <p className="text-sm text-gray-500">Tiempo detenido</p>
              <p className="mt-1 text-2xl font-bold text-orange-600">{tiempoParadas} min</p>
            </Card>
          </div>

          {/* Map + Stops */}
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1">
              <RecorridosMap
                puntos={puntos}
                paradas={paradas}
                selectedParadaIndex={selectedParadaIndex}
              />
            </div>

            {/* Stops panel */}
            {paradas.length > 0 && (
              <div className="w-full lg:w-80">
                <Card title={`Paradas (${paradas.length})`}>
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {paradas.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedParadaIndex(i)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          selectedParadaIndex === i
                            ? 'border-red-500 bg-red-50 ring-1 ring-red-400 dark:border-red-600 dark:bg-red-950/30'
                            : 'border-orange-100 bg-orange-50 hover:border-orange-300 dark:border-orange-900/50 dark:bg-orange-950/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium text-orange-800">
                          <span>⏱</span>
                          <span>Parada #{i + 1}</span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-orange-700">
                          <p>
                            Inicio:{' '}
                            {p.inicio.toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p>
                            Fin:{' '}
                            {p.fin.toLocaleTimeString('es-AR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <p className="font-semibold">Duración: {p.duracionMinutos} min</p>
                          <p className="text-orange-500">
                            {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
