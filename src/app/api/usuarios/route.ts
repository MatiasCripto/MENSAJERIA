import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password, nombre, rol } = body

  if (!email || !password || !nombre || !rol) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos: email, password, nombre, rol' },
      { status: 400 },
    )
  }

  if (!['operador', 'cadete'].includes(rol)) {
    return NextResponse.json(
      { error: 'El rol debe ser "operador" o "cadete"' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // 1. Create user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'No se pudo crear el usuario en auth' }, { status: 500 })
  }

  // 2. Insert into usuarios table with the auth user's ID
  const { error: insertError } = await supabase.from('usuarios').insert({
    id: authData.user.id,
    email,
    nombre,
    rol,
    activo: true,
  })

  if (insertError) {
    // Rollback: remove the auth user if the insert failed
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    user: { id: authData.user.id, email, nombre, rol },
  })
}
