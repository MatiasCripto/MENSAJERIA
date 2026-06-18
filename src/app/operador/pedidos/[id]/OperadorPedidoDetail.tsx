'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import {
  formatDate,
  formatTime,
  getEstadoColor,
  getEstadoLabel,
  getTipoIntentoLabel,
} from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'

const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  mercadopago: 'MercadoPago',
  transferencia: 'Transferencia',
}

const FORMA_PAGO_OPTIONS = [
  { value: '', label: 'Seleccionar...' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'transferencia', label: 'Transferencia' },
]

const MapComponent = dynamic(
  () => import('@/components/shared/Map'),
  { ssr: false },
)

type Pedido = {
  id: string
  codigo: string
  palabra_clave: string
  token_cliente: string
  estado: string
  retiro_direccion: string
  retiro_contacto: string
  retiro_telefono: string
  entrega_direccion: string
  entrega_contacto: string
  entrega_telefono: string
  notas: string | null
  cadete_id: string | null
  cliente_empresa: string | null
  contacto_nombre: string | null
  hora_salida: string | null
  importe: number | null
  forma_pago: string | null
  cobro_monto: number | null
  cobro_tipo: string | null
  cobro_confirmado: boolean | null
  cobro_espera: number | null
  cliente_id: string | null
  created_at: string
  updated_at: string
}

type IntentoEntrega = {
  id: string
  tipo: string
  notas: string | null
  foto_url: string | null
  receptor_nombre: string | null
  receptor_dni: string | null
  created_at: string
}

type Cadete = {
  id: string
  nombre: string
}

type UbicacionCadete = {
  cadete_id: string
  lat: number
  lng: number
  updated_at: string
}

type PedidoCadete = {
  id: string
  pedido_id: string
  cadete_id: string
  asignado_en: string
  desasignado_en: string | null
  porcentaje_asignado: number | null
  monto_asignado: number | null
  cadete_nombre: string
}

export default function PedidoDetailPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const pedidoId = params?.id as string

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [intentos, setIntentos] = useState<IntentoEntrega[]>([])
  const [cadetes, setCadetes] = useState<Cadete[]>([])
  const [cadeteUbicacion, setCadeteUbicacion] = useState<UbicacionCadete | null>(null)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [selectedCadeteId, setSelectedCadeteId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [pedidoCadetes, setPedidoCadetes] = useState<PedidoCadete[]>([])
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [reassignCadeteId, setReassignCadeteId] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [editingReparto, setEditingReparto] = useState(false)
  const [repartoPorcentajes, setRepartoPorcentajes] = useState<Record<string, string>>({})
  const [savingReparto, setSavingReparto] = useState(false)
  const [editingBilling, setEditingBilling] = useState(false)
  const [billingForm, setBillingForm] = useState({
    cliente_empresa: '',
    contacto_nombre: '',
    hora_salida: '',
    importe: '',
    forma_pago: '',
  })

  const fetchPedido = useCallback(async () => {
    if (!pedidoId) return

    try {
      setError(null)

      const { data: pedidoData, error: pedidoError } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .single()

      if (pedidoError) throw pedidoError

      setPedido(pedidoData)

      // Fetch intentos_entrega for this pedido
      const { data: intentosData } = await supabase
        .from('intentos_entrega')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('created_at', { ascending: false })

      setIntentos(intentosData ?? [])

      // Fetch pedido_cadetes history
      const { data: pcData } = await supabase
        .from('pedido_cadetes')
        .select('*')
        .eq('pedido_id', pedidoId)
        .order('asignado_en', { ascending: true })

      if (pcData) {
        const ids = [...new Set(pcData.map((pc) => pc.cadete_id))]
        const { data: names } = await supabase
          .from('usuarios')
          .select('id, nombre')
          .in('id', ids)
        const nameMap = new Map((names ?? []).map((n) => [n.id, n.nombre]))
        setPedidoCadetes(
          pcData.map((pc) => ({
            ...pc,
            cadete_nombre: nameMap.get(pc.cadete_id) ?? 'Desconocido',
          })),
        )
      }

      // Fetch cadetes for assign dialog
      const { data: cadetesData } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .eq('rol', 'cadete')
        .eq('activo', true)

      setCadetes(cadetesData ?? [])

      // Fetch cadete location if assigned
      if (pedidoData?.cadete_id) {
        const { data: ubicacionData } = await supabase
          .from('ubicaciones_cadete')
          .select('*')
          .eq('cadete_id', pedidoData.cadete_id)
          .single()

        if (ubicacionData) {
          setCadeteUbicacion(ubicacionData)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el pedido')
    } finally {
      setFetching(false)
    }
  }, [supabase, pedidoId])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
      return
    }

    if (!loading && isOperador && pedidoId) {
      fetchPedido()
    }
  }, [loading, isOperador, router, pedidoId, fetchPedido])

  // Realtime subscription for cadete position updates
  useEffect(() => {
    if (!pedido?.cadete_id) return

    const channel = supabase
      .channel(`cadete-position-${pedido.cadete_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ubicaciones_cadete',
          filter: `cadete_id=eq.${pedido.cadete_id}`,
        },
        (payload) => {
          const newData = payload.new as UbicacionCadete
          setCadeteUbicacion(newData)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, pedido?.cadete_id])

  // Realtime subscription for attempts on this pedido
  useEffect(() => {
    if (!pedidoId) return

    const channel = supabase
      .channel(`intentos-${pedidoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intentos_entrega',
          filter: `pedido_id=eq.${pedidoId}`,
        },
        (payload) => {
          const newIntento = payload.new as IntentoEntrega
          setIntentos((prev) => [newIntento, ...prev])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, pedidoId])

  const handleAssignCadete = async () => {
    if (!selectedCadeteId || !pedido) return

    setAssigning(true)

    try {
      const { error: assignError } = await supabase
        .from('pedidos')
        .update({
          cadete_id: selectedCadeteId,
          estado: 'asignado',
        })
        .eq('id', pedido.id)

      if (assignError) throw assignError

      toast.success('Pedido asignado al cadete')
      setShowAssignDialog(false)
      setSelectedCadeteId('')
      fetchPedido()
    } catch (err) {
      toast.error('Error al asignar el pedido')
      console.error('Assign error:', err)
    } finally {
      setAssigning(false)
    }
  }

  const handleEditBilling = () => {
    setBillingForm({
      cliente_empresa: pedido?.cliente_empresa ?? '',
      contacto_nombre: pedido?.contacto_nombre ?? '',
      hora_salida: pedido?.hora_salida ?? '',
      importe: pedido?.importe != null ? String(pedido.importe) : '',
      forma_pago: pedido?.forma_pago ?? '',
    })
    setEditingBilling(true)
  }

  const handleSaveBilling = async () => {
    if (!pedido) return

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        cliente_empresa: billingForm.cliente_empresa.trim() || null,
        contacto_nombre: billingForm.contacto_nombre.trim() || null,
        hora_salida: billingForm.hora_salida || null,
        importe: billingForm.importe ? parseFloat(billingForm.importe) : null,
        forma_pago: billingForm.forma_pago || null,
      })
      .eq('id', pedido.id)

    if (updateError) {
      toast.error('Error al guardar los datos de facturación')
      return
    }

    setPedido({
      ...pedido,
      cliente_empresa: billingForm.cliente_empresa.trim() || null,
      contacto_nombre: billingForm.contacto_nombre.trim() || null,
      hora_salida: billingForm.hora_salida || null,
      importe: billingForm.importe ? parseFloat(billingForm.importe) : null,
      forma_pago: billingForm.forma_pago || null,
    })
    setEditingBilling(false)
    toast.success('Datos de facturación actualizados')
  }

  const [confirmandoPago, setConfirmandoPago] = useState(false)

  const handleReassignCadete = async () => {
    if (!reassignCadeteId || !pedido) return
    setReassigning(true)
    try {
      // Close current active records
      const { data: activos } = await supabase
        .from('pedido_cadetes')
        .select('id')
        .eq('pedido_id', pedido.id)
        .is('desasignado_en', null)

      if (activos) {
        for (const a of activos) {
          await supabase
            .from('pedido_cadetes')
            .update({ desasignado_en: new Date().toISOString() })
            .eq('id', a.id)
        }
      }

      // Insert new cadete
      await supabase.from('pedido_cadetes').insert({
        pedido_id: pedido.id,
        cadete_id: reassignCadeteId,
      })

      // Update pedido
      await supabase
        .from('pedidos')
        .update({ cadete_id: reassignCadeteId })
        .eq('id', pedido.id)

      // Recalculate percentages equitatively among all participants
      const { data: allRecords } = await supabase
        .from('pedido_cadetes')
        .select('*')
        .eq('pedido_id', pedido.id)
        .order('asignado_en', { ascending: true })

      const count = allRecords?.length ?? 0
      const pct = count > 0 ? Math.round((100 / count) * 100) / 100 : 100
      for (const pc of allRecords ?? []) {
        const monto = pedido.importe != null ? Number(pedido.importe) * (pct / 100) : null
        await supabase
          .from('pedido_cadetes')
          .update({ porcentaje_asignado: pct, monto_asignado: monto })
          .eq('id', pc.id)
      }

      toast.success('Pedido reasignado al nuevo cadete')
      setShowReassignDialog(false)
      setReassignCadeteId('')
      fetchPedido()
    } catch (err) {
      toast.error('Error al reasignar el pedido')
      console.error(err)
    } finally {
      setReassigning(false)
    }
  }

  const handleGuardarReparto = async () => {
    if (!pedido) return
    const pcts = Object.values(repartoPorcentajes).map(Number)
    const sum = pcts.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 100) > 0.01) {
      toast.error('Los porcentajes deben sumar 100%')
      return
    }
    setSavingReparto(true)
    try {
      for (const [id, pctStr] of Object.entries(repartoPorcentajes)) {
        const pct = Number(pctStr)
        const monto = pedido.importe != null ? Number(pedido.importe) * (pct / 100) : null
        await supabase
          .from('pedido_cadetes')
          .update({ porcentaje_asignado: pct, monto_asignado: monto })
          .eq('id', id)
      }
      toast.success('Reparto guardado')
      setEditingReparto(false)
      fetchPedido()
    } catch (err) {
      toast.error('Error al guardar el reparto')
      console.error(err)
    } finally {
      setSavingReparto(false)
    }
  }

  const handleConfirmarPago = async () => {
    if (!pedido) return
    setConfirmandoPago(true)
    const { error } = await supabase
      .from('pedidos')
      .update({
        cobro_confirmado: true,
        estado: 'entregado',
      })
      .eq('id', pedido.id)
    if (error) {
      toast.error('Error al confirmar el pago')
      setConfirmandoPago(false)
      return
    }
    setPedido({ ...pedido, cobro_confirmado: true, estado: 'entregado' })
    setConfirmandoPago(false)
    toast.success('Pago confirmado — pedido entregado')
  }

  if (loading || fetching) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200 dark:bg-zinc-700" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
          <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-zinc-800" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-2 text-lg font-medium text-red-600 dark:text-red-400">
          Error al cargar el pedido
        </p>
        <p className="mb-4 text-sm text-gray-500 dark:text-zinc-400">{error}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push('/operador/pedidos')}>
            Volver a pedidos
          </Button>
          <Button onClick={fetchPedido}>Reintentar</Button>
        </div>
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg font-medium text-gray-500 dark:text-zinc-400">Pedido no encontrado</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/operador/pedidos')}
        >
          Volver a pedidos
        </Button>
      </div>
    )
  }

  const mapMarkers = [
    // Delivery address marker
    {
      id: 'entrega',
      lat: cadeteUbicacion?.lat ?? -34.6037,
      lng: cadeteUbicacion?.lng ?? -58.3816,
      label: pedido.entrega_direccion,
      popup: `Entrega: ${pedido.entrega_contacto}`,
    },
  ]

  // Add cadete marker if we have location
  if (cadeteUbicacion) {
    mapMarkers.push({
      id: 'cadete',
      lat: cadeteUbicacion.lat,
      lng: cadeteUbicacion.lng,
      label: 'Cadete',
      popup: 'Ubicación actual del cadete',
    })
  }

  const intentosConFotos = intentos.filter((i) => i.foto_url)
  const currentPedido = pedido

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/operador/pedidos')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Volver a pedidos
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Pedido {currentPedido.codigo ?? currentPedido.palabra_clave}
            </h1>
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                getEstadoColor(currentPedido.estado),
              )}
            >
              {getEstadoLabel(currentPedido.estado)}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Creado {formatDate(currentPedido.created_at)}
          </p>
        </div>

        <div className="flex gap-2">
          {currentPedido.estado === 'pendiente' && (
            <Button onClick={() => setShowAssignDialog(true)}>
              Asignar Cadete
            </Button>
          )}
          {currentPedido.cadete_id && currentPedido.estado !== 'entregado' && (
            <Button variant="outline" onClick={() => setShowReassignDialog(true)}>
              Reasignar cadete
            </Button>
          )}
        </div>
      </div>

      {/* Tracking link */}
      {currentPedido.token_cliente && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                Link de seguimiento para el cliente
              </h2>
              <p className="mt-1 break-all text-sm text-red-700 select-all font-mono dark:text-red-400">
                {window.location.origin}/seguimiento/{currentPedido.token_cliente}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/seguimiento/${currentPedido.token_cliente}`,
                )
                toast.success('Link copiado al portapapeles')
              }}
            >
              Copiar link
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order info */}
        <div className="space-y-6">
          <Card title="Dirección de retiro">
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Dirección:</span> {currentPedido.retiro_direccion}</p>
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Contacto:</span> {currentPedido.retiro_contacto}</p>
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Teléfono:</span> {currentPedido.retiro_telefono}</p>
            </div>
          </Card>

          <Card title="Dirección de entrega">
            <div className="space-y-2 text-sm">
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Dirección:</span> {currentPedido.entrega_direccion}</p>
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Contacto:</span> {currentPedido.entrega_contacto}</p>
              <p><span className="font-medium text-gray-700 dark:text-zinc-300">Teléfono:</span> {currentPedido.entrega_telefono}</p>
            </div>
          </Card>

          {currentPedido.notas && (
            <Card title="Notas">
              <p className="text-sm text-gray-700 dark:text-zinc-300">{currentPedido.notas}</p>
            </Card>
          )}

          <Card title="Información adicional">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium text-gray-700 dark:text-zinc-300">Palabra clave:</span>{' '}
                <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wide dark:bg-zinc-800">
                  {currentPedido.palabra_clave}
                </span>
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-zinc-300">Cadete asignado:</span>{' '}
                {currentPedido.cadete_id ? (
                  <CadeteName cadeteId={currentPedido.cadete_id} />
                ) : (
                  <span className="text-gray-400 dark:text-zinc-500">No asignado</span>
                )}
              </p>
              <p>
                <span className="font-medium text-gray-700 dark:text-zinc-300">Última actualización:</span>{' '}
                {formatDate(currentPedido.updated_at)}
              </p>
            </div>
          </Card>

          {/* Cadetes que participaron */}
          {pedidoCadetes.length > 0 && (
            <Card title="Cadetes que participaron">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-gray-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Cadete</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Asignado</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Desasignado</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">%</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                    {pedidoCadetes.map((pc) => (
                      <tr key={pc.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {pc.cadete_nombre}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-zinc-400">
                          {formatDate(pc.asignado_en)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-zinc-400">
                          {pc.desasignado_en ? formatDate(pc.desasignado_en) : <span className="font-medium text-green-600">Actual</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {editingReparto && pedidoCadetes.length > 1 ? (
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              className="w-20 text-right"
                              value={repartoPorcentajes[pc.id] ?? String(pc.porcentaje_asignado ?? 0)}
                              onChange={(e) => setRepartoPorcentajes((prev) => ({ ...prev, [pc.id]: e.target.value }))}
                            />
                          ) : (
                            <span className="text-sm text-gray-700 dark:text-zinc-300">
                              {Number(pc.porcentaje_asignado ?? 0).toFixed(2)}%
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-gray-700 dark:text-zinc-300">
                          ${Number(pc.monto_asignado ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pedidoCadetes.length > 1 && (
                <div className="mt-3 flex justify-end gap-2">
                  {editingReparto ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditingReparto(false)}>Cancelar</Button>
                      <Button size="sm" onClick={handleGuardarReparto} disabled={savingReparto}>
                        {savingReparto ? 'Guardando...' : 'Guardar reparto'}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => {
                      const initial: Record<string, string> = {}
                      pedidoCadetes.forEach((p) => { initial[p.id] = String(p.porcentaje_asignado ?? 0) })
                      setRepartoPorcentajes(initial)
                      setEditingReparto(true)
                    }}>
                      Editar reparto
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Información comercial */}
          <Card title="Información comercial">
            {editingBilling ? (
              <div className="space-y-3">
                <Input
                  label="Cliente / Empresa"
                  value={billingForm.cliente_empresa}
                  onChange={(e) =>
                    setBillingForm((prev) => ({ ...prev, cliente_empresa: e.target.value }))
                  }
                  placeholder="Ej: Distribuidora Pepe"
                />
                <Input
                  label="Contacto / Quién llamó"
                  value={billingForm.contacto_nombre}
                  onChange={(e) =>
                    setBillingForm((prev) => ({ ...prev, contacto_nombre: e.target.value }))
                  }
                  placeholder="Nombre de quien llamó"
                />
                <Input
                  label="Hora de salida"
                  type="time"
                  value={billingForm.hora_salida}
                  onChange={(e) =>
                    setBillingForm((prev) => ({ ...prev, hora_salida: e.target.value }))
                  }
                />
                <Input
                  label="Importe ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  value={billingForm.importe}
                  onChange={(e) =>
                    setBillingForm((prev) => ({ ...prev, importe: e.target.value }))
                  }
                  placeholder="0.00"
                />
                <Select
                  label="Forma de pago"
                  options={FORMA_PAGO_OPTIONS}
                  value={billingForm.forma_pago}
                  onChange={(e) =>
                    setBillingForm((prev) => ({ ...prev, forma_pago: e.target.value }))
                  }
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingBilling(false)}
                  >
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSaveBilling}>
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-gray-700 dark:text-zinc-300">Cliente / Empresa:</span>{' '}
                  {currentPedido.cliente_empresa || (
                    <span className="text-gray-400 dark:text-zinc-500">—</span>
                  )}
                </p>
                <p>
                  <span className="font-medium text-gray-700 dark:text-zinc-300">Contacto:</span>{' '}
                  {currentPedido.contacto_nombre || (
                    <span className="text-gray-400 dark:text-zinc-500">—</span>
                  )}
                </p>
                <p>
                  <span className="font-medium text-gray-700 dark:text-zinc-300">Hora de salida:</span>{' '}
                  {currentPedido.hora_salida || (
                    <span className="text-gray-400 dark:text-zinc-500">—</span>
                  )}
                </p>
                <p>
                  <span className="font-medium text-gray-700 dark:text-zinc-300">Importe:</span>{' '}
                  {currentPedido.importe != null
                    ? `$${Number(currentPedido.importe).toFixed(2)}`
                    : <span className="text-gray-400 dark:text-zinc-500">—</span>}
                </p>
                <p>
                  <span className="font-medium text-gray-700 dark:text-zinc-300">Forma de pago:</span>{' '}
                  {currentPedido.forma_pago
                    ? FORMA_PAGO_LABELS[currentPedido.forma_pago] || currentPedido.forma_pago
                    : <span className="text-gray-400">—</span>}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleEditBilling}
                >
                  Editar
                </Button>
              </div>
            )}
            {currentPedido.estado === 'esperando_pago' && (
              <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-950/30">
                <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                  Pago por transferencia pendiente
                </h3>
                {currentPedido.cobro_monto && (
                  <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                    Monto: ${Number(currentPedido.cobro_monto).toFixed(2)}
                  </p>
                )}
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={handleConfirmarPago}
                >
                  Confirmar pago recibido
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Map & Attempts */}
        <div className="space-y-6">
          {/* Map */}
          <Card title={cadeteUbicacion ? 'Ubicación del cadete' : 'Ubicación de entrega'}>
            <MapComponent
              markers={mapMarkers}
              height="300px"
              className="w-full"
            />
          </Card>

          {/* Attempts history */}
          <Card title="Historial de intentos">
            {intentos.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400 dark:text-zinc-500">
                No hay intentos de entrega registrados
              </p>
            ) : (
              <div className="space-y-4">
                {intentos.map((intento) => (
                  <div
                    key={intento.id}
                    className="relative border-l-2 border-gray-200 pl-4 dark:border-zinc-800"
                  >
                    <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-gray-400 dark:bg-zinc-600" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                          {formatDate(intento.created_at)}
                        </span>
                        <Badge
                          variant={
                            intento.tipo === 'entregado'
                              ? 'success'
                              : intento.tipo === 'no_atendio'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {getTipoIntentoLabel(intento.tipo)}
                        </Badge>
                      </div>
                      {intento.notas && (
                        <p className="text-sm text-gray-600 dark:text-zinc-300">
                          {intento.notas}
                        </p>
                      )}
                      {intento.tipo === 'entregado' && (
                        <div className="mt-1 space-y-0.5">
                          {intento.receptor_nombre && (
                            <p className="text-sm text-gray-700 dark:text-zinc-300">
                              <span className="font-medium">Receptor:</span> {intento.receptor_nombre}
                            </p>
                          )}
                          {intento.receptor_dni && (
                            <p className="text-sm text-gray-700 dark:text-zinc-300">
                              <span className="font-medium">DNI:</span> {intento.receptor_dni}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Photos gallery */}
          {intentosConFotos.length > 0 && (
            <Card title="Fotos">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {intentosConFotos.map((intento) => (
                  <a
                    key={intento.id}
                    href={intento.foto_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800"
                  >
                    <img
                      src={intento.foto_url!}
                      alt={`Foto - ${getTipoIntentoLabel(intento.tipo)}`}
                      className="h-32 w-full object-cover transition-opacity hover:opacity-80"
                    />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Assign cadete dialog */}
      {showAssignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Asignar cadete
            </h2>

            <Select
              label="Seleccionar cadete"
              placeholder="Elige un cadete..."
              options={cadetes.map((c) => ({
                value: c.id,
                label: c.nombre,
              }))}
              value={selectedCadeteId}
              onChange={(e) => setSelectedCadeteId(e.target.value)}
            />

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAssignDialog(false)
                  setSelectedCadeteId('')
                }}
                disabled={assigning}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAssignCadete}
                disabled={!selectedCadeteId || assigning}
              >
                {assigning ? 'Asignando...' : 'Asignar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign cadete dialog */}
      {showReassignDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Reasignar cadete
            </h2>
            <p className="mb-4 text-sm text-gray-500 dark:text-zinc-400">
              El cadete actual será desasignado y se asignará al nuevo. Los porcentajes se recalcularán equitativamente.
            </p>

            <Select
              label="Seleccionar nuevo cadete"
              placeholder="Elige un cadete..."
              options={cadetes
                .filter((c) => c.id !== pedido?.cadete_id)
                .map((c) => ({
                  value: c.id,
                  label: c.nombre,
                }))}
              value={reassignCadeteId}
              onChange={(e) => setReassignCadeteId(e.target.value)}
            />

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowReassignDialog(false)
                  setReassignCadeteId('')
                }}
                disabled={reassigning}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleReassignCadete}
                disabled={!reassignCadeteId || reassigning}
              >
                {reassigning ? 'Reasignando...' : 'Reasignar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Small component to resolve cadete name by ID */
function CadeteName({ cadeteId }: { cadeteId: string }) {
  const [name, setName] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('nombre')
      .eq('id', cadeteId)
      .single()
      .then(({ data }) => {
        if (data) setName(data.nombre)
      })
  }, [cadeteId, supabase])

  return <span>{name ?? 'Cargando...'}</span>
}
