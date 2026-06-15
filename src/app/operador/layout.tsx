'use client'

import { useSession } from '@/lib/hooks/useSession'
import { cn } from '@/lib/utils/cn'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

const navLinks = [
  { href: '/operador', label: 'Dashboard', icon: '📊' },
  { href: '/operador/pedidos', label: 'Pedidos', icon: '📦' },
  { href: '/operador/equipo', label: 'Equipo', icon: '👥' },
  { href: '/operador/cadetes', label: 'Cadetes', icon: '👤' },
  { href: '/operador/reportes', label: 'Reportes', icon: '📈' },
  { href: '/operador/recorridos', label: 'Recorridos', icon: '📍' },
  { href: '/operador/mapa', label: 'Mapa', icon: '🗺️' },
]

export default function OperadorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, signOut, isOperador } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!loading && !isOperador) {
      if (Capacitor.isNativePlatform()) {
        localStorage.setItem('redirectAfterLogin', '/login')
        window.location.reload()
      } else {
        router.replace('/login')
      }
    }
  }, [loading, isOperador, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0a0a0a]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-white dark:bg-[#0a0a0a]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white shadow-lg transition-transform duration-200 dark:border-zinc-800 dark:bg-[#1a1a1a] lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6 dark:border-zinc-800">
          <img src="/iconapk.png" alt="Moto Express" className="h-8 w-8" />
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Moto Express</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navLinks.map((link) => {
            const isActive =
              link.href === '/operador'
                ? pathname === '/operador'
                : pathname.startsWith(link.href)

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-light text-primary dark:bg-red-950 dark:text-red-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white',
                )}
              >
                <span className="text-lg">{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* User info & sign out */}
        <div className="border-t border-gray-200 px-4 py-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary dark:bg-red-950 dark:text-red-400">
              {user.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                {user.nombre}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-zinc-400">{user.email}</p>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar (mobile) */}
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 dark:border-zinc-800 dark:bg-[#1a1a1a] lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Abrir menú"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <img src="/iconapk.png" alt="Moto Express" className="h-7 w-7" />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Moto Express</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
