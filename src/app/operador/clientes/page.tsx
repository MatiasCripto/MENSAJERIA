'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

type Cliente = {
  id: string
  nombre: string
  empresa: string | null
  cuit: string | null
  razon_social: string | null
  telefono: string | null
  direccion_habitual: string | null
  notas: string | null
  modalidad_pago: string | null
  saldo_deuda: number | null
  created_at: string
}

type ModalMode = 'create' | 'edit' | null

const INITIAL_FORM = {
  nombre: '',
  empresa: '',
  cuit: '',
  razon_social: '',
  telefono: '',
  direccion_habitual: '',
  notas: '',
}

export default function ClientesPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editTarget, setEditTarget] = useState<Cliente | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchClientes = useCallback(async () => {
    try {
      setFetching(true)
      setError(null)
      let query = supabase.from('clientes').select('*').order('nombre', { ascending: true })

      if (search.trim()) {
        query = query.or(`nombre.ilike.%${search.trim()}%,empresa.ilike.%${search.trim()}%`)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      setClientes(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar clientes')
    } finally {
      setFetching(false)
    }
  }, [supabase, search])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
      return
    }
    if (!loading && isOperador) {
      fetchClientes()
    }
  }, [loading, isOperador, router, fetchClientes])

  useEffect(() => {
    if (isOperador) {
      fetchClientes()
    }
  }, [search, isOperador, fetchClientes])

  const openCreate = () => {
    setForm(INITIAL_FORM)
    setEditTarget(null)
    setModalMode('create')
  }

  const openEdit = (c: Cliente) => {
    setForm({
      nombre: c.nombre,
      empresa: c.empresa ?? '',
      cuit: c.cuit ?? '',
      razon_social: c.razon_social ?? '',
      telefono: c.telefono ?? '',
      direccion_habitual: c.direccion_habitual ?? '',
      notas: c.notas ?? '',
    })
    setEditTarget(c)
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setEditTarget(null)
  }

  const handleCreate = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    setSubmitting(true)

    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({
          nombre: form.nombre.trim(),
          empresa: form.empresa.trim() || null,
          cuit: form.cuit.trim() || null,
          razon_social: form.razon_social.trim() || null,
          telefono: form.telefono.trim() || null,
          direccion_habitual: form.direccion_habitual.trim() || null,
          notas: form.notas.trim() || null,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)

      toast.success('Cliente creado correctamente')
      setModalMode(null)
      setForm(INITIAL_FORM)
      fetchClientes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear cliente')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || !form.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }

    setSubmitting(true)

    try {
      const { data, error } = await supabase
        .from('clientes')
        .update({
          nombre: form.nombre.trim(),
          empresa: form.empresa.trim() || null,
          cuit: form.cuit.trim() || null,
          razon_social: form.razon_social.trim() || null,
          telefono: form.telefono.trim() || null,
          direccion_habitual: form.direccion_habitual.trim() || null,
          notas: form.notas.trim() || null,
        })
        .eq('id', editTarget.id)
        .select()
        .single()

      if (error) throw new Error(error.message)

      toast.success('Cliente actualizado correctamente')
      setModalMode(null)
      setEditTarget(null)
      fetchClientes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar cliente')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) throw new Error(error.message)

      toast.success('Cliente eliminado correctamente')
      setDeleteTarget(null)
      fetchClientes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar cliente')
    } finally {
      setDeleting(false)
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Gestioná los clientes registrados en el sistema
          </p>
        </div>
        <Button onClick={openCreate}>+ Nuevo Cliente</Button>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Buscar por nombre o empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        {fetching ? (
          <div className="animate-pulse space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : error ? (
          <div className="py-12 text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchClientes}>
              Reintentar
            </Button>
          </div>
        ) : clientes.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 dark:text-zinc-400">
              {search.trim()
                ? 'No se encontraron clientes con ese criterio de búsqueda'
                : 'No hay clientes registrados'}
            </p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              + Nuevo Cliente
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Nombre / Empresa
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    CUIT
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Dirección
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Teléfono
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {clientes.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                    onClick={() => router.push(`/operador/clientes/${c.id}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {c.nombre}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {c.cuit ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-zinc-400">
                      {c.direccion_habitual ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {c.telefono ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(c) }}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
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

      {/* Create/Edit Modal */}
      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {modalMode === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}
            </h2>

            <div className="space-y-4">
              <Input
                label="Nombre / Empresa *"
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Ej: Distribuidora Pepe o Juan García"
              />
              <Input
                label="CUIT / CUIL"
                value={form.cuit}
                onChange={(e) => setForm((prev) => ({ ...prev, cuit: e.target.value }))}
                placeholder="XX-XXXXXXXX-X"
              />
              <Input
                label="Razón Social"
                value={form.razon_social}
                onChange={(e) => setForm((prev) => ({ ...prev, razon_social: e.target.value }))}
                placeholder="Razón social"
              />
              <Input
                label="Teléfono"
                value={form.telefono}
                onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
                placeholder="Número de teléfono"
              />
              <Input
                label="Dirección habitual"
                value={form.direccion_habitual}
                onChange={(e) => setForm((prev) => ({ ...prev, direccion_habitual: e.target.value }))}
                placeholder="Dirección habitual"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Notas
                </label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                  placeholder="Notas adicionales..."
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal} disabled={submitting}>
                Cancelar
              </Button>
              <Button
                onClick={modalMode === 'create' ? handleCreate : handleEdit}
                disabled={submitting}
              >
                {submitting
                  ? 'Guardando...'
                  : modalMode === 'create'
                    ? 'Crear cliente'
                    : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null)
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Eliminar cliente
            </h2>
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              ¿Estás seguro de eliminar a <strong>{deleteTarget.nombre}</strong>?
              {deleteTarget.empresa && (
                <>
                  {' '}({deleteTarget.empresa})
                </>
              )}
              <br />
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-800 dark:hover:bg-red-900"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
