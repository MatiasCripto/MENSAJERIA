'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getEstadoColor, getEstadoLabel, formatDate } from '@/lib/utils/format'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'

const MapWithNoSSR = dynamic(() => import('@/components/shared/Map'), {
  ssr: false,
})

type Pedido = {
  id: string
  palabra_clave: string
  estado: string
  retiro_direccion: string
  retiro_contacto: string | null
  retiro_telefono: string | null
  entrega_direccion: string
  entrega_contacto: string | null
  entrega_telefono: string | null
  notas: string | null
  created_at: string
  cadete_id: string
}

type FormType = 'entregado' | 'no_atendio' | 'cerrado' | 'otro'

export default function PedidoContent() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: sessionLoading } = useSession()
  const supabase = createClient()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [showDeliveryOptions, setShowDeliveryOptions] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<FormType | null>(null)
  const [receptorNombre, setReceptorNombre] = useState('')
  const [receptorDni, setReceptorDni] = useState('')
  const [notaFallo, setNotaFallo] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Keyword verification state ---
  const [mostrarInputClave, setMostrarInputClave] = useState(false)
  const [inputClave, setInputClave] = useState('')
  const [errorClave, setErrorClave] = useState<string | null>(null)
  const [claveVerificada, setClaveVerificada] = useState(false)

  const pedidoId = params?.id as string

  // Fetch pedido data
  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace('/login')
      return
    }
    if (!pedidoId || sessionLoading) return

    const fetchPedido = async () => {
      const { data, error: fetchError } = await supabase
        .from('pedidos')
        .select('*')
        .eq('id', pedidoId)
        .single()

      if (fetchError || !data) {
        setError('No se pudo cargar el pedido')
        setLoading(false)
        return
      }
      setPedido(data)
      setLoading(false)
    }

    fetchPedido()
  }, [pedidoId, sessionLoading, user, router, supabase])

  // --- Derived values ---
  const estado = pedido?.estado ?? ''
  const currentDir =
    estado === 'en_retiro'
      ? pedido?.retiro_direccion ?? ''
      : pedido?.entrega_direccion ?? ''
  const currentContacto =
    estado === 'en_retiro'
      ? pedido?.retiro_contacto
      : pedido?.entrega_contacto
  const currentTelefono =
    estado === 'en_retiro'
      ? pedido?.retiro_telefono
      : pedido?.entrega_telefono

  // --- Handlers ---

  const handleOpenMaps = () => {
    const encoded = encodeURIComponent(currentDir)
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      '_blank',
    )
  }

  const handleStateChange = async (newEstado: string) => {
    const messages: Record<string, string> = {
      en_retiro: 'iniciar el retiro',
      en_camino: 'ir a la entrega',
    }

    if (
      !window.confirm(
        `Confirmás que querés ${messages[newEstado] || 'cambiar el estado'}?`,
      )
    )
      return

    setUpdating(true)
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: newEstado })
      .eq('id', pedidoId)

    if (updateError) {
      toast.error('Error al actualizar el estado')
      setUpdating(false)
      return
    }

    setPedido({ ...pedido!, estado: newEstado })
    setShowDeliveryOptions(false)
    toast.success('Estado actualizado')
    setUpdating(false)
  }

  const handleLlegue = () => {
    setMostrarInputClave(true)
    setInputClave('')
    setErrorClave(null)
  }

  const handleVerificarClave = () => {
    if (!inputClave.trim()) {
      setErrorClave('Ingresá la palabra clave')
      return
    }
    if (inputClave.trim().toLowerCase() !== pedido?.palabra_clave.toLowerCase()) {
      setErrorClave('Palabra clave incorrecta')
      return
    }
    setErrorClave(null)
    setClaveVerificada(true)
    setShowDeliveryOptions(true)
    setMostrarInputClave(false)
  }

  const handleCancelarClave = () => {
    setMostrarInputClave(false)
    setInputClave('')
    setErrorClave(null)
  }

  const openDeliveryForm = (type: FormType) => {
    setFormType(type)
    setReceptorNombre('')
    setReceptorDni('')
    setNotaFallo('')
    setPhotoFile(null)
    setPhotoPreview(null)
    setShowForm(true)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    // --- Validation ---
    if (formType === 'entregado') {
      if (!receptorNombre.trim() || !receptorDni.trim()) {
        toast.error('Completá nombre y DNI del receptor')
        return
      }
    }

    if (formType !== 'entregado' && !photoFile) {
      toast.error('Sacá una foto como comprobante')
      return
    }

    if (formType === 'otro' && !notaFallo.trim()) {
      toast.error('Agregá una nota explicando el motivo')
      return
    }

    setSubmitting(true)

    // --- Upload photo ---
    let photoUrl: string | null = null
    if (photoFile) {
      const fileName = `${pedidoId}/${Date.now()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('fotos-entrega')
        .upload(fileName, photoFile)

      if (uploadError) {
        toast.error('Error al subir la foto')
        setSubmitting(false)
        return
      }

      photoUrl =
        supabase.storage.from('fotos-entrega').getPublicUrl(uploadData.path)
          .data.publicUrl
    }

    // --- Insert intento_entrega ---
    const tipoIntento = formType

    const intentoData: Record<string, unknown> = {
      pedido_id: pedidoId,
      tipo: tipoIntento,
      foto_url: photoUrl,
    }

    if (formType === 'entregado') {
      intentoData.receptor_nombre = receptorNombre.trim()
      intentoData.receptor_dni = receptorDni.trim()
    }

    if (formType === 'otro') {
      intentoData.notas = notaFallo.trim()
    }

    if (user?.id) {
      intentoData.cadete_id = user.id
    }

    const { error: intentoError } = await supabase
      .from('intentos_entrega')
      .insert(intentoData)

    if (intentoError) {
      console.error('[ENTREGA] ERROR al insertar intento:', {
        message: intentoError.message,
        details: intentoError.details,
        hint: intentoError.hint,
        code: intentoError.code,
      })
      toast.error('Error al registrar el intento')
      setSubmitting(false)
      return
    }

    // --- Update pedido estado ---
    const newEstado = formType === 'entregado' ? 'entregado' : 'fallido'
    const { error: updateError } = await supabase
      .from('pedidos')
      .update({ estado: newEstado })
      .eq('id', pedidoId)

    if (updateError) {
      toast.error('Error al actualizar el pedido')
      setSubmitting(false)
      return
    }

    setPedido({ ...pedido!, estado: newEstado })
    setShowForm(false)
    setShowDeliveryOptions(false)
    toast.success(
      formType === 'entregado'
        ? 'Entrega registrada correctamente'
        : 'Intento registrado',
    )
    setSubmitting(false)
  }

  // --- Loading state ---
  if (sessionLoading || loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
          <div className="mb-3 h-8 w-32 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="mb-2 h-4 w-full rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="mb-2 h-4 w-3/4 rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="mb-2 h-4 w-1/2 rounded bg-gray-100 dark:bg-zinc-800" />
          <div className="h-4 w-2/3 rounded bg-gray-100 dark:bg-zinc-800" />
        </div>
        <div className="h-64 animate-pulse rounded-lg bg-gray-200 dark:bg-zinc-800" />
      </div>
    )
  }

  // --- Error state ---
  if (error || !pedido) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20">
        <p className="text-lg font-medium text-gray-900 dark:text-white">
          {error || 'Pedido no encontrado'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push('/cadete')}
        >
          Volver a mis pedidos
        </Button>
      </div>
    )
  }

  // --- Render ---
  return (
    <div className="space-y-4 p-4 pb-8">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
            clipRule="evenodd"
          />
        </svg>
        Volver
      </button>

      {/* 1. Order Info Card */}
      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {estado === 'en_retiro' ? 'Retiro' : estado === 'en_camino' ? 'Entrega' : 'Pedido'}
            </h1>
            <Badge className={getEstadoColor(estado)}>
              {getEstadoLabel(estado)}
            </Badge>
          </div>

          {/* Active address */}
          <div className="border-t border-gray-100 pt-3 dark:border-zinc-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
              {estado === 'en_retiro'
                ? 'Dirección de retiro'
                : 'Dirección de entrega'}
            </p>
            <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">{currentDir}</p>
          </div>

          {currentContacto && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                Contacto
              </p>
              <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">{currentContacto}</p>
            </div>
          )}

          {currentTelefono && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                Teléfono
              </p>
              <a
                href={`tel:${currentTelefono}`}
                className="mt-0.5 block text-sm font-medium text-primary hover:underline dark:text-red-400"
              >
                {currentTelefono}
              </a>
            </div>
          )}

          {/* Other address (if not in retiro state) */}
          {estado !== 'en_retiro' && (
            <div className="border-t border-gray-100 pt-3 dark:border-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                Dirección de retiro
              </p>
              <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">
                {pedido.retiro_direccion}
              </p>
              {pedido.retiro_contacto && (
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {pedido.retiro_contacto}
                  {pedido.retiro_telefono
                    ? ` — ${pedido.retiro_telefono}`
                    : ''}
                </p>
              )}
            </div>
          )}

          {estado !== 'en_retiro' && estado !== 'en_camino' && (
            <div className="border-t border-gray-100 pt-3 dark:border-zinc-800">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                Dirección de entrega
              </p>
              <p className="mt-0.5 text-sm text-gray-700 dark:text-zinc-300">
                {pedido.entrega_direccion}
              </p>
              {pedido.entrega_contacto && (
                <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                  {pedido.entrega_contacto}
                  {pedido.entrega_telefono
                    ? ` — ${pedido.entrega_telefono}`
                    : ''}
                </p>
              )}
            </div>
          )}

          {/* Notas */}
          {pedido.notas && (
            <div className="rounded-md bg-yellow-50 p-3 dark:bg-yellow-950/30">
              <p className="text-xs font-medium uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                Notas
              </p>
              <p className="mt-0.5 text-sm text-yellow-800 dark:text-yellow-300">{pedido.notas}</p>
            </div>
          )}

          <p className="pt-1 text-xs text-gray-400 dark:text-zinc-500">
            Creado: {formatDate(pedido.created_at)}
          </p>
        </div>
      </Card>

      {/* 2. Map */}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
        <MapWithNoSSR
          center={[-34.6037, -58.3816]}
          markers={[{ lat: -34.6037, lng: -58.3816, label: currentDir }]}
          height="250px"
        />
      </div>

      {/* 3. Google Maps Button */}
      <Button
        variant="outline"
        size="lg"
        className="w-full min-h-[44px]"
        onClick={handleOpenMaps}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path
            fillRule="evenodd"
            d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
        Abrir en Google Maps
      </Button>

      {/* 4. Action Buttons (based on estado) */}
      {estado === 'asignado' && (
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-[44px]"
          onClick={() => handleStateChange('en_retiro')}
          disabled={updating}
        >
          {updating ? 'Actualizando...' : 'Iniciar retiro'}
        </Button>
      )}

      {estado === 'en_retiro' && (
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-[44px]"
          onClick={() => handleStateChange('en_camino')}
          disabled={updating}
        >
          {updating ? 'Actualizando...' : 'Camino a entrega'}
        </Button>
      )}

      {estado === 'en_camino' && !showDeliveryOptions && !mostrarInputClave && (
        <Button
          variant="primary"
          size="lg"
          className="w-full min-h-[44px]"
          onClick={handleLlegue}
          disabled={updating}
        >
          Llegué al destino
        </Button>
      )}

      {/* Keyword verification */}
      {mostrarInputClave && estado === 'en_camino' && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Ingresá la palabra clave que te dio el receptor
          </p>
          <input
            type="text"
            value={inputClave}
            onChange={(e) => {
              setInputClave(e.target.value)
              setErrorClave(null)
            }}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
            placeholder="Palabra clave"
            autoComplete="off"
          />
          {errorClave && (
            <p className="text-sm text-red-600 dark:text-red-400">{errorClave}</p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="md"
              className="flex-1 min-h-[44px]"
              onClick={handleCancelarClave}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1 min-h-[44px]"
              onClick={handleVerificarClave}
            >
              Verificar
            </Button>
          </div>
        </div>
      )}

      {/* 5. Delivery Action Options */}
      {showDeliveryOptions && !showForm && estado === 'en_camino' && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Acciones de entrega
          </p>
          <div className="space-y-2">
            <Button
              variant="primary"
              size="lg"
              className="w-full min-h-[44px]"
              onClick={() => openDeliveryForm('entregado')}
            >
              Entregar
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full min-h-[44px]"
              onClick={() => openDeliveryForm('no_atendio')}
            >
              No atendió nadie
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full min-h-[44px]"
              onClick={() => openDeliveryForm('cerrado')}
            >
              Local/edificio cerrado
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full min-h-[44px]"
              onClick={() => openDeliveryForm('otro')}
            >
              Otro motivo
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowDeliveryOptions(false)}
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* 6. Delivery Form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#1a1a1a]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {formType === 'entregado' && 'Registrar entrega'}
            {formType === 'no_atendio' && 'Registrar: No atendió nadie'}
            {formType === 'cerrado' && 'Registrar: Local cerrado'}
            {formType === 'otro' && 'Registrar: Otro motivo'}
          </h3>

          {/* Entregado form */}
          {formType === 'entregado' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Nombre del receptor *
                </label>
                <input
                  type="text"
                  value={receptorNombre}
                  onChange={(e) => setReceptorNombre(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
                  placeholder="Nombre y apellido"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  DNI del receptor *
                </label>
                <input
                  type="text"
                  value={receptorDni}
                  onChange={(e) => setReceptorDni(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
                  placeholder="Número de documento"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Foto del comprobante
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-red-700 hover:file:bg-red-100 dark:text-zinc-400 dark:file:bg-red-950/50 dark:file:text-red-400 dark:hover:file:bg-red-900/50"
                />
              </div>
            </>
          )}

          {/* No atendió / Cerrado form */}
          {(formType === 'no_atendio' || formType === 'cerrado') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                Foto del comprobante *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoChange}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-red-700 hover:file:bg-red-100 dark:text-zinc-400 dark:file:bg-red-950/50 dark:file:text-red-400 dark:hover:file:bg-red-900/50"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                Sacá una foto como comprobante
              </p>
            </div>
          )}

          {/* Otro motivo form */}
          {formType === 'otro' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Foto del comprobante *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-red-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-red-700 hover:file:bg-red-100 dark:text-zinc-400 dark:file:bg-red-950/50 dark:file:text-red-400 dark:hover:file:bg-red-900/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Nota *
                </label>
                <textarea
                  value={notaFallo}
                  onChange={(e) => setNotaFallo(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
                  placeholder="Explicá el motivo..."
                />
              </div>
            </>
          )}

          {/* Photo preview */}
          {photoPreview && (
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full object-cover"
              />
            </div>
          )}

          {/* Form action buttons */}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="md"
              className="flex-1 min-h-[44px]"
              onClick={() => setShowForm(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              className="flex-1 min-h-[44px]"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Guardando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      )}

      {/* 7. Completed state message */}
      {(estado === 'entregado' || estado === 'fallido') && (
        <div
          className={`rounded-lg p-4 text-center ${
            estado === 'entregado'
              ? 'bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400'
              : 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400'
          }`}
        >
          <p className="text-base font-medium">
            {estado === 'entregado'
              ? 'Pedido entregado correctamente'
              : 'Intento de entrega fallido'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => router.push('/cadete')}
          >
            Volver a mis pedidos
          </Button>
        </div>
      )}
    </div>
  )
}
