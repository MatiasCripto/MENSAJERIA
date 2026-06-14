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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const path = request.nextUrl.pathname

  // Public routes — no auth needed
  if (path === '/login' || path.startsWith('/seguimiento/')) {
    return supabaseResponse
  }

  // Use getSession() instead of getUser() for optimistic checks.
  // getUser() makes an external API call to validate the access token,
  // which can fail on Vercel Edge Runtime. getSession() reads the
  // session from cookies locally — faster and more reliable.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Redirect unauthenticated users to login
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Read role from user_metadata (set during user creation via admin API)
  // so we don't need to query the usuarios table from the middleware
  const rol = session.user.user_metadata?.rol as string | undefined

  // Operador routes
  if (path.startsWith('/operador')) {
    if (rol !== 'operador') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Cadete routes
  if (path.startsWith('/cadete')) {
    if (rol !== 'cadete') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return supabaseResponse
  }

  // Root: redirect authenticated users to their dashboard
  if (path === '/') {
    if (rol === 'operador') {
      return NextResponse.redirect(new URL('/operador', request.url))
    }
    if (rol === 'cadete') {
      return NextResponse.redirect(new URL('/cadete', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Unknown authenticated route — redirect to dashboard based on role
  if (rol === 'operador') {
    return NextResponse.redirect(new URL('/operador', request.url))
  }
  if (rol === 'cadete') {
    return NextResponse.redirect(new URL('/cadete', request.url))
  }
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|api/|.*\\.png$).*)',
  ],
}
