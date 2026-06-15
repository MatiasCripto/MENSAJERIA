'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  const { user, loading: sessionLoading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const redirectTo = (path: string) => {
    if (Capacitor.isNativePlatform()) {
      // En Capacitor con static export usar hash-based navigation
      window.location.href = '/#' + path
    } else {
      window.location.href = path
    }
  }

  const addLog = (msg: string) => {
    console.log('[LOGIN DEBUG]', msg)
    setDebugLogs((prev) => [...prev.slice(-9), msg])
  }

  // Si el SessionProvider ya tiene el user, redirigir
  useEffect(() => {
    if (!sessionLoading && user) {
      addLog(`SessionProvider ya tiene user: rol=${user.rol}, redirigiendo`)
      redirectTo(user.rol === 'operador' ? '/operador' : '/cadete')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionLoading])

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (user) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setDebugLogs([])
    addLog('=== INICIO LOGIN ===')

    // 1. Autenticar — extraer session de la respuesta directamente
    addLog(`1. signInWithPassword — email="${email}"`)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      addLog(`   ✗ ERROR: ${authError.message}`)
      setError(authError.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos'
        : authError.message
      )
      setLoading(false)
      return
    }
    addLog(`   ✓ OK. session.user.email="${authData?.session?.user?.email ?? '(vacio)'}"`)

    // 2. Obtener sesión — primero usar la de la respuesta, después intentar getSession()
    let session: import('@supabase/supabase-js').Session | null = authData?.session ?? null
    if (!session) {
      addLog('2. session vacía en authData, intentando getSession()')
      const { data: sessionData } = await supabase.auth.getSession()
      session = sessionData?.session ?? null
    } else {
      addLog(`2. session obtenida de authData. user.email="${session.user.email}"`)
    }

    if (!session?.user?.email) {
      addLog('   ✗ ERROR: no se pudo obtener session')
      setError('Error al obtener la sesión. Intentá de nuevo.')
      setLoading(false)
      return
    }

    // 3. Consultar perfil en tabla usuarios (con reintento si falla)
    const perfil = await obtenerPerfilConReintento(supabase, session.user.email, addLog)

    if (!perfil) {
      addLog('4. ✗ perfil es null — NO se redirige')
      setError('Usuario no encontrado en el sistema. Contactá al administrador.')
      setLoading(false)
      return
    }

    // 4. Redirigir según rol
    const destino = perfil.rol === 'operador' ? '/operador' : '/cadete'
    addLog(`4. ✓ perfil obtenido: id=${perfil.id} rol=${perfil.rol} → redirigiendo a ${destino}`)
    redirectTo(destino)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 dark:bg-[#0a0a0a]">
      <div className="w-full max-w-sm">
        {/* Logo + Brand */}
        <div className="mb-8 text-center">
          <img
            src="/iconapk.png"
            alt="Moto Express"
            className="mx-auto mb-4 h-24 w-24"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Moto Express</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
            Sistema de gestión de delivery
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
              placeholder="admin@mensajeria.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* Theme toggle */}
        <div className="mt-6 flex justify-center">
          <ThemeToggle />
        </div>

        {debugLogs.length > 0 && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">DEBUG LOGS:</p>
            {debugLogs.map((msg, i) => (
              <p key={i} className="text-[11px] leading-5 text-gray-600 font-mono dark:text-zinc-400">{msg}</p>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

/**
 * Consulta la tabla usuarios con reintento.
 * Después de signInWithPassword el JWT puede no propagarse
 * instantáneamente a todas las instancias del cliente Supabase.
 */
async function obtenerPerfilConReintento(
  supabase: ReturnType<typeof createClient>,
  userEmail: string,
  log: (msg: string) => void,
  maxIntentos = 4
): Promise<{ id: string; rol: 'operador' | 'cadete' } | null> {
  for (let i = 0; i < maxIntentos; i++) {
    log(`3.${i + 1}. Query usuarios WHERE email="${userEmail}" (intento ${i + 1}/${maxIntentos})`)

    const { data, error } = await supabase
      .from('usuarios')
      .select('id, rol, nombre, email')
      .eq('email', userEmail)
      .maybeSingle()

    if (error) {
      log(`   ✗ ERROR — code="${error.code}" message="${error.message}" details="${error.details ?? ''}" hint="${error.hint ?? ''}"`)
      if (error.message?.toLowerCase().includes('403') || error.message?.toLowerCase().includes('policy') || error.message?.toLowerCase().includes('permission')) {
        log(`   → reintentando en ${500 * (i + 1)}ms...`)
        await new Promise((r) => setTimeout(r, 500 * (i + 1)))
        continue
      }
      log(`   → error no recuperable, cortando`)
      return null
    }

    if (data) {
      log(`   ✓ OK — id="${data.id}" rol="${data.rol}" nombre="${data.nombre}" email="${data.email}"`)
      return { id: data.id, rol: data.rol as 'operador' | 'cadete' }
    }

    // data es null, error es null — usuario no existe en la tabla pública
    log(`   ✗ row not found (data=null, error=null). Usuario no existe en public.usuarios.`)
    log(`   → reintentando en ${500 * (i + 1)}ms por si es race condition...`)
    if (i < maxIntentos - 1) {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }

  log(`   ✗ AGOTADOS ${maxIntentos} intentos. Retornando null.`)
  return null
}
