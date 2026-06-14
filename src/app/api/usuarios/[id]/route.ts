import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Delete from auth.users
  const { error: authError } = await supabase.auth.admin.deleteUser(id)

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Delete from usuarios table
  const { error: deleteError } = await supabase.from('usuarios').delete().eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()
  const { nombre, email } = body

  if (!id) {
    return NextResponse.json({ error: 'Falta el id del usuario' }, { status: 400 })
  }

  if (!nombre || !email) {
    return NextResponse.json({ error: 'Faltan campos requeridos: nombre, email' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Update auth.users
  const { error: authError } = await supabase.auth.admin.updateUserById(id, {
    email,
    user_metadata: { nombre },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // Update usuarios table
  const { error: updateError } = await supabase
    .from('usuarios')
    .update({ nombre, email })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
