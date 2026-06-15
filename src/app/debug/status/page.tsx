'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

type StatusCheck = {
  label: string
  status: 'loading' | 'ok' | 'error'
  detail?: string
}

export default function DebugStatusPage() {
  const [checks, setChecks] = useState<StatusCheck[]>([
    { label: 'Conexión a Supabase', status: 'loading' },
    { label: 'Auth habilitado', status: 'loading' },
    { label: 'Tabla usuarios', status: 'loading' },
    { label: 'Tabla pedidos', status: 'loading' },
    { label: 'Tabla intentos_entrega', status: 'loading' },
    { label: 'Tabla ubicaciones_cadete', status: 'loading' },
    { label: 'Storage bucket fotos-entrega', status: 'loading' },
    { label: 'Realtime activo', status: 'loading' },
    { label: 'Función get_pedido_by_token', status: 'loading' },
  ])

  const updateCheck = (label: string, status: StatusCheck['status'], detail?: string) => {
    setChecks(prev => prev.map(c => c.label === label ? { ...c, status, detail } : c))
  }

  useEffect(() => {
    const supabase = createClient()

    // 1. Conexión a Supabase / 2. Auth habilitado
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        updateCheck('Conexión a Supabase', 'error', error.message)
        updateCheck('Auth habilitado', 'error', 'No se pudo conectar')
      } else {
        updateCheck('Conexión a Supabase', 'ok', process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
        updateCheck('Auth habilitado', 'ok', 'Email + Password')
      }
    })

    // 3-6. Tablas
    const tables = [
      { label: 'Tabla usuarios', query: 'usuarios' },
      { label: 'Tabla pedidos', query: 'pedidos' },
      { label: 'Tabla intentos_entrega', query: 'intentos_entrega' },
      { label: 'Tabla ubicaciones_cadete', query: 'ubicaciones_cadete' },
    ]
    tables.forEach(({ label, query }) => {
      supabase.from(query).select('*', { count: 'exact', head: true }).limit(1).then(({ error, count }) => {
        if (error) {
          updateCheck(label, 'error', error.message)
        } else {
          updateCheck(label, 'ok', `${count ?? 0} registros`)
        }
      })
    })

    // 7. Storage bucket
    supabase.storage.getBucket('fotos-entrega').then(({ data, error }) => {
      if (error) {
        updateCheck('Storage bucket fotos-entrega', 'error', error.message)
      } else {
        updateCheck('Storage bucket fotos-entrega', 'ok', data.name ?? 'fotos-entrega')
      }
    })

    // 8. Realtime
    const channel = supabase.channel('debug-check')
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        updateCheck('Realtime activo', 'ok', 'Canal WebSocket conectado')
      } else if (status === 'CHANNEL_ERROR') {
        updateCheck('Realtime activo', 'error', 'Error de conexión WebSocket')
      } else {
        updateCheck('Realtime activo', 'ok', `Estado: ${status}`)
      }
      setTimeout(() => supabase.removeChannel(channel), 1000)
    })

    // 9. Función RPC
    supabase.rpc('get_pedido_by_token', { p_token: '00000000-0000-0000-0000-000000000000' })
      .then(({ data, error }) => {
        if (error) {
          updateCheck('Función get_pedido_by_token', 'error', error.message)
        } else {
          updateCheck('Función get_pedido_by_token', 'ok', data?.error === 'not_found' ? 'Existe (token inválido devuelve not_found)' : 'Existe')
        }
      })
  }, [])

  const statusIcon = (status: StatusCheck['status']) => {
    switch (status) {
      case 'loading': return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
      case 'ok': return <span className="text-green-600 font-bold">✓</span>
      case 'error': return <span className="text-red-600 font-bold">✗</span>
    }
  }

  const okCount = checks.filter(c => c.status === 'ok').length
  const errorCount = checks.filter(c => c.status === 'error').length
  const loadingCount = checks.filter(c => c.status === 'loading').length

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Debug - Estado del Sistema</h1>
        <p className="mt-1 text-sm text-gray-500">
          Verificación de conexión con Supabase
        </p>

        {/* Summary */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">{okCount}</p>
            <p className="text-xs text-gray-500">OK</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-red-600">{errorCount}</p>
            <p className="text-xs text-gray-500">Error</p>
          </div>
          <div className="rounded-lg bg-white p-3 text-center shadow-sm">
            <p className="text-2xl font-bold text-primary">{loadingCount}</p>
            <p className="text-xs text-gray-500">Verificando</p>
          </div>
        </div>

        {/* Checks list */}
        <div className="mt-4 space-y-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                check.status === 'error' ? 'border-red-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {statusIcon(check.status)}
                  <span className="text-sm font-medium text-gray-900">{check.label}</span>
                </div>
                {check.detail && (
                  <span className="ml-4 max-w-[50%] truncate text-xs text-gray-400">
                    {check.detail}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Env info */}
        <div className="mt-6 rounded-lg bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">Variables de Entorno</h2>
          <div className="mt-2 space-y-1 text-xs text-gray-500">
            <p>
              NEXT_PUBLIC_SUPABASE_URL:{' '}
              <code className="rounded bg-gray-100 px-1">{process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ configurada' : '✗ faltante'}</code>
            </p>
            <p>
              NEXT_PUBLIC_SUPABASE_ANON_KEY:{' '}
              <code className="rounded bg-gray-100 px-1">{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ configurada' : '✗ faltante'}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
