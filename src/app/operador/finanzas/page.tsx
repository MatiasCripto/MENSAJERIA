'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type Periodo = 'hoy' | 'semana' | 'mes' | 'personalizado'

type Resumen = {
  total_facturado: number
  cobrado_efectivo: number
  cobrado_mercadopago: number
  cobrado_transferencia: number
  cuenta_corriente: number
  total_esperas: number
  ganancia_empresa: number
  ganancia_cadetes: number
}

type CadeteResumenFinanzas = {
  cadete_id: string
  cadete_nombre: string
  viajes: number
  total_viajes: number
  total_esperas: number
  total_general: number
  pct_sesenta: number
  pct_empresa: number
}

type ClienteCCResumen = {
  cliente_id: string
  cliente_nombre: string
  total_cargado: number
  total_pagado: number
  saldo: number
}

type CobroRow = {
  fecha: string
  pedido_codigo: number
  cliente: string
  cadete: string
  monto: number
  tipo: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getPeriodRange(periodo: Periodo): { desde: string; hasta: string } {
  const now = new Date()
  const hasta = now.toISOString()

  const start = new Date(now)
  if (periodo === 'hoy') {
    start.setHours(0, 0, 0, 0)
  } else if (periodo === 'semana') {
    const day = start.getDay()
    const diff = day === 0 ? 6 : day - 1
    start.setDate(start.getDate() - diff)
    start.setHours(0, 0, 0, 0)
  } else if (periodo === 'mes') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }

  return { desde: start.toISOString(), hasta }
}

const PERIODO_OPTIONS = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'personalizado', label: 'Rango personalizado' },
]

function fmt(n: number): string {
  return `$${n.toFixed(2)}`
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function FinanzasPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [cadeteFiltro, setCadeteFiltro] = useState('')
  const [cadetes, setCadetes] = useState<{ id: string; nombre: string }[]>([])

  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingExcel, setGeneratingExcel] = useState(false)

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [porCadete, setPorCadete] = useState<CadeteResumenFinanzas[]>([])
  const [porCliente, setPorCliente] = useState<ClienteCCResumen[]>([])
  const [cobros, setCobros] = useState<CobroRow[]>([])

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
    }
  }, [loading, isOperador, router])

  useEffect(() => {
    if (!isOperador) return
    supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('rol', 'cadete')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (data) setCadetes(data)
      })
  }, [isOperador, supabase])

  const fetchData = useCallback(async () => {
    setFetching(true)
    setFetched(false)

    let desde: string
    let hasta: string

    if (periodo === 'personalizado') {
      if (!fechaDesde || !fechaHasta) {
        toast.error('Seleccioná las fechas de inicio y fin')
        setFetching(false)
        return
      }
      desde = new Date(fechaDesde + 'T00:00:00').toISOString()
      hasta = new Date(fechaHasta + 'T23:59:59').toISOString()
    } else {
      const range = getPeriodRange(periodo)
      desde = range.desde
      hasta = range.hasta
    }

    try {
      // ── 1. Pedidos entregados/esperando_pago ──
      const { data: pedidos, error: errPedidos } = await supabase
        .from('pedidos')
        .select('*, cadetes:usuarios!cadete_id(nombre)')
        .in('estado', ['entregado', 'esperando_pago'])
        .gte('updated_at', desde)
        .lte('updated_at', hasta)

      if (errPedidos) throw errPedidos

      // ── 2. Esperas ──
      const { data: esperas, error: errEsperas } = await supabase
        .from('esperas')
        .select('*, cadetes:usuarios!cadete_id(nombre)')
        .gte('created_at', desde)
        .lte('created_at', hasta)

      if (errEsperas) throw errEsperas

      // ── 3. Cuenta corriente movimientos ──
      const { data: movimientosCC, error: errCC } = await supabase
        .from('cuenta_corriente')
        .select('*, clientes:clientes!cliente_id(nombre)')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })

      if (errCC) throw errCC

      // ── 4. Pedidos with cobro ──
      const { data: cobrosData, error: errCobros } = await supabase
        .from('pedidos')
        .select('*, cadetes:usuarios!cadete_id(nombre)')
        .not('cobro_monto', 'is', null)
        .in('estado', ['entregado', 'esperando_pago'])
        .gte('updated_at', desde)
        .lte('updated_at', hasta)

      if (errCobros) throw errCobros

      const rows = pedidos ?? []
      const cadeteNameMap = new Map<string, string>()
      for (const row of rows) {
        if (row.cadete_id) {
          cadeteNameMap.set(row.cadete_id, (row.cadetes as { nombre: string } | null)?.nombre ?? 'Desconocido')
        }
      }

      // ── Compute summary ──
      let totalFacturado = 0
      let cobradoEfectivo = 0
      let cobradoMP = 0
      let cobradoTransferencia = 0
      let cuentaCorriente = 0

      for (const p of rows) {
        if (cadeteFiltro && p.cadete_id !== cadeteFiltro) continue
        const imp = p.importe ? Number(p.importe) : 0
        totalFacturado += imp

        if (p.forma_pago === 'mercadopago') {
          cobradoMP += imp
        } else if (p.forma_pago === 'cuenta_corriente') {
          cuentaCorriente += imp
        }
      }

      // Cobros en efectivo/transferencia from cobrosData
      for (const c of cobrosData ?? []) {
        if (cadeteFiltro && c.cadete_id !== cadeteFiltro) continue
        if (c.cobro_tipo === 'efectivo') {
          cobradoEfectivo += Number(c.cobro_monto ?? 0)
        } else if (c.cobro_tipo === 'transferencia' && c.cobro_confirmado) {
          cobradoTransferencia += Number(c.cobro_monto ?? 0)
        }
      }

      const totalEsperas = (esperas ?? []).reduce((sum, e) => sum + Number(e.importe_espera ?? 0), 0)

      // ── Per-cadete breakdown ──
      const cadMap = new Map<string, CadeteResumenFinanzas>()
      for (const p of rows) {
        if (!p.cadete_id) continue
        if (cadeteFiltro && p.cadete_id !== cadeteFiltro) continue
        let entry = cadMap.get(p.cadete_id)
        if (!entry) {
          entry = {
            cadete_id: p.cadete_id,
            cadete_nombre: cadeteNameMap.get(p.cadete_id) ?? 'Desconocido',
            viajes: 0,
            total_viajes: 0,
            total_esperas: 0,
            total_general: 0,
            pct_sesenta: 0,
            pct_empresa: 0,
          }
          cadMap.set(p.cadete_id, entry)
        }
        entry.viajes++
        entry.total_viajes += Number(p.importe ?? 0)
      }

      // Add esperas to cadete breakdown
      for (const e of esperas ?? []) {
        if (!e.cadete_id) continue
        if (cadeteFiltro && e.cadete_id !== cadeteFiltro) continue
        let entry = cadMap.get(e.cadete_id)
        if (!entry) {
          const name = (e.cadetes as { nombre: string } | null)?.nombre ?? 'Desconocido'
          entry = {
            cadete_id: e.cadete_id,
            cadete_nombre: name,
            viajes: 0,
            total_viajes: 0,
            total_esperas: 0,
            total_general: 0,
            pct_sesenta: 0,
            pct_empresa: 0,
          }
          cadMap.set(e.cadete_id, entry)
        }
        entry.total_esperas += Number(e.importe_espera ?? 0)
      }

      for (const entry of cadMap.values()) {
        entry.total_general = entry.total_viajes + entry.total_esperas
        entry.pct_sesenta = entry.total_viajes * 0.7 + entry.total_esperas
        entry.pct_empresa = entry.total_viajes * 0.3
      }

      // ── Per-client CC breakdown ──
      const clientMap = new Map<string, ClienteCCResumen>()
      for (const m of movimientosCC ?? []) {
        if (!m.cliente_id) continue
        let entry = clientMap.get(m.cliente_id)
        if (!entry) {
          entry = {
            cliente_id: m.cliente_id,
            cliente_nombre: (m.clientes as { nombre: string } | null)?.nombre ?? 'Desconocido',
            total_cargado: 0,
            total_pagado: 0,
            saldo: 0,
          }
          clientMap.set(m.cliente_id, entry)
        }
        if (m.tipo === 'cargo') {
          entry.total_cargado += Number(m.monto ?? 0)
        } else {
          entry.total_pagado += Number(m.monto ?? 0)
        }
      }
      for (const entry of clientMap.values()) {
        entry.saldo = entry.total_cargado - entry.total_pagado
      }

      // ── Cobros rows ──
      const cobrosRows: CobroRow[] = (cobrosData ?? [])
        .filter((c) => !cadeteFiltro || c.cadete_id === cadeteFiltro)
        .map((c) => ({
          fecha: new Date(c.updated_at).toLocaleDateString('es-AR'),
          pedido_codigo: c.codigo,
          cliente: c.cliente_empresa ?? '-',
          cadete: (c.cadetes as { nombre: string } | null)?.nombre ?? '-',
          monto: Number(c.cobro_monto ?? 0),
          tipo: c.cobro_tipo === 'efectivo' ? 'Efectivo' : 'Transferencia',
        }))

      setResumen({
        total_facturado: totalFacturado,
        cobrado_efectivo: cobradoEfectivo,
        cobrado_mercadopago: cobradoMP,
        cobrado_transferencia: cobradoTransferencia,
        cuenta_corriente: cuentaCorriente,
        total_esperas: totalEsperas,
        ganancia_empresa: totalFacturado * 0.3,
        ganancia_cadetes: totalFacturado * 0.7,
      })

      setPorCadete(Array.from(cadMap.values()).sort((a, b) => a.cadete_nombre.localeCompare(b.cadete_nombre)))
      setPorCliente(Array.from(clientMap.values()).sort((a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre)))
      setCobros(cobrosRows)
      setFetched(true)
    } catch (err) {
      toast.error('Error al cargar los datos')
      console.error(err)
    } finally {
      setFetching(false)
    }
  }, [periodo, fechaDesde, fechaHasta, cadeteFiltro, supabase])

  // Auto-fetch on mount
  useEffect(() => {
    if (isOperador && !fetched) {
      fetchData()
    }
  }, [isOperador, fetchData, fetched])

  const getPeriodLabel = () => {
    if (periodo === 'personalizado') return `${fechaDesde || '?'} — ${fechaHasta || '?'}`
    return PERIODO_OPTIONS.find((o) => o.value === periodo)?.label ?? ''
  }

  // ── PDF Export ──
  const generatePDF = () => {
    if (!resumen) return
    setGeneratingPdf(true)
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 14
      const periodLabel = getPeriodLabel()

      // Title
      doc.setFontSize(18)
      doc.setFont('Helvetica', 'bold')
      doc.setTextColor(220, 38, 38)
      doc.text('Moto Express — Finanzas', pageWidth / 2, margin, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.setFont('Helvetica', 'normal')
      doc.text(`Período: ${periodLabel}`, margin, margin + 10)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, margin + 16)

      // Separator
      doc.setDrawColor(220, 38, 38)
      doc.setLineWidth(0.8)
      doc.line(margin, margin + 20, pageWidth - margin, margin + 20)

      let y = margin + 28

      // Section 1: Summary cards as a table
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(220, 38, 38)
      doc.text('Resumen general', margin, y)
      y += 6

      const summaryRows = [
        ['Total facturado', fmt(resumen.total_facturado)],
        ['Cobrado en efectivo', fmt(resumen.cobrado_efectivo)],
        ['Cobrado por MercadoPago', fmt(resumen.cobrado_mercadopago)],
        ['Cobrado por transferencia', fmt(resumen.cobrado_transferencia)],
        ['En cuenta corriente', fmt(resumen.cuenta_corriente)],
        ['Total esperas cobradas', fmt(resumen.total_esperas)],
        ['Ganancia empresa (30%)', fmt(resumen.ganancia_empresa)],
        ['Ganancia cadetes (70%)', fmt(resumen.ganancia_cadetes)],
      ]

      autoTable(doc, {
        startY: y,
        head: [['Concepto', 'Monto']],
        body: summaryRows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        footStyles: { fillColor: [255, 255, 255], textColor: [220, 38, 38], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 50, halign: 'right' } },
      })

      // @ts-expect-error autoTable adds finalY
      y = doc.lastAutoTable.finalY + 12

      // Section 2: Per-cadete
      if (porCadete.length > 0) {
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(220, 38, 38)
        doc.text('Desglose por cadete', margin, y)
        y += 6

        const cadBody = porCadete.map((c) => [
          c.cadete_nombre,
          String(c.viajes),
          fmt(c.total_viajes),
          fmt(c.total_esperas),
          fmt(c.total_general),
          fmt(c.pct_sesenta),
          fmt(c.pct_empresa),
        ])

        autoTable(doc, {
          startY: y,
          head: [['Cadete', 'Viajes', 'Viajes ($)', 'Esperas ($)', 'Total ($)', '70% Cadete', '30% Empresa']],
          body: cadBody,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        })

        // @ts-expect-error autoTable adds finalY
        y = doc.lastAutoTable.finalY + 12
      }

      // Section 3: CC per client
      if (porCliente.length > 0) {
        if (y + 30 > doc.internal.pageSize.getHeight()) {
          doc.addPage()
          y = margin
        }

        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(220, 38, 38)
        doc.text('Cuenta corriente por cliente', margin, y)
        y += 6

        const ccBody = porCliente.map((c) => [
          c.cliente_nombre,
          fmt(c.total_cargado),
          fmt(c.total_pagado),
          fmt(c.saldo),
        ])

        autoTable(doc, {
          startY: y,
          head: [['Cliente', 'Cargado', 'Pagado', 'Saldo']],
          body: ccBody,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
          didParseCell(data) {
            if (data.section === 'body' && data.column.index === 3) {
              const raw = data.row.raw as string[]
              if (raw?.[3]?.startsWith('-')) {
                data.cell.styles.textColor = [220, 38, 38]
              }
            }
          },
        })

        // @ts-expect-error autoTable adds finalY
        y = doc.lastAutoTable.finalY + 12
      }

      // Section 4: Cobros
      if (cobros.length > 0) {
        if (y + 30 > doc.internal.pageSize.getHeight()) {
          doc.addPage()
          y = margin
        }

        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(220, 38, 38)
        doc.text('Cobros recibidos en entrega', margin, y)
        y += 6

        const cobBody = cobros.map((c) => [
          c.fecha,
          `#${c.pedido_codigo}`,
          c.cliente,
          c.cadete,
          fmt(c.monto),
          c.tipo,
        ])

        autoTable(doc, {
          startY: y,
          head: [['Fecha', 'Pedido', 'Cliente', 'Cadete', 'Monto', 'Tipo']],
          body: cobBody,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        })
      }

      doc.save(`finanzas-${periodo}-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF descargado')
    } catch (err) {
      toast.error('Error al generar el PDF')
      console.error(err)
    } finally {
      setGeneratingPdf(false)
    }
  }

  // ── Excel Export ──
  const generateExcel = () => {
    if (!resumen) return
    setGeneratingExcel(true)
    try {
      const wb = XLSX.utils.book_new()

      // Sheet 1: Resumen general
      const summaryData = [
        { Concepto: 'Total facturado', Monto: resumen.total_facturado },
        { Concepto: 'Cobrado en efectivo', Monto: resumen.cobrado_efectivo },
        { Concepto: 'Cobrado por MercadoPago', Monto: resumen.cobrado_mercadopago },
        { Concepto: 'Cobrado por transferencia', Monto: resumen.cobrado_transferencia },
        { Concepto: 'En cuenta corriente', Monto: resumen.cuenta_corriente },
        { Concepto: 'Total esperas cobradas', Monto: resumen.total_esperas },
        { Concepto: 'Ganancia empresa (30%)', Monto: resumen.ganancia_empresa },
        { Concepto: 'Ganancia cadetes (70%)', Monto: resumen.ganancia_cadetes },
      ]
      const ws1 = XLSX.utils.json_to_sheet(summaryData)
      XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

      // Sheet 2: Desglose por cadete
      const cadData = porCadete.map((c) => ({
        Cadete: c.cadete_nombre,
        Viajes: c.viajes,
        'Total viajes ($)': c.total_viajes,
        'Total esperas ($)': c.total_esperas,
        'Total general ($)': c.total_general,
        '70% Cadete ($)': c.pct_sesenta,
        '30% Empresa ($)': c.pct_empresa,
      }))
      const ws2 = XLSX.utils.json_to_sheet(cadData)
      XLSX.utils.book_append_sheet(wb, ws2, 'Desglose cadetes')

      // Sheet 3: Cuenta corriente
      const ccData = porCliente.map((c) => ({
        Cliente: c.cliente_nombre,
        'Total cargado ($)': c.total_cargado,
        'Total pagado ($)': c.total_pagado,
        'Saldo pendiente ($)': c.saldo,
      }))
      const ws3 = XLSX.utils.json_to_sheet(ccData)
      XLSX.utils.book_append_sheet(wb, ws3, 'Cuenta corriente')

      // Sheet 4: Cobros en entrega
      const cobData = cobros.map((c) => ({
        Fecha: c.fecha,
        Pedido: `#${c.pedido_codigo}`,
        Cliente: c.cliente,
        Cadete: c.cadete,
        Monto: c.monto,
        Tipo: c.tipo,
      }))
      const ws4 = XLSX.utils.json_to_sheet(cobData)
      XLSX.utils.book_append_sheet(wb, ws4, 'Cobros en entrega')

      XLSX.writeFile(wb, `finanzas-${periodo}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Excel descargado')
    } catch (err) {
      toast.error('Error al generar el Excel')
      console.error(err)
    } finally {
      setGeneratingExcel(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanzas</h1>
        <div className="flex gap-2">
          {fetched && resumen && (
            <>
              <Button variant="outline" onClick={generatePDF} disabled={generatingPdf}>
                {generatingPdf ? 'Generando...' : 'Exportar PDF'}
              </Button>
              <Button variant="outline" onClick={generateExcel} disabled={generatingExcel}>
                {generatingExcel ? 'Generando...' : 'Exportar Excel'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card title="Filtros">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <Select
              label="Período"
              options={PERIODO_OPTIONS}
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as Periodo)}
            />
          </div>

          {periodo === 'personalizado' && (
            <>
              <div className="w-44">
                <Input
                  label="Desde"
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                />
              </div>
              <div className="w-44">
                <Input
                  label="Hasta"
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="w-48">
            <Select
              label="Cadete"
              options={[
                { value: '', label: 'Todos' },
                ...cadetes.map((c) => ({ value: c.id, label: c.nombre })),
              ]}
              value={cadeteFiltro}
              onChange={(e) => setCadeteFiltro(e.target.value)}
            />
          </div>

          <Button onClick={fetchData} disabled={fetching}>
            {fetching ? 'Cargando...' : 'Buscar'}
          </Button>
        </div>
      </Card>

      {/* ── Section 1: Summary Cards ── */}
      {resumen && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard title="Total facturado" value={fmt(resumen.total_facturado)} color="text-gray-900 dark:text-white" />
            <SummaryCard title="Cobrado efectivo" value={fmt(resumen.cobrado_efectivo)} color="text-green-600 dark:text-green-400" />
            <SummaryCard title="Cobrado MercadoPago" value={fmt(resumen.cobrado_mercadopago)} color="text-blue-600 dark:text-blue-400" />
            <SummaryCard title="Cobrado transferencia" value={fmt(resumen.cobrado_transferencia)} color="text-purple-600 dark:text-purple-400" />
            <SummaryCard title="Cuenta corriente" value={fmt(resumen.cuenta_corriente)} color="text-amber-600 dark:text-amber-400" />
            <SummaryCard title="Total esperas" value={fmt(resumen.total_esperas)} color="text-orange-600 dark:text-orange-400" />
            <SummaryCard title="Ganancia empresa (30%)" value={fmt(resumen.ganancia_empresa)} color="text-red-600 dark:text-red-400" />
            <SummaryCard title="Ganancia cadetes (70%)" value={fmt(resumen.ganancia_cadetes)} color="text-emerald-600 dark:text-emerald-400" />
          </div>

          {/* ── Section 2: Per-cadete ── */}
          <Card title="Desglose por cadete">
            {porCadete.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin datos en el período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-gray-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Cadete</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Viajes</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Viajes ($)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Esperas ($)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Total ($)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">70% Cadete</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">30% Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                    {porCadete.map((c) => (
                      <tr key={c.cadete_id}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">{c.cadete_nombre}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{c.viajes}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{fmt(c.total_viajes)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{fmt(c.total_esperas)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(c.total_general)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{fmt(c.pct_sesenta)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">{fmt(c.pct_empresa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Section 3: CC per client ── */}
          <Card title="Cuenta corriente por cliente">
            {porCliente.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin movimientos en el período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-gray-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Cliente</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Cargado ($)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Pagado ($)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Saldo ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                    {porCliente.map((c) => (
                      <tr key={c.cliente_id}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900 dark:text-white">{c.cliente_nombre}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{fmt(c.total_cargado)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-gray-700 dark:text-zinc-300">{fmt(c.total_pagado)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-medium ${c.saldo > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                          {fmt(c.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Section 4: Cobros ── */}
          <Card title="Cobros recibidos en entrega">
            {cobros.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin cobros en el período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-zinc-800">
                  <thead className="bg-gray-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Fecha</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Pedido</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Cliente</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-zinc-400">Cadete</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-zinc-400">Monto</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 dark:text-zinc-400">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                    {cobros.map((c, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-zinc-300">{c.fecha}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-gray-900 dark:text-white">#{c.pedido_codigo}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-zinc-300">{c.cliente}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-zinc-300">{c.cadete}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(c.monto)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            c.tipo === 'Efectivo'
                              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400'
                          }`}>
                            {c.tipo}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* No data state */}
      {fetching && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!fetching && !resumen && (
        <Card>
          <p className="py-12 text-center text-sm text-gray-400">
            No hay datos en el período seleccionado.
          </p>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-[#1a1a1a]">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
        {title}
      </p>
      <p className={`mt-1.5 text-xl font-bold ${color}`}>
        {value}
      </p>
    </div>
  )
}
