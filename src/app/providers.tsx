'use client'

import { SessionProvider } from '@/lib/hooks/useSession'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
