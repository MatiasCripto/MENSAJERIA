'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

export function useRealtime(
  table: string,
  filter?: string,
  onPayload?: (payload: RealtimePayload) => void
) {
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: filter || undefined,
        },
        (payload) => {
          const event = payload.eventType as RealtimePayload['eventType']
          const p = {
            eventType: event,
            new: payload.new as Record<string, unknown>,
            old: payload.old as Record<string, unknown>,
          }
          onPayload?.(p)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter])

  return { data, setData }
}
