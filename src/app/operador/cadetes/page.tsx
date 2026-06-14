'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'

type Cadete = {
  id: string
  nombre: string
  email: string
  activo: boolean
  created_at: string
}

export default function CadetesPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [cadetes, setCadetes] = useState<Cadete[]>([])
  const [fetching, setFetching] = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Create form state
  const [formNombre, setFormNombre] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
    }
  }, [loading, isOperador, router])

  const fetchCadetes = useCallback(async () => {
    const { data } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol', 'cadete')
      .order('created_at', { ascending: false })

    if (data) setCadetes(data)
    setFetching(false)
  }, [supabase])

  useEffect(() => {
    if (isOperador) fetchCadetes()
  }, [isOperador, fetchCadetes])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formNombre.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error('Completá todos los campos')
      return
    }

    setCreating(true)

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formNombre.trim(),
          email: formEmail.trim(),
          password: formPassword,
          rol: 'cadete',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al crear el cadete')
        return
      }

      toast.success(`Cadete ${formNombre.trim()} creado correctamente`)
      setShowModal(false)
      setFormNombre('')
      setFormEmail('')
      setFormPassword('')
      fetchCadetes()
    } catch {
      toast.error('Error de conexión al crear el cadete')
    } finally {
      setCreating(false)
    }
  }

  const handleDesactivar = async (cadete: Cadete) => {
    if (
      !window.confirm(
        `¿Desactivar a ${cadete.nombre}? Podés volver a activarlo desde Supabase.`,
      )
    )
      return

    try {
      const res = await fetch(`/api/usuarios/${cadete.id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Error al desactivar el cadete')
        return
      }

      toast.success(`${cadete.nombre} eliminado`)
      fetchCadetes()
    } catch {
      toast.error('Error de conexión al desactivar el cadete')
    }
  }

  if (loading || fetching) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cadetes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestioná los cadetes del sistema
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>Agregar cadete</Button>
      </div>

      {/* List */}
      {cadetes.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">No hay cadetes registrados</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowModal(true)}
            >
              Agregar primer cadete
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {cadetes.map((cadete) => (
            <div
              key={cadete.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {cadete.nombre}
                  </span>
                  {!cadete.activo && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-gray-500">{cadete.email}</p>
              </div>
              {cadete.activo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDesactivar(cadete)}
                >
                  Desactivar
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Agregar cadete
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <Input
                label="Nombre completo *"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                placeholder="Nombre y apellido"
              />
              <Input
                label="Email *"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="cadete@ejemplo.com"
              />
              <Input
                label="Contraseña *"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder="Contraseña temporal"
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creando...' : 'Crear cadete'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
