import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Public routes
  if (path === '/login' || path.startsWith('/seguimiento/')) {
    return supabaseResponse
  }

  // Protected routes
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Get user role
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('email', user.email)
    .single()

  // Operador routes
  if (path.startsWith('/operador')) {
    if (usuario?.rol !== 'operador') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Cadete routes
  if (path.startsWith('/cadete')) {
    if (usuario?.rol !== 'cadete') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Root: redirect authenticated users to their dashboard
  if (path === '/') {
    if (usuario?.rol === 'operador') {
      return NextResponse.redirect(new URL('/operador', request.url))
    }
    if (usuario?.rol === 'cadete') {
      return NextResponse.redirect(new URL('/cadete', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.png$).*)',
  ],
}
