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
