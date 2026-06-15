'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

type Adelanto = {
  id: string
  monto: number
  descripcion: string | null
  created_at: string
}

const ADELANTO_INITIAL = { monto: '', descripcion: '' }

export default function CadeteDetallePage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const cadeteId = params.id as string

  const [cadete, setCadete] = useState<{ nombre: string; email: string } | null>(null)
  const [pedidosCount, setPedidosCount] = useState(0)
  const [facturacion, setFacturacion] = useState(0)
  const [adelantos, setAdelantos] = useState<Adelanto[]>([])
  const [fetching, setFetching] = useState(true)
  const [totalAdelantos, setTotalAdelantos] = useState(0)

  // Adelanto CRUD
  const [adelantoModal, setAdelantoModal] = useState<'create' | 'edit' | null>(null)
  const [adelantoEditId, setAdelantoEditId] = useState<string | null>(null)
  const [adelantoForm, setAdelantoForm] = useState(ADELANTO_INITIAL)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setFetching(true)
    try {
      // Cadete info
      const { data: userData } = await supabase
        .from('usuarios')
        .select('nombre, email')
        .eq('id', cadeteId)
        .single()

      if (userData) setCadete(userData)

      // Stats: viajes count + facturacion (total importe of delivered/assigned etc)
      const { data: pedidos } = await supabase
        .from('pedidos')
        .select('importe')
        .eq('cadete_id', cadeteId)

      if (pedidos) {
        setPedidosCount(pedidos.length)
        setFacturacion(pedidos.reduce((sum, p) => sum + Number(p.importe ?? 0), 0))
      }

      // Adelantos
      const { data: adeData } = await supabase
        .from('adelantos')
        .select('*')
        .eq('cadete_id', cadeteId)
        .order('created_at', { ascending: false })

      if (adeData) {
        setAdelantos(adeData)
        setTotalAdelantos(adeData.reduce((sum, a) => sum + Number(a.monto), 0))
      }
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar datos del cadete')
    } finally {
      setFetching(false)
    }
  }, [cadeteId, supabase])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
      return
    }
    if (!loading && isOperador) {
      fetchData()
    }
  }, [loading, isOperador, router, fetchData])

  // ── Adelanto CRUD ──

  const openCreateAdelanto = () => {
    setAdelantoForm(ADELANTO_INITIAL)
    setAdelantoEditId(null)
    setAdelantoModal('create')
  }

  const openEditAdelanto = (a: Adelanto) => {
    setAdelantoForm({ monto: String(a.monto), descripcion: a.descripcion ?? '' })
    setAdelantoEditId(a.id)
    setAdelantoModal('edit')
  }

  const handleSaveAdelanto = async () => {
    const monto = parseFloat(adelantoForm.monto)
    if (isNaN(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido')
      return
    }

    setSubmitting(true)
    try {
      if (adelantoModal === 'create') {
        const { error } = await supabase.from('adelantos').insert({
          cadete_id: cadeteId,
          monto,
          descripcion: adelantoForm.descripcion.trim() || null,
        })
        if (error) throw error
        toast.success('Adelanto registrado')
      } else if (adelantoModal === 'edit' && adelantoEditId) {
        const { error } = await supabase
          .from('adelantos')
          .update({
            monto,
            descripcion: adelantoForm.descripcion.trim() || null,
          })
          .eq('id', adelantoEditId)
        if (error) throw error
        toast.success('Adelanto actualizado')
      }

      setAdelantoModal(null)
      fetchData()
    } catch (err) {
      toast.error('Error al guardar el adelanto')
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAdelanto = async (id: string) => {
    if (!confirm('¿Eliminar este adelanto?')) return

    try {
      const { error } = await supabase.from('adelantos').delete().eq('id', id)
      if (error) throw error
      toast.success('Adelanto eliminado')
      fetchData()
    } catch (err) {
      toast.error('Error al eliminar el adelanto')
      console.error(err)
    }
  }

  // ── Loading ──
  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!cadete) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 dark:text-zinc-400">Cadete no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/operador/equipo')}>
          Volver
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/operador/equipo')}>
          ← Volver
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{cadete.nombre}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">{cadete.email}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Viajes totales</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{pedidosCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Facturación total</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            ${facturacion.toFixed(2)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-gray-500 dark:text-zinc-400">Total adelantos</p>
          <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
            ${totalAdelantos.toFixed(2)}
          </p>
        </Card>
      </div>

      {/* Saldo pendiente */}
      <Card>
        <p className="text-sm text-gray-500 dark:text-zinc-400">Saldo pendiente (facturación - adelantos)</p>
        <p className={`mt-1 text-2xl font-bold ${facturacion - totalAdelantos >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          ${(facturacion - totalAdelantos).toFixed(2)}
        </p>
      </Card>

      {/* Adelantos (Vales) */}
      <Card title="Adelantos / Vales">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {adelantos.length} adelanto{adelantos.length !== 1 ? 's' : ''} registrado{adelantos.length !== 1 ? 's' : ''}
          </p>
          <Button size="sm" onClick={openCreateAdelanto}>
            + Nuevo adelanto
          </Button>
        </div>

        {adelantos.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Sin adelantos registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Monto</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {adelantos.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-zinc-300">
                      {new Date(a.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                      ${Number(a.monto).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-zinc-300">
                      {a.descripcion || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditAdelanto(a)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={() => handleDeleteAdelanto(a.id)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Adelanto Modal */}
      {adelantoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setAdelantoModal(null) }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {adelantoModal === 'create' ? 'Nuevo adelanto' : 'Editar adelanto'}
            </h2>

            <div className="space-y-4">
              <Input
                label="Monto ($)"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={adelantoForm.monto}
                onChange={(e) => setAdelantoForm((prev) => ({ ...prev, monto: e.target.value }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Descripción
                </label>
                <textarea
                  value={adelantoForm.descripcion}
                  onChange={(e) => setAdelantoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Motivo del adelanto..."
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAdelantoModal(null)} disabled={submitting}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAdelanto} disabled={submitting}>
                {submitting ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
