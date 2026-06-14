import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { nombre, email, password } = body

  if (!nombre || !email || !password) {
    return NextResponse.json(
      { error: 'Faltan campos requeridos: nombre, email, password' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // 1. Create user in auth.users
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol: 'cadete' },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 })
  }

  // 2. Insert into usuarios table
  const { error: insertError } = await supabase.from('usuarios').insert({
    id: authData.user.id,
    email,
    nombre,
    rol: 'cadete',
    activo: true,
  })

  if (insertError) {
    // Rollback: remove the auth user if the insert failed
    await supabase.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, cadete: { id: authData.user.id, nombre, email } })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Falta el parámetro id' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Mark as inactive in usuarios instead of hard-deleting (preserves FK references)
  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ activo: false })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  // Also disable the auth user so they can't log in
  const { error: authError } = await supabase.auth.admin.updateUserById(id, {
    ban_duration: '365d',
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
