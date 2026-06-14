'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { generarPalabraClave } from '@/lib/utils/format'
import { Select } from '@/components/ui/Select'
import { toast } from 'sonner'

const FORMA_PAGO_OPTIONS = [
  { value: '', label: 'Seleccionar...' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'mercadopago', label: 'MercadoPago' },
  { value: 'transferencia', label: 'Transferencia' },
]

type FormData = {
  retiro_direccion: string
  retiro_contacto: string
  retiro_telefono: string
  entrega_direccion: string
  entrega_contacto: string
  entrega_telefono: string
  notas: string
  cliente_empresa: string
  contacto_nombre: string
  hora_salida: string
  importe: string
  forma_pago: string
}

const INITIAL_FORM: FormData = {
  retiro_direccion: '',
  retiro_contacto: '',
  retiro_telefono: '',
  entrega_direccion: '',
  entrega_contacto: '',
  entrega_telefono: '',
  notas: '',
  cliente_empresa: '',
  contacto_nombre: '',
  hora_salida: '',
  importe: '',
  forma_pago: '',
}

export default function NuevoPedidoPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [pedidoCreado, setPedidoCreado] = useState<{
    palabra_clave: string
    codigo: number
    token_cliente: string
    tracking_url: string
  } | null>(null)

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
    }
  }, [loading, isOperador, router])

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!form.retiro_direccion.trim()) {
      newErrors.retiro_direccion = 'La dirección de retiro es obligatoria'
    }
    if (!form.retiro_contacto.trim()) {
      newErrors.retiro_contacto = 'El contacto de retiro es obligatorio'
    }
    if (!form.retiro_telefono.trim()) {
      newErrors.retiro_telefono = 'El teléfono de retiro es obligatorio'
    }
    if (!form.entrega_direccion.trim()) {
      newErrors.entrega_direccion = 'La dirección de entrega es obligatoria'
    }
    if (!form.entrega_contacto.trim()) {
      newErrors.entrega_contacto = 'El contacto de entrega es obligatorio'
    }
    if (!form.entrega_telefono.trim()) {
      newErrors.entrega_telefono = 'El teléfono de entrega es obligatorio'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Clear error on change
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setSubmitting(true)

    try {
      const palabraClave = generarPalabraClave()

      const { data, error: insertError } = await supabase
        .from('pedidos')
        .insert({
          retiro_direccion: form.retiro_direccion.trim(),
          retiro_contacto: form.retiro_contacto.trim(),
          retiro_telefono: form.retiro_telefono.trim(),
          entrega_direccion: form.entrega_direccion.trim(),
          entrega_contacto: form.entrega_contacto.trim(),
          entrega_telefono: form.entrega_telefono.trim(),
          notas: form.notas.trim() || null,
          palabra_clave: palabraClave,
          estado: 'pendiente',
          cliente_empresa: form.cliente_empresa.trim() || null,
          contacto_nombre: form.contacto_nombre.trim() || null,
          hora_salida: form.hora_salida || null,
          importe: form.importe ? parseFloat(form.importe) : null,
          forma_pago: form.forma_pago || null,
        })
        .select('id, codigo, token_cliente, palabra_clave')
        .single()

      if (insertError || !data) {
        toast.error('Error al crear el pedido')
        console.error('Insert error:', insertError)
        return
      }

      const trackingUrl = `${window.location.origin}/seguimiento/${data.token_cliente}`

      toast.success('Pedido creado exitosamente', {
        duration: 10000,
        description: `Palabra clave: ${palabraClave} — Código #${data.codigo}`,
      })

      // Mostrar panel con palabra clave + token + link de tracking
      setPedidoCreado({
        palabra_clave: data.palabra_clave,
        codigo: data.codigo,
        token_cliente: data.token_cliente,
        tracking_url: trackingUrl,
      })
    } catch (err) {
      toast.error('Error inesperado al crear el pedido')
      console.error('Submit error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Pedido</h1>
        <p className="mt-1 text-sm text-gray-500">
          Completa los datos del pedido para crearlo en el sistema
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Retiro */}
          <Card title="Dirección de retiro">
            <div className="space-y-4">
              <Input
                label="Dirección *"
                name="retiro_direccion"
                placeholder="Av. Ejemplo 1234"
                value={form.retiro_direccion}
                onChange={handleChange}
                error={errors.retiro_direccion}
              />
              <Input
                label="Contacto *"
                name="retiro_contacto"
                placeholder="Nombre del remitente"
                value={form.retiro_contacto}
                onChange={handleChange}
                error={errors.retiro_contacto}
              />
              <Input
                label="Teléfono *"
                name="retiro_telefono"
                placeholder="11 1234-5678"
                value={form.retiro_telefono}
                onChange={handleChange}
                error={errors.retiro_telefono}
              />
            </div>
          </Card>

          {/* Entrega */}
          <Card title="Dirección de entrega">
            <div className="space-y-4">
              <Input
                label="Dirección *"
                name="entrega_direccion"
                placeholder="Av. Destino 5678"
                value={form.entrega_direccion}
                onChange={handleChange}
                error={errors.entrega_direccion}
              />
              <Input
                label="Contacto *"
                name="entrega_contacto"
                placeholder="Nombre del destinatario"
                value={form.entrega_contacto}
                onChange={handleChange}
                error={errors.entrega_contacto}
              />
              <Input
                label="Teléfono *"
                name="entrega_telefono"
                placeholder="11 8765-4321"
                value={form.entrega_telefono}
                onChange={handleChange}
                error={errors.entrega_telefono}
              />
            </div>
          </Card>

          {/* Notas */}
          <Card title="Notas (opcional)">
            <textarea
              name="notas"
              rows={3}
              placeholder="Instrucciones adicionales para el cadete..."
              value={form.notas}
              onChange={handleChange}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
            />
          </Card>

          {/* Facturación */}
          <Card title="Información de facturación (opcional)">
            <div className="space-y-4">
              <Input
                label="Cliente / Empresa"
                name="cliente_empresa"
                placeholder="Ej: Distribuidora Pepe"
                value={form.cliente_empresa}
                onChange={handleChange}
              />
              <Input
                label="Contacto / Quién llamó"
                name="contacto_nombre"
                placeholder="Nombre de quien llamó"
                value={form.contacto_nombre}
                onChange={handleChange}
              />
              <Input
                label="Hora de salida"
                name="hora_salida"
                type="time"
                value={form.hora_salida}
                onChange={handleChange}
              />
              <Input
                label="Importe del viaje ($)"
                name="importe"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.importe}
                onChange={handleChange}
              />
              <Select
                label="Forma de pago"
                options={FORMA_PAGO_OPTIONS}
                value={form.forma_pago}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, forma_pago: e.target.value }))
                }
              />
            </div>
          </Card>

          {/* Submit */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/operador/pedidos')}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creando pedido...' : 'Crear Pedido'}
            </Button>
          </div>
        </div>
      </form>

      {/* Resultado: mostrar después de crear */}
      {pedidoCreado && (
        <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <span className="text-2xl text-green-600">✓</span>
          </div>
          <h2 className="text-lg font-bold text-green-800">Pedido creado</h2>

          <div className="mt-4 space-y-3 text-left">
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-gray-500">Palabra clave</p>
              <p className="text-xl font-bold text-gray-900">{pedidoCreado.palabra_clave}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-gray-500">Código</p>
              <p className="text-lg font-semibold text-gray-900">#{pedidoCreado.codigo}</p>
            </div>
            <div className="rounded-lg bg-white p-3">
              <p className="text-xs text-gray-500">Link de seguimiento para el cliente</p>
              <p className="mt-1 break-all text-sm font-mono text-blue-600 select-all">
                {pedidoCreado.tracking_url}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(pedidoCreado.tracking_url)
                  toast.success('Link copiado al portapapeles')
                }}
                className="mt-1 text-xs text-blue-500 hover:text-blue-700 underline"
              >
                Copiar link
              </button>
            </div>
          </div>

          <div className="mt-6 flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={() => router.push(`/operador/pedidos/${pedidoCreado.codigo}`)}
            >
              Ver pedido
            </Button>
            <Button
              onClick={() => {
                setPedidoCreado(null)
                setForm(INITIAL_FORM)
                setErrors({})
              }}
            >
              Crear otro pedido
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
