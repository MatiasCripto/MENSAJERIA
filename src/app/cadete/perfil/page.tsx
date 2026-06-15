'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from 'sonner'

export default function CadetePerfilPage() {
  const { user, loading } = useSession()
  const supabase = createClient()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const redirectTo = (path: string) => {
    if (Capacitor.isNativePlatform()) {
      window.location.href = 'index.html#' + path
    } else {
      window.location.href = path
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    redirectTo('/login')
  }

  useEffect(() => {
    if (!loading && (!user || user.rol !== 'cadete')) {
      if (Capacitor.isNativePlatform()) {
        window.location.href = 'index.html#/login'
      } else {
        window.location.href = '/login'
      }
    }
  }, [user, loading])

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      toast.error('Ingresá la nueva contraseña')
      return
    }

    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }

    if (!currentPassword.trim()) {
      toast.error('Ingresá tu contraseña actual')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        toast.error(error.message === 'Invalid login credentials'
          ? 'La contraseña actual es incorrecta'
          : error.message)
        return
      }

      toast.success('Contraseña actualizada correctamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Error al cambiar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mi Perfil</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Datos de tu cuenta y cambio de contraseña
        </p>
      </div>

      {/* User info (read-only) */}
      <Card title="Datos de la cuenta">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
              Nombre
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
              {user.nombre}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
              Email
            </p>
            <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">
              {user.email}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
              Rol
            </p>
            <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">
              Cadete
            </p>
          </div>
        </div>
      </Card>

      {/* Change password */}
      <Card title="Cambiar contraseña">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Contraseña actual
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
              placeholder="••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
              placeholder="Repetí la nueva contraseña"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={submitting}
          >
            {submitting ? 'Guardando...' : 'Guardar contraseña'}
          </Button>
        </div>
      </Card>

      {/* Sign out */}
      <div className="pt-2">
        <Button
          variant="outline"
          className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </Button>
      </div>
    </div>
  )
}
