'use client'

import { useSession } from '@/lib/hooks/useSession'
import { useCadetePosition } from '@/lib/hooks/useCadetePosition'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function CadeteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [gpsActivo, setGpsActivo] = useState(false)

  // GPS tracking runs everywhere within the cadete layout
  useCadetePosition(user?.id)

  // Check GPS availability for the banner
  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      () => setGpsActivo(true),
      () => setGpsActivo(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Redirect if not cadete
  useEffect(() => {
    if (!loading && (!user || user.rol !== 'cadete')) {
      router.replace('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!user || user.rol !== 'cadete') return null

  const isPedidosActive =
    pathname === '/cadete' || pathname.startsWith('/cadete/pedidos')
  const isPerfilActive = pathname === '/cadete/perfil'

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 pb-16">
      {/* GPS Status Banner */}
      <div
        className={`px-4 py-1.5 text-center text-xs font-medium ${
          gpsActivo
            ? 'bg-green-50 text-green-700'
            : 'bg-yellow-50 text-yellow-700'
        }`}
      >
        {gpsActivo
          ? 'GPS activo'
          : 'GPS desactivado — activá la ubicación'}
      </div>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Bottom Tab Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          <Link
            href="/cadete"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isPedidosActive ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6"
            >
              <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875h-8.25ZM13.5 15h-12v2.625c0 1.036.84 1.875 1.875 1.875h.375v-1.5a1.5 1.5 0 0 1 3 0v1.5h1.5v-1.5a1.5 1.5 0 0 1 3 0v1.5h.375c1.035 0 1.875-.84 1.875-1.875V15Z" />
              <path d="M22.5 12.375V6.375c0-1.036-.84-1.875-1.875-1.875h-4.5A1.875 1.875 0 0 0 14.25 6.375v6h8.25Z" />
            </svg>
            <span>Pedidos</span>
          </Link>

          <Link
            href="/cadete/perfil"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              isPerfilActive ? 'text-blue-600' : 'text-gray-500'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-6 w-6"
            >
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
                clipRule="evenodd"
              />
            </svg>
            <span>Perfil</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
