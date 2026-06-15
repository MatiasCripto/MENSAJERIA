'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useEffect, useState, useRef } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { getEstadoColor, getEstadoLabel, formatDate } from '@/lib/utils/format'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

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

type Props = {
  pedido: Pedido
  onVolver: () => void
}

export default function PedidoDetalle({ pedido: initialPedido, onVolver }: Props) {
  const { user } = useSession()
  const supabase = createClient()

  const [pedido, setPedido] = useState<Pedido>(initialPedido)
  const [updating, setUpdating] = useState(false)
  const [showDeliveryOptions, setShowDeliveryOptions] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<FormType | null>(null)
  const [receptorNombre, setReceptorNombre] = useState('')
  const [receptorDni, setReceptorDni] = useState('')
  const [notaFallo, setNotaFallo] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Espera state ---
  const [esperaActiva, setEsperaActiva] = useState<{ id: string; inicio: string } | null>(null)
  const [esperaSegundos, setEsperaSegundos] = useState(0)
  const [esperaFinalizada, setEsperaFinalizada] = useState<{ minutos: number; importe: number } | null>(null)
  const [iniciandoEspera, setIniciandoEspera] = useState(false)

  // --- Cobro state ---
  const [cobroActivo, setCobroActivo] = useState(false)
  const [cobroTipo, setCobroTipo] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [cobroMonto, setCobroMonto] = useState('')

  // --- Keyword verification state ---
  const [mostrarInputClave, setMostrarInputClave] = useState(false)
  const [inputClave, setInputClave] = useState('')
  const [errorClave, setErrorClave] = useState<string | null>(null)
  const [claveVerificada, setClaveVerificada] = useState(false)

  const pedidoId = pedido.id

  // Timer for espera
  useEffect(() => {
    if (!esperaActiva) return
    const interval = setInterval(() => {
      setEsperaSegundos((s) => s + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [esperaActiva])

  // --- Derived values ---
  const estado = pedido.estado
  const currentDir =
    estado === 'en_retiro'
      ? pedido.retiro_direccion
      : pedido.entrega_direccion
  const currentContacto =
    estado === 'en_retiro'
      ? pedido.retiro_contacto
      : pedido.entrega_contacto
  const currentTelefono =
    estado === 'en_retiro'
      ? pedido.retiro_telefono
      : pedido.entrega_telefono

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

  // --- Espera handlers ---
  const handleIniciarEspera = async () => {
    setIniciandoEspera(true)
    const { data, error } = await supabase
      .from('esperas')
      .insert({
        pedido_id: pedidoId,
        cadete_id: user?.id,
        inicio: new Date().toISOString(),
      })
      .select()
      .single()
    if (error || !data) {
      toast.error('Error al iniciar la espera')
      setIniciandoEspera(false)
      return
    }
    setEsperaActiva({ id: data.id, inicio: data.inicio })
    setEsperaSegundos(0)
    setIniciandoEspera(false)
    toast.success('Espera iniciada')
  }

  const handleFinalizarEspera = async () => {
    if (!esperaActiva) return
    const ahora = new Date()
    const inicio = new Date(esperaActiva.inicio)
    const minutosTotales = Math.floor((ahora.getTime() - inicio.getTime()) / 60000)
    const minutosCobrados = Math.max(0, minutosTotales - 5)
    const bloques = Math.ceil(minutosCobrados / 30)
    const importe = bloques * 5000

    setIniciandoEspera(true)
    const { error } = await supabase
      .from('esperas')
      .update({
        fin: ahora.toISOString(),
        minutos_cobrados: minutosCobrados,
        importe_espera: importe,
      })
      .eq('id', esperaActiva.id)
    if (error) {
      toast.error('Error al finalizar la espera')
      setIniciandoEspera(false)
      return
    }
    setEsperaFinalizada({ minutos: minutosCobrados, importe })
    setEsperaActiva(null)
    setEsperaSegundos(0)
    setIniciandoEspera(false)
    toast.success(`Espera finalizada — $${importe.toFixed(2)}`)
  }

  const formatTiempo = (segundos: number) => {
    const m = Math.floor(segundos / 60)
    const s = segundos % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const openDeliveryForm = (type: FormType) => {
    setFormType(type)
    setReceptorNombre('')
    setReceptorDni('')
    setNotaFallo('')
    setPhotoFile(null)
    setPhotoDataUrl(null)
    setPhotoPreview(null)
    setShowForm(true)
  }

  const handleSacarFoto = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
        })
        if (photo.dataUrl) {
          setPhotoDataUrl(photo.dataUrl)
          setPhotoPreview(photo.dataUrl)
          setPhotoFile(null)
        }
      } catch {
        // User cancelled or error — ignore
      }
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleWebFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoDataUrl(null)
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
      if (cobroActivo && !cobroMonto.trim()) {
        toast.error('Ingresá el monto del cobro')
        return
      }
    }

    if (formType !== 'entregado' && !photoFile && !photoDataUrl) {
      toast.error('Debés sacar una foto como evidencia antes de continuar')
      return
    }

    if (formType === 'otro' && !notaFallo.trim()) {
      toast.error('Agregá una nota explicando el motivo')
      return
    }

    setSubmitting(true)

    // --- Upload photo ---
    let photoUrl: string | null = null
    const uploadDataUrl = async (dataUrl: string) => {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const fileName = `intentos/${pedidoId}/${Date.now()}.jpg`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('fotos-entrega')
        .upload(fileName, blob, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      return supabase.storage.from('fotos-entrega').getPublicUrl(uploadData.path).data.publicUrl
    }

    try {
      if (photoDataUrl) {
        photoUrl = await uploadDataUrl(photoDataUrl)
      } else if (photoFile) {
        const fileName = `intentos/${pedidoId}/${Date.now()}.jpg`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('fotos-entrega')
          .upload(fileName, photoFile)
        if (uploadError) throw uploadError
        photoUrl =
          supabase.storage.from('fotos-entrega').getPublicUrl(uploadData.path).data.publicUrl
      }
    } catch (err) {
      toast.error('Error al subir la foto')
      console.error(err)
      setSubmitting(false)
      return
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
    const updateFields: Record<string, unknown> = { estado: newEstado }
    if (formType === 'entregado' && cobroActivo) {
      updateFields.cobro_monto = parseFloat(cobroMonto)
      updateFields.cobro_tipo = cobroTipo
      if (cobroTipo === 'transferencia') {
        updateFields.estado = 'esperando_pago'
        updateFields.cobro_confirmado = false
      }
    }
    const { error: updateError } = await supabase
      .from('pedidos')
      .update(updateFields)
      .eq('id', pedidoId)

    if (updateError) {
      toast.error('Error al actualizar el pedido')
      setSubmitting(false)
      return
    }

    setPedido({ ...pedido!, estado: updateFields.estado as string })
    setShowForm(false)
    setShowDeliveryOptions(false)
    toast.success(
      formType === 'entregado'
        ? 'Entrega registrada correctamente'
        : 'Intento registrado',
    )
    setSubmitting(false)
  }

  // --- Render ---
  return (
    <div className="space-y-4 pb-8">
      {/* Back button */}
      <button
        onClick={onVolver}
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

      {/* 3.5 Espera section */}
      {(estado === 'en_camino' || estado === 'en_retiro') && (
        <Card title={esperaActiva ? 'Espera activa' : 'Tiempo de espera'}>
          {esperaActiva ? (
            <div className="space-y-3 text-center">
              <p className="text-3xl font-bold text-primary font-mono">
                {formatTiempo(esperaSegundos)}
              </p>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                $5000 cada 30 min · 5 min de tolerancia
              </p>
              <Button
                onClick={handleFinalizarEspera}
                disabled={iniciandoEspera}
                variant="outline"
                className="w-full"
              >
                {iniciandoEspera ? 'Finalizando...' : 'Finalizar espera'}
              </Button>
            </div>
          ) : esperaFinalizada ? (
            <div className="space-y-2 text-center">
              <p className="text-sm text-green-600 dark:text-green-400">
                Espera finalizada
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {esperaFinalizada.minutos} min — ${esperaFinalizada.importe.toFixed(2)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEsperaFinalizada(null)}
              >
                Cerrar
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleIniciarEspera}
              disabled={iniciandoEspera}
              variant="outline"
              className="w-full"
            >
              {iniciandoEspera ? 'Iniciando...' : 'Iniciar espera'}
            </Button>
          )}
        </Card>
      )}

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
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={cobroActivo}
              onChange={(e) => setCobroActivo(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            El cliente realiza un pago
          </label>
          {cobroActivo && (
            <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-zinc-700">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="cobro_tipo"
                    value="efectivo"
                    checked={cobroTipo === 'efectivo'}
                    onChange={() => setCobroTipo('efectivo')}
                  />
                  Efectivo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="cobro_tipo"
                    value="transferencia"
                    checked={cobroTipo === 'transferencia'}
                    onChange={() => setCobroTipo('transferencia')}
                  />
                  Transferencia
                </label>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cobroMonto}
                onChange={(e) => setCobroMonto(e.target.value)}
                placeholder="Monto $"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white"
              />
            </div>
          )}
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

      {/* 5.5 Waiting for payment confirmation */}
      {estado === 'esperando_pago' && (
        <div className="rounded-lg bg-yellow-50 p-4 text-center dark:bg-yellow-950/30">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            Esperando confirmación del operador...
          </p>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            El pago por transferencia debe ser confirmado por el operador
          </p>
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
                <div className="mt-1">
                  {photoPreview ? (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
                        <img src={photoPreview} alt="Foto" className="w-full object-cover" />
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={handleSacarFoto}>
                        Sacar de nuevo
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={handleSacarFoto}>
                      📷 Sacar foto
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleWebFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </>
          )}

          {/* No atendió / Cerrado form */}
          {(formType === 'no_atendio' || formType === 'cerrado') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                Foto del comprobante *
              </label>
              <div className="mt-1">
                {photoPreview ? (
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
                      <img src={photoPreview} alt="Foto" className="w-full object-cover" />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={handleSacarFoto}>
                      Sacar de nuevo
                    </Button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={handleSacarFoto}>
                    📷 Sacar foto
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleWebFileChange}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Otro motivo form */}
          {formType === 'otro' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Foto del comprobante *
                </label>
                <div className="mt-1">
                  {photoPreview ? (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-zinc-800">
                        <img src={photoPreview} alt="Foto" className="w-full object-cover" />
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={handleSacarFoto}>
                        Sacar de nuevo
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={handleSacarFoto}>
                      📷 Sacar foto
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleWebFileChange}
                    className="hidden"
                  />
                </div>
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
      {(estado === 'entregado' || estado === 'fallido' || estado === 'esperando_pago') && (
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
            onClick={onVolver}
          >
            Volver a mis pedidos
          </Button>
        </div>
      )}
    </div>
  )
}
