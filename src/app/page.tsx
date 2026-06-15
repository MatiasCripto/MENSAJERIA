'use client'

import { useSession } from '@/lib/hooks/useSession'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import OperadorLayout from './operador/layout'
import OperadorDashboard from './operador/page'
import CadeteLayout from './cadete/layout'
import CadeteDashboard from './cadete/page'
import LoginPage from './login/page'

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const { user, loading } = useSession()

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const saved = localStorage.getItem('redirectAfterLogin')
      if (saved) {
        localStorage.removeItem('redirectAfterLogin')
      }
    }
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  if (user.rol === 'operador') {
    return (
      <OperadorLayout>
        <OperadorDashboard />
      </OperadorLayout>
    )
  }

  if (user.rol === 'cadete') {
    return (
      <CadeteLayout>
        <CadeteDashboard />
      </CadeteLayout>
    )
  }

  return null
}
