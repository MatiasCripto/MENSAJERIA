'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useRef } from 'react'

export function useCadetePosition(cadeteId: string | undefined) {
  const watchRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const positionRef = useRef<GeolocationPosition | null>(null)
  const supabase = createClient()

  // Get the cadete's currently active pedido (first one found)
  const getActivePedidoId = useCallback(async (): Promise<string | null> => {
    if (!cadeteId) return null

    const { data } = await supabase
      .from('pedidos')
      .select('id')
      .eq('cadete_id', cadeteId)
      .in('estado', ['asignado', 'en_retiro', 'en_camino'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data?.id ?? null
  }, [cadeteId, supabase])

  const sendPosition = useCallback(async () => {
    const pos = positionRef.current
    if (!pos || !cadeteId) return

    const payload = {
      cadete_id: cadeteId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: new Date().toISOString(),
    }

    // 1. Upsert latest position (keeps ubicaciones_cadete up to date)
    const { error: upsertError } = await supabase
      .from('ubicaciones_cadete')
      .upsert(payload, { onConflict: 'cadete_id' })

    if (upsertError) {
      console.error('[CADETE GPS] upsert error:', upsertError.message)
    }

    // 2. Also insert into recorridos for history tracking
    const pedidoId = await getActivePedidoId()

    const { error: insertError } = await supabase.from('recorridos').insert({
      cadete_id: cadeteId,
      pedido_id: pedidoId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: payload.timestamp,
    })

    if (insertError) {
      console.error('[CADETE GPS] recorridos insert error:', insertError.message)
    }
  }, [cadeteId, supabase, getActivePedidoId])

  useEffect(() => {
    if (!cadeteId || !navigator.geolocation) {
      return
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        positionRef.current = pos
      },
      (err) => {
        console.error('[CADETE GPS] watchPosition error:', err.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    )

    intervalRef.current = setInterval(sendPosition, 15000)
    sendPosition()

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [cadeteId, sendPosition])

  return { sendPosition }
}
