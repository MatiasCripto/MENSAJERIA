'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Capacitor } from '@capacitor/core'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type EmpresaConfig = {
  nombre: string
  cuit: string
  direccion: string
  telefono: string
  email: string
  logo_url: string
  banco: string
  cbu: string
  alias: string
  titular: string
}

type PedidoRow = {
  id: string
  codigo: number
  created_at: string
  descripcion: string
  importe: number | null
  cobro_espera: number | null
}

const defaultConfig: EmpresaConfig = {
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  logo_url: '',
  banco: '',
  cbu: '',
  alias: '',
  titular: '',
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function FacturacionPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Auth guard ──
  useEffect(() => {
    if (!loading && !isOperador) {
      if (Capacitor.isNativePlatform()) {
        localStorage.setItem('redirectAfterLogin', '/login')
        window.location.reload()
      } else {
        router.replace('/login')
      }
    }
  }, [loading, isOperador, router])

  // ── 5a. Empresa config ──
  const [config, setConfig] = useState<EmpresaConfig>(defaultConfig)
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const configFetchedRef = useRef(false)

  // ── 5b. Invoice form ──
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteCuit, setClienteCuit] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fetchingPedidos, setFetchingPedidos] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [previewData, setPreviewData] = useState<{
    config: EmpresaConfig
    clienteNombre: string
    clienteCuit: string
    clienteDireccion: string
    pedidos: PedidoRow[]
  } | null>(null)

  // ──────────────────────────────────────────────
  // 5a: Load empresa config
  // ──────────────────────────────────────────────

  useEffect(() => {
    if (!isOperador || configFetchedRef.current) return
    configFetchedRef.current = true

    supabase
      .from('configuracion_empresa')
      .select('*')
      .limit(1)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading empresa config:', error)
        } else if (data && data.length > 0) {
          const row = data[0]
          setConfig({
            nombre: row.nombre ?? '',
            cuit: row.cuit ?? '',
            direccion: row.direccion ?? '',
            telefono: row.telefono ?? '',
            email: row.email ?? '',
            logo_url: row.logo_url ?? '',
            banco: row.banco ?? '',
            cbu: row.cbu ?? '',
            alias: row.alias ?? '',
            titular: row.titular ?? '',
          })
        }
        setConfigLoading(false)
      })
  }, [isOperador, supabase])

  // ── Save empresa config ──
  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true)
    try {
      const { data: existing } = await supabase
        .from('configuracion_empresa')
        .select('id')
        .limit(1)

      if (existing && existing.length > 0) {
        await supabase
          .from('configuracion_empresa')
          .update({
            nombre: config.nombre,
            cuit: config.cuit,
            direccion: config.direccion,
            telefono: config.telefono,
            email: config.email,
            logo_url: config.logo_url,
            banco: config.banco,
            cbu: config.cbu,
            alias: config.alias,
            titular: config.titular,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing[0].id)
      } else {
        await supabase.from('configuracion_empresa').insert({
          nombre: config.nombre,
          cuit: config.cuit,
          direccion: config.direccion,
          telefono: config.telefono,
          email: config.email,
          logo_url: config.logo_url,
          banco: config.banco,
          cbu: config.cbu,
          alias: config.alias,
          titular: config.titular,
        })
      }

      toast.success('Configuración guardada')
    } catch (err) {
      toast.error('Error al guardar la configuración')
      console.error(err)
    } finally {
      setConfigSaving(false)
    }
  }, [config, supabase])

  // ── Logo upload ──
  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setUploadingLogo(true)
      try {
        const ext = file.name.split('.').pop()
        const fileName = `logo-${Date.now()}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('logos')
          .upload(fileName, file, { upsert: true })

        if (uploadError) {
          if (uploadError.message?.includes('bucket') || uploadError.message?.includes('not found')) {
            toast.error('El bucket "logos" no existe. Crealo en Supabase → Storage')
          } else {
            toast.error('Error al subir el logo: ' + uploadError.message)
          }
          console.error(uploadError)
          return
        }

        const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)

        setConfig((prev) => ({ ...prev, logo_url: urlData.publicUrl }))
        toast.success('Logo subido')
      } catch (err) {
        toast.error('Error al subir el logo')
        console.error(err)
      } finally {
        setUploadingLogo(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [supabase],
  )

  // ──────────────────────────────────────────────
  // 5b: Load pedidos for the selected period
  // ──────────────────────────────────────────────

  const handleLoadPedidos = useCallback(async () => {
    if (!fechaDesde || !fechaHasta) {
      toast.error('Seleccioná las fechas de inicio y fin')
      return
    }

    setFetchingPedidos(true)
    setSelectedIds(new Set())
    setPreviewData(null)

    try {
      const desde = new Date(fechaDesde + 'T00:00:00').toISOString()
      const hasta = new Date(fechaHasta + 'T23:59:59').toISOString()

      const { data, error } = await supabase
        .from('pedidos')
        .select('id, codigo, created_at, entrega_direccion, importe, cobro_espera')
        .eq('estado', 'entregado')
        .gte('created_at', desde)
        .lte('created_at', hasta)
        .order('created_at', { ascending: true })

      if (error) {
        toast.error('Error al cargar los pedidos')
        console.error(error)
        return
      }

      const mapped: PedidoRow[] = (data ?? []).map((row) => ({
        id: row.id,
        codigo: row.codigo,
        created_at: row.created_at,
        descripcion: row.entrega_direccion ?? '',
        importe: row.importe,
        cobro_espera: row.cobro_espera ?? 0,
      }))

      setPedidos(mapped)

      if (mapped.length === 0) {
        toast.info('No hay pedidos entregados en ese período')
      }
    } catch (err) {
      toast.error('Error al cargar los pedidos')
      console.error(err)
    } finally {
      setFetchingPedidos(false)
    }
  }, [fechaDesde, fechaHasta, supabase])

  // ── Toggle pedido selection ──
  const togglePedido = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selectedIds.size === pedidos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pedidos.map((p) => p.id)))
    }
  }, [pedidos, selectedIds])

  // ── Preview / Generate PDF ──
  const selectedPedidos = pedidos.filter((p) => selectedIds.has(p.id))

  const handlePreview = useCallback(() => {
    if (selectedPedidos.length === 0) {
      toast.error('Seleccioná al menos un pedido')
      return
    }
    setPreviewData({
      config,
      clienteNombre,
      clienteCuit,
      clienteDireccion,
      pedidos: selectedPedidos,
    })
  }, [selectedPedidos, config, clienteNombre, clienteCuit, clienteDireccion])

  const generatePDF = useCallback(() => {
    if (selectedPedidos.length === 0) {
      toast.error('Seleccioná al menos un pedido')
      return
    }

    setGeneratingPdf(true)

    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 14
      const contentWidth = pageWidth - margin * 2
      let y = margin

      // ── Helper: draw thin black border box ──
      const drawBox = (x: number, yy: number, w: number, h: number) => {
        doc.setDrawColor(0, 0, 0)
        doc.setLineWidth(0.5)
        doc.rect(x, yy, w, h)
      }

      // ── Header ──
      // Left side: logo + company data
      const leftX = margin
      let logoY = y

      if (config.logo_url) {
        try {
          doc.addImage(config.logo_url, 'PNG', leftX, logoY, 30, 15)
          logoY += 18
        } catch {
          logoY = y
        }
      }

      doc.setFontSize(14)
      doc.setFont('Helvetica', 'bold')
      doc.text(config.nombre || 'Moto Express', leftX, logoY + 6)
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      let companyLineY = logoY + 12
      if (config.cuit) {
        doc.text(`CUIT: ${config.cuit}`, leftX, companyLineY)
        companyLineY += 4
      }
      if (config.direccion) {
        doc.text(config.direccion, leftX, companyLineY)
        companyLineY += 4
      }
      if (config.telefono) {
        doc.text(`Tel: ${config.telefono}`, leftX, companyLineY)
        companyLineY += 4
      }
      if (config.email) {
        doc.text(`Email: ${config.email}`, leftX, companyLineY)
        companyLineY += 4
      }

      // Right side: "FACTURA"
      const rightX = pageWidth - margin
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(28)
      doc.setTextColor(220, 38, 38)
      doc.text('FACTURA', rightX, y + 10, { align: 'right' })
      doc.setTextColor(0, 0, 0)

      // Invoice number and date
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(10)
      const invoiceNumber = `F-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
      doc.text(`N° ${invoiceNumber}`, rightX, y + 18, { align: 'right' })
      const todayStr = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      doc.text(`Fecha: ${todayStr}`, rightX, y + 24, { align: 'right' })

      // ── Header separator line ──
      const headerEndY = Math.max(companyLineY + 4, y + 30)
      y = headerEndY + 2
      doc.setDrawColor(220, 38, 38)
      doc.setLineWidth(0.8)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6

      // ── Cliente data box ──
      const clienteBoxH = 28
      drawBox(margin, y, contentWidth, clienteBoxH)
      doc.setFillColor(220, 38, 38)
      doc.rect(margin, y, contentWidth, 7, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('Helvetica', 'bold')
      doc.text('DATOS DEL CLIENTE', margin + 2, y + 5)
      doc.setTextColor(0, 0, 0)
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Cliente: ${clienteNombre}`, margin + 2, y + 13)
      doc.text(`CUIT: ${clienteCuit}`, margin + 2, y + 18)
      doc.text(`Dirección: ${clienteDireccion}`, margin + 2, y + 23)
      y += clienteBoxH + 6

      // ── Periodo text ──
      doc.setFontSize(9)
      doc.text(
        `Período facturado: ${fechaDesde} — ${fechaHasta}`,
        margin,
        y,
      )
      y += 6

      // ── Pedidos table ──
      const tableBody = selectedPedidos.map((p) => [
        String(p.codigo),
        new Date(p.created_at).toLocaleDateString('es-AR'),
        p.descripcion,
        `$${(p.importe ?? 0).toFixed(2)}`,
        `$${(p.cobro_espera ?? 0).toFixed(2)}`,
        `$${((p.importe ?? 0) + (p.cobro_espera ?? 0)).toFixed(2)}`,
      ])

      const subtotal = selectedPedidos.reduce(
        (sum, p) => sum + (p.importe ?? 0) + (p.cobro_espera ?? 0),
        0,
      )
      const iva = subtotal * 0.21
      const total = subtotal + iva

      autoTable(doc, {
        startY: y,
        head: [
          ['Código', 'Fecha', 'Descripción', 'Importe', 'Espera', 'Total'],
        ],
        body: tableBody,
        foot: [
          ['', '', '', '', 'Subtotal', `$${subtotal.toFixed(2)}`],
          ['', '', '', '', 'IVA (21%)', `$${iva.toFixed(2)}`],
          ['', '', '', '', 'TOTAL', `$${total.toFixed(2)}`],
        ],
        styles: {
          fontSize: 8,
          font: 'Helvetica',
          lineColor: [0, 0, 0],
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: [220, 38, 38],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 8,
        },
        columnStyles: {
          0: { cellWidth: 16 },
          1: { cellWidth: 22 },
          2: { cellWidth: 'auto' as unknown as number },
          3: { cellWidth: 20, halign: 'right' },
          4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 20, halign: 'right' },
        },
        // Override last footer row (TOTAL) to red
        didParseCell(data) {
          if (
            data.section === 'foot' &&
            data.row.index === 2
          ) {
            data.cell.styles.textColor = [220, 38, 38]
            data.cell.styles.fontStyle = 'bold'
          }
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.3,
      })

      // @ts-expect-error autoTable adds the finalY property
      y = doc.lastAutoTable.finalY + 10

      // ── Total line (red bold outside table) ──
      doc.setDrawColor(220, 38, 38)
      doc.setLineWidth(0.8)
      doc.line(margin, y, pageWidth - margin, y)
      y += 4
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(220, 38, 38)
      doc.text(`TOTAL: $${total.toFixed(2)}`, rightX, y, { align: 'right' })
      doc.setTextColor(0, 0, 0)
      y += 12

      // ── Footer: bank transfer details + signature ──
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Datos de transferencia bancaria', margin, y)
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(8)
      y += 5
      doc.text(`Banco: ${config.banco || '---'}`, margin, y)
      y += 4
      doc.text(`CBU: ${config.cbu || '---'}`, margin, y)
      y += 4
      doc.text(`Alias: ${config.alias || '---'}`, margin, y)
      y += 4
      doc.text(`Titular: ${config.titular || '---'}`, margin, y)
      y += 8

      // Signature line
      doc.line(margin, y, margin + 50, y)
      y += 4
      doc.setFontSize(8)
      doc.text('Firma y aclaración', margin, y)

      doc.save(`factura-${invoiceNumber}.pdf`)
      toast.success('Factura generada correctamente')
    } catch (err) {
      toast.error('Error al generar la factura')
      console.error(err)
    } finally {
      setGeneratingPdf(false)
    }
  }, [selectedPedidos, config, clienteNombre, clienteCuit, clienteDireccion, fechaDesde, fechaHasta])

  // ──────────────────────────────────────────────
  // Loading state
  // ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Facturación
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
          Configuración de la empresa y generación de facturas
        </p>
      </div>

      {/* ──────────────────────────────────────────────
          5a. Datos de la empresa
          ────────────────────────────────────────────── */}
      <Card title="Datos de la empresa">
        {configLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nombre de la empresa"
                value={config.nombre}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, nombre: e.target.value }))
                }
              />
              <Input
                label="CUIT"
                value={config.cuit}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, cuit: e.target.value }))
                }
              />
              <Input
                label="Dirección"
                value={config.direccion}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, direccion: e.target.value }))
                }
              />
              <Input
                label="Teléfono"
                value={config.telefono}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, telefono: e.target.value }))
                }
              />
              <Input
                label="Email"
                type="email"
                value={config.email}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>

            {/* Logo upload */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-zinc-300">
                Logo
              </label>
              <div className="flex items-center gap-4">
                {config.logo_url && (
                  <img
                    src={config.logo_url}
                    alt="Logo"
                    className="h-14 w-14 rounded border border-gray-200 object-contain dark:border-zinc-700"
                  />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-white file:cursor-pointer dark:text-zinc-400"
                />
                {uploadingLogo && (
                  <span className="text-sm text-gray-500">Subiendo...</span>
                )}
              </div>
            </div>

            {/* Datos de transferencia bancaria */}
            <div className="border-t border-gray-200 pt-4 dark:border-zinc-700">
              <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-zinc-200">
                Datos de transferencia bancaria
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Banco"
                  value={config.banco}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, banco: e.target.value }))
                  }
                  placeholder="Ej: Banco Nación"
                />
                <Input
                  label="CBU"
                  value={config.cbu}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, cbu: e.target.value }))
                  }
                  placeholder="Número de CBU"
                />
                <Input
                  label="Alias"
                  value={config.alias}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, alias: e.target.value }))
                  }
                  placeholder="Ej: moto.express.pago"
                />
                <Input
                  label="Titular"
                  value={config.titular}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, titular: e.target.value }))
                  }
                  placeholder="Nombre del titular"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveConfig} disabled={configSaving}>
                {configSaving ? 'Guardando...' : 'Guardar configuración'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ──────────────────────────────────────────────
          5b. Generar factura
          ────────────────────────────────────────────── */}
      <Card title="Generar factura">
        <div className="space-y-4">
          {/* Cliente fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Nombre del cliente"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              placeholder="Nombre y apellido / Razón social"
            />
            <Input
              label="CUIT del cliente"
              value={clienteCuit}
              onChange={(e) => setClienteCuit(e.target.value)}
              placeholder="XX-XXXXXXXX-X"
            />
            <Input
              label="Dirección del cliente"
              value={clienteDireccion}
              onChange={(e) => setClienteDireccion(e.target.value)}
              placeholder="Dirección de facturación"
            />
          </div>

          {/* Periodo */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-44">
              <Input
                label="Fecha desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>
            <div className="w-44">
              <Input
                label="Fecha hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
            <Button
              onClick={handleLoadPedidos}
              disabled={fetchingPedidos || !fechaDesde || !fechaHasta}
            >
              {fetchingPedidos ? 'Cargando...' : 'Cargar pedidos'}
            </Button>
          </div>

          {/* Pedidos selector */}
          {pedidos.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Seleccionar pedidos ({pedidos.length} disponibles)
                </p>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {selectedIds.size === pedidos.length
                    ? 'Deseleccionar todos'
                    : 'Seleccionar todos'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-zinc-700">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-700">
                  <thead className="bg-gray-50 dark:bg-zinc-800">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-zinc-400">
                        Código
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-zinc-400">
                        Fecha
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-zinc-400">
                        Dirección
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-zinc-400">
                        Importe
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-zinc-400">
                        Espera
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-zinc-400">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-zinc-700">
                    {pedidos.map((p) => {
                      const totalPedido =
                        (p.importe ?? 0) + (p.cobro_espera ?? 0)
                      return (
                        <tr
                          key={p.id}
                          className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 ${
                            selectedIds.has(p.id)
                              ? 'bg-primary/5'
                              : ''
                          }`}
                          onClick={() => togglePedido(p.id)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => togglePedido(p.id)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                            #{p.codigo}
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-zinc-300">
                            {new Date(p.created_at).toLocaleDateString(
                              'es-AR',
                            )}
                          </td>
                          <td className="max-w-48 truncate px-3 py-2 text-gray-700 dark:text-zinc-300">
                            {p.descripcion}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-zinc-300">
                            ${(p.importe ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-zinc-300">
                            ${(p.cobro_espera ?? 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white">
                            ${totalPedido.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Selected summary */}
              {selectedIds.size > 0 && (
                <div className="mt-2 text-sm text-gray-600 dark:text-zinc-400">
                  {selectedIds.size} pedido(s) seleccionado(s) — Subtotal:{' '}
                  <span className="font-semibold text-gray-900 dark:text-white">
                    $
                    {selectedPedidos
                      .reduce(
                        (sum, p) =>
                          sum + (p.importe ?? 0) + (p.cobro_espera ?? 0),
                        0,
                      )
                      .toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Preview / Generate buttons */}
          {pedidos.length > 0 && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={selectedIds.size === 0}
              >
                Vista previa
              </Button>
              <Button
                onClick={generatePDF}
                disabled={generatingPdf || selectedIds.size === 0}
              >
                {generatingPdf
                  ? 'Generando...'
                  : 'Descargar factura (PDF)'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* ──────────────────────────────────────────────
          Preview section
          ────────────────────────────────────────────── */}
      {previewData && (
        <Card title="Vista previa de la factura">
          <div className="space-y-3 rounded border border-gray-200 bg-white p-6 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            {/* Preview header */}
            <div className="flex items-start justify-between">
              <div>
                {previewData.config.logo_url && (
                  <img
                    src={previewData.config.logo_url}
                    alt="Logo"
                    className="mb-2 h-10 object-contain"
                  />
                )}
                <p className="font-bold text-gray-900 dark:text-white">
                  {previewData.config.nombre || 'Moto Express'}
                </p>
                {previewData.config.cuit && (
                  <p className="text-gray-600 dark:text-zinc-400">
                    CUIT: {previewData.config.cuit}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p
                  className="text-2xl font-bold"
                  style={{ color: '#dc2626' }}
                >
                  FACTURA
                </p>
                <p className="text-gray-600 dark:text-zinc-400">
                  {new Date().toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>

            <hr className="border-red-600" />

            {/* Preview cliente */}
            <div className="rounded border border-gray-300 p-2 dark:border-zinc-600">
              <p className="mb-1 rounded bg-red-600 px-1 text-xs font-bold text-white">
                DATOS DEL CLIENTE
              </p>
              <p>Cliente: {previewData.clienteNombre}</p>
              <p>CUIT: {previewData.clienteCuit}</p>
              <p>Dirección: {previewData.clienteDireccion}</p>
            </div>

            {/* Preview table */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-red-600 text-white">
                  <th className="border border-gray-400 px-2 py-1 text-left">
                    Código
                  </th>
                  <th className="border border-gray-400 px-2 py-1 text-left">
                    Fecha
                  </th>
                  <th className="border border-gray-400 px-2 py-1 text-left">
                    Descripción
                  </th>
                  <th className="border border-gray-400 px-2 py-1 text-right">
                    Importe
                  </th>
                  <th className="border border-gray-400 px-2 py-1 text-right">
                    Espera
                  </th>
                  <th className="border border-gray-400 px-2 py-1 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {previewData.pedidos.map((p) => (
                  <tr key={p.id} className="border border-gray-300 dark:border-zinc-600">
                    <td className="px-2 py-1">#{p.codigo}</td>
                    <td className="px-2 py-1">
                      {new Date(p.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-2 py-1">{p.descripcion}</td>
                    <td className="px-2 py-1 text-right">
                      ${(p.importe ?? 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      ${(p.cobro_espera ?? 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right font-medium">
                      ${((p.importe ?? 0) + (p.cobro_espera ?? 0)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(() => {
                  const sub = previewData.pedidos.reduce(
                    (s, p) => s + (p.importe ?? 0) + (p.cobro_espera ?? 0),
                    0,
                  )
                  const iva = sub * 0.21
                  const tot = sub + iva
                  return (
                    <>
                      <tr className="font-semibold">
                        <td colSpan={4} />
                        <td className="px-2 py-1 text-right">Subtotal</td>
                        <td className="px-2 py-1 text-right">
                          ${sub.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="font-semibold">
                        <td colSpan={4} />
                        <td className="px-2 py-1 text-right">IVA (21%)</td>
                        <td className="px-2 py-1 text-right">
                          ${iva.toFixed(2)}
                        </td>
                      </tr>
                      <tr className="font-bold" style={{ color: '#dc2626' }}>
                        <td colSpan={4} />
                        <td className="px-2 py-1 text-right">TOTAL</td>
                        <td className="px-2 py-1 text-right">
                          ${tot.toFixed(2)}
                        </td>
                      </tr>
                    </>
                  )
                })()}
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
