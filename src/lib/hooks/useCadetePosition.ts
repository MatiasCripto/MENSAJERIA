'use client'

import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation as CapGeolocation } from '@capacitor/geolocation'
import { BackgroundGeolocation } from '@capgo/background-geolocation'

const isNative = Capacitor.isNativePlatform()

export function useCadetePosition(cadeteId: string | undefined) {
  const watchRef = useRef<string | number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const positionRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const bgStartedRef = useRef(false)
  const gpsInactivoReportadoRef = useRef(false)
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
      lat: pos.latitude,
      lng: pos.longitude,
      timestamp: new Date().toISOString(),
      gps_activo: true,
      ultima_actualizacion: new Date().toISOString(),
    }

    // 1. Upsert latest position
    const { error: upsertError } = await supabase
      .from('ubicaciones_cadete')
      .upsert(payload, { onConflict: 'cadete_id' })

    if (upsertError) {
      console.error('[CADETE GPS] upsert error:', upsertError.message)
    }

    // Reset inactive flag on successful send
    gpsInactivoReportadoRef.current = false

    // 2. Also insert into recorridos for history tracking
    const pedidoId = await getActivePedidoId()

    const { error: insertError } = await supabase.from('recorridos').insert({
      cadete_id: cadeteId,
      pedido_id: pedidoId,
      lat: pos.latitude,
      lng: pos.longitude,
      timestamp: payload.timestamp,
    })

    if (insertError) {
      console.error('[CADETE GPS] recorridos insert error:', insertError.message)
    }
  }, [cadeteId, supabase, getActivePedidoId])

  useEffect(() => {
    if (!cadeteId) return

    let isCancelled = false

    async function startWatching() {
      if (isNative) {
        // ========================================
        // NATIVE -- @capgo/background-geolocation
        // ========================================
        try {
          const permResult = await CapGeolocation.requestPermissions()
          if (permResult.location === 'denied') {
            console.error('[CADETE GPS] Location permission denied')
            return
          }
        } catch {
          console.error('[CADETE GPS] Permission request failed')
          return
        }

        try {
          await BackgroundGeolocation.start(
            {
              backgroundMessage: 'Moto Express está rastreando tu ubicación',
              backgroundTitle: 'Moto Express Cadete',
              requestPermissions: true,
              stale: false,
              distanceFilter: 0,
            },
            (location, error) => {
              if (error) {
                console.error('[CADETE GPS] BackgroundGeolocation error:', error)
                // Report GPS inactive immediately
                if (!gpsInactivoReportadoRef.current && cadeteId) {
                  gpsInactivoReportadoRef.current = true
                  supabase
                    .from('ubicaciones_cadete')
                    .upsert(
                      {
                        cadete_id: cadeteId,
                        gps_activo: false,
                        ultima_actualizacion: new Date().toISOString(),
                      },
                      { onConflict: 'cadete_id' },
                    )
                    .then()
                }
                return
              }
              if (location) {
                positionRef.current = {
                  latitude: location.latitude,
                  longitude: location.longitude,
                }
              }
            },
          )
          bgStartedRef.current = true
        } catch (err) {
          console.error('[CADETE GPS] BackgroundGeolocation start failed:', err)
          // Fallback to foreground-only Capacitor geolocation
          try {
            const callbackId = await CapGeolocation.watchPosition(
              { enableHighAccuracy: true, timeout: 10000 },
              (position, err) => {
                if (err) {
                  console.error('[CADETE GPS] Capacitor watchPosition error:', err)
                  // Report GPS inactive immediately
                  if (!gpsInactivoReportadoRef.current && cadeteId) {
                    gpsInactivoReportadoRef.current = true
                    supabase
                      .from('ubicaciones_cadete')
                      .upsert(
                        {
                          cadete_id: cadeteId,
                          gps_activo: false,
                          ultima_actualizacion: new Date().toISOString(),
                        },
                        { onConflict: 'cadete_id' },
                      )
                      .then()
                  }
                  return
                }
                if (position) {
                  positionRef.current = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                  }
                }
              },
            )
            watchRef.current = callbackId
          } catch {
            console.error('[CADETE GPS] Fallback watchPosition also failed')
            return
          }
        }
      } else {
        // ========================================
        // BROWSER -- navigator.geolocation
        // ========================================
        if (!navigator.geolocation) return

        watchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            positionRef.current = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }
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
      }

      if (isCancelled) return

      // Start periodic upload (15-second interval)
      intervalRef.current = setInterval(sendPosition, 15000)
      sendPosition()
    }

    startWatching()

    return () => {
      isCancelled = true

      if (isNative) {
        if (bgStartedRef.current) {
          BackgroundGeolocation.stop().catch((err) =>
            console.error('[CADETE GPS] Error stopping background geolocation:', err),
          )
          bgStartedRef.current = false
        }
        // Also clear fallback watchPosition if it was used
        if (watchRef.current !== null) {
          CapGeolocation.clearWatch({ id: watchRef.current as string })
        }
      } else {
        if (watchRef.current !== null) {
          navigator.geolocation.clearWatch(watchRef.current as number)
        }
      }

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [cadeteId, sendPosition])

  return { sendPosition }
}
