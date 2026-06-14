'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'

type UserProfile = {
  id: string
  email: string
  nombre: string
  rol: 'operador' | 'cadete'
  activo: boolean
}

type SessionContext = {
  user: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  isOperador: boolean
  isCadete: boolean
}

const SessionCtx = createContext<SessionContext>({
  user: null,
  loading: true,
  signOut: async () => {},
  isOperador: false,
  isCadete: false,
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // Reintentar porque el JWT puede no estar sincronizado
        // con las cookies inmediatamente después del login
        for (let i = 0; i < 3; i++) {
          const { data } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', session.user.email)
            .maybeSingle()

          if (data) {
            setUser(data)
            break
          }

          if (i < 2) await new Promise((r) => setTimeout(r, 600 * (i + 1)))
        }
      }
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // No recargar — el login page ya redirige
      } else if (!session) {
        setUser(null)
        router.refresh()
      }
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/login')
    router.refresh()
  }

  return (
    <SessionCtx.Provider
      value={{
        user,
        loading,
        signOut,
        isOperador: user?.rol === 'operador',
        isCadete: user?.rol === 'cadete',
      }}
    >
      {children}
    </SessionCtx.Provider>
  )
}

export function useSession() {
  return useContext(SessionCtx)
}
