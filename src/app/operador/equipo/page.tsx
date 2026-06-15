'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

type Usuario = {
  id: string
  nombre: string
  email: string
  rol: 'operador' | 'cadete'
  activo: boolean
}

type Tab = 'operadores' | 'cadetes'

type ModalMode = 'create' | 'edit' | null

const INITIAL_FORM = { nombre: '', email: '', password: '' }

export default function EquipoPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('operadores')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [fetching, setFetching] = useState(true)

  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editTarget, setEditTarget] = useState<Usuario | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Password reset in edit modal
  const [resetPassword, setResetPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchUsuarios = useCallback(async () => {
    try {
      setFetching(true)
      const { data } = await supabase
        .from('usuarios')
        .select('*')
        .order('nombre', { ascending: true })

      setUsuarios(data ?? [])
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
      fetchUsuarios()
    }
  }, [loading, isOperador, router, fetchUsuarios])

  const filtered = usuarios.filter((u) => {
    if (tab === 'operadores') return u.rol === 'operador'
    return u.rol === 'cadete'
  })

  const openCreate = () => {
    setForm(INITIAL_FORM)
    setEditTarget(null)
    setModalMode('create')
  }

  const openEdit = (u: Usuario) => {
    setForm({ nombre: u.nombre, email: u.email, password: '' })
    setEditTarget(u)
    setResetPassword('')
    setModalMode('edit')
  }

  const handleCreate = async () => {
    if (!form.nombre.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Completá todos los campos requeridos')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          password: form.password,
          rol: tab === 'operadores' ? 'operador' : 'cadete',
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al crear usuario')
      }

      toast.success('Usuario creado correctamente')
      setModalMode(null)
      setForm(INITIAL_FORM)
      fetchUsuarios()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || !form.nombre.trim() || !form.email.trim()) {
      toast.error('Completá nombre y email')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/usuarios/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim(),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al actualizar usuario')
      }

      toast.success('Usuario actualizado correctamente')
      setModalMode(null)
      setEditTarget(null)
      fetchUsuarios()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar usuario')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!editTarget || !resetPassword.trim()) {
      toast.error('Ingresá la nueva contraseña')
      return
    }

    setResettingPassword(true)

    try {
      const res = await fetch(`/api/usuarios/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al resetear contraseña')
      }

      toast.success('Contraseña reseteada correctamente')
      setResetPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al resetear contraseña')
    } finally {
      setResettingPassword(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    setDeleting(true)

    try {
      const res = await fetch(`/api/usuarios/${deleteTarget.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar usuario')
      }

      toast.success('Usuario eliminado correctamente')
      setDeleteTarget(null)
      fetchUsuarios()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar usuario')
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Equipo</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Gestioná operadores y cadetes del sistema
          </p>
        </div>
        <Button onClick={openCreate}>
          {tab === 'operadores' ? '+ Agregar operador' : '+ Agregar cadete'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-zinc-800">
        <button
          onClick={() => setTab('operadores')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'operadores'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-[#1a1a1a] dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          Operadores
        </button>
        <button
          onClick={() => setTab('cadetes')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'cadetes'
              ? 'bg-white text-gray-900 shadow-sm dark:bg-[#1a1a1a] dark:text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          Cadetes
        </button>
      </div>

      {/* Table */}
      <Card>
        {fetching ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-gray-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 dark:text-zinc-400">
              No hay {tab === 'operadores' ? 'operadores' : 'cadetes'} registrados
            </p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              {tab === 'operadores' ? '+ Agregar operador' : '+ Agregar cadete'}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Email
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className={`transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/50 ${
                      tab === 'cadetes' ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => {
                      if (tab === 'cadetes') router.push(`/operador/equipo/${u.id}`)
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {u.nombre}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {u.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={() => setDeleteTarget(u)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              {modalMode === 'create'
                ? tab === 'operadores'
                  ? 'Nuevo operador'
                  : 'Nuevo cadete'
                : 'Editar usuario'}
            </h2>

            <div className="space-y-4">
              <Input
                label="Nombre completo"
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre y apellido"
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
              />

              {modalMode === 'create' && (
                <Input
                  label="Contraseña"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                />
              )}

              {/* Password reset section (edit mode only) */}
              {modalMode === 'edit' && (
                <div className="border-t border-gray-200 pt-4 dark:border-zinc-800">
                  <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
                    Resetear contraseña
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="Nueva contraseña"
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetPassword}
                      disabled={resettingPassword || !resetPassword.trim()}
                      className="shrink-0"
                    >
                      {resettingPassword ? '...' : 'Aplicar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setModalMode(null)
                  setEditTarget(null)
                }}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={modalMode === 'create' ? handleCreate : handleEdit}
                disabled={submitting}
              >
                {submitting
                  ? 'Guardando...'
                  : modalMode === 'create'
                    ? 'Crear usuario'
                    : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              Eliminar usuario
            </h2>
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              ¿Estás seguro de eliminar a <strong>{deleteTarget.nombre}</strong> ({deleteTarget.email})?
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
