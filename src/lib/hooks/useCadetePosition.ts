'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useRef } from 'react'

export function useCadetePosition(cadeteId: string | undefined) {
  const watchRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const positionRef = useRef<GeolocationPosition | null>(null)
  const supabase = createClient()

  const sendPosition = useCallback(async () => {
    const pos = positionRef.current
    if (!pos || !cadeteId) return

    const payload = {
      cadete_id: cadeteId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      timestamp: new Date().toISOString(),
    }

    console.log('[CADETE GPS] Enviando payload:', JSON.stringify(payload, null, 2))
    console.log('[CADETE GPS] coords:', {
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
      speed: pos.coords.speed,
    })

    const { data, error } = await supabase
      .from('ubicaciones_cadete')
      .upsert(payload, { onConflict: 'cadete_id' })

    if (error) {
      console.error('[CADETE GPS] ERROR:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
    } else {
      console.log('[CADETE GPS] OK:', data)
    }
  }, [cadeteId, supabase])

  useEffect(() => {
    if (!cadeteId || !navigator.geolocation) {
      console.warn('[CADETE GPS] GPS no disponible')
      return
    }

    console.log('[CADETE GPS] Iniciando watchPosition + intervalo 15s')

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        positionRef.current = pos
      },
      (err) => {
        console.error('[CADETE GPS] watchPosition error:', {
          code: err.code,
          message: err.message,
          PERMISSION_DENIED: err.PERMISSION_DENIED,
          POSITION_UNAVAILABLE: err.POSITION_UNAVAILABLE,
          TIMEOUT: err.TIMEOUT,
        })
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    )

    // Send position every 15 seconds
    intervalRef.current = setInterval(sendPosition, 15000)

    // Also send immediately on start
    sendPosition()

    return () => {
      console.log('[CADETE GPS] Limpiando watcher/interval')
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
