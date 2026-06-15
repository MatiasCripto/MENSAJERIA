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

type Periodo = 'hoy' | 'semana' | 'mes' | 'personalizado'

type CadeteOption = { id: string; nombre: string }

type CadeteResumen = {
  cadete_id: string
  cadete_nombre: string
  cantidad: number
  total_importe: number
  efectivo: number
  mercadopago: number
  transferencia: number
}

function getPeriodRange(periodo: Periodo): { desde: string; hasta: string } {
  const now = new Date()
  const hasta = now.toISOString()

  const start = new Date(now)
  if (periodo === 'hoy') {
    start.setHours(0, 0, 0, 0)
  } else if (periodo === 'semana') {
    const day = start.getDay()
    const diff = day === 0 ? 6 : day - 1 // Monday start
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

const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  mercadopago: 'MercadoPago',
  transferencia: 'Transferencia',
}

export default function ReportesPage() {
  const { isOperador, loading } = useSession()
  const router = useRouter()
  const supabase = createClient()

  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [cadeteFiltro, setCadeteFiltro] = useState('') // empty = todos
  const [cadetes, setCadetes] = useState<CadeteOption[]>([])
  const [resumen, setResumen] = useState<CadeteResumen[]>([])
  const [fetching, setFetching] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!loading && !isOperador) {
      router.replace('/login')
    }
  }, [loading, isOperador, router])

  // Load cadetes for filter
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
    fetchedRef.current = true

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

    const { data, error } = await supabase
      .from('pedidos')
      .select('cadete_id, importe, forma_pago, updated_at')
      .eq('estado', 'entregado')
      .gte('updated_at', desde)
      .lte('updated_at', hasta)

    if (error) {
      toast.error('Error al cargar los datos')
      setFetching(false)
      return
    }

    // Build resumen by cadete
    const map = new Map<string, CadeteResumen>()
    const rows = data ?? []

    for (const row of rows) {
      if (!row.cadete_id) continue
      if (cadeteFiltro && row.cadete_id !== cadeteFiltro) continue

      let entry = map.get(row.cadete_id)
      if (!entry) {
        entry = {
          cadete_id: row.cadete_id,
          cadete_nombre: row.cadete_id,
          cantidad: 0,
          total_importe: 0,
          efectivo: 0,
          mercadopago: 0,
          transferencia: 0,
        }
        map.set(row.cadete_id, entry)
      }

      entry.cantidad++
      if (row.importe) entry.total_importe += Number(row.importe)

      if (row.forma_pago === 'efectivo') entry.efectivo += Number(row.importe ?? 0)
      else if (row.forma_pago === 'mercadopago') entry.mercadopago += Number(row.importe ?? 0)
      else if (row.forma_pago === 'transferencia') entry.transferencia += Number(row.importe ?? 0)
    }

    // Resolve cadete names
    const ids = Array.from(map.keys())
    if (ids.length > 0) {
      const { data: names } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', ids)

      if (names) {
        const nameMap = new Map(names.map((n) => [n.id, n.nombre]))
        for (const entry of map.values()) {
          entry.cadete_nombre = nameMap.get(entry.cadete_id) ?? 'Desconocido'
        }
      }
    }

    setResumen(Array.from(map.values()).sort((a, b) => a.cadete_nombre.localeCompare(b.cadete_nombre)))
    setFetching(false)
  }, [periodo, fechaDesde, fechaHasta, cadeteFiltro, supabase])

  // Auto-fetch on mount
  useEffect(() => {
    if (isOperador && !fetchedRef.current) {
      fetchData()
    }
  }, [isOperador, fetchData])

  // Totals
  const totales = resumen.reduce(
    (acc, r) => ({
      cantidad: acc.cantidad + r.cantidad,
      total_importe: acc.total_importe + r.total_importe,
      efectivo: acc.efectivo + r.efectivo,
      mercadopago: acc.mercadopago + r.mercadopago,
      transferencia: acc.transferencia + r.transferencia,
    }),
    { cantidad: 0, total_importe: 0, efectivo: 0, mercadopago: 0, transferencia: 0 },
  )

  const getPeriodLabel = () => {
    if (periodo === 'personalizado') {
      return `${fechaDesde || '?'} — ${fechaHasta || '?'}`
    }
    return PERIODO_OPTIONS.find((o) => o.value === periodo)?.label ?? ''
  }

  const generatePDF = () => {
    setGeneratingPdf(true)
    try {
      const doc = new jsPDF()
      const periodLabel = getPeriodLabel()

      doc.setFontSize(16)
      doc.text('Reporte de facturación', 14, 20)
      doc.setFontSize(10)
      doc.text(`Período: ${periodLabel}`, 14, 28)
      doc.text(`Generado: ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 14, 34)

      const tableData = resumen.map((r) => [
        r.cadete_nombre,
        String(r.cantidad),
        `$${r.total_importe.toFixed(2)}`,
        `$${r.efectivo.toFixed(2)}`,
        `$${r.mercadopago.toFixed(2)}`,
        `$${r.transferencia.toFixed(2)}`,
      ])

      autoTable(doc, {
        startY: 40,
        head: [['Cadete', 'Pedidos', 'Total', 'Efectivo', 'MercadoPago', 'Transferencia']],
        body: tableData,
        foot: [[
          'TOTALES',
          String(totales.cantidad),
          `$${totales.total_importe.toFixed(2)}`,
          `$${totales.efectivo.toFixed(2)}`,
          `$${totales.mercadopago.toFixed(2)}`,
          `$${totales.transferencia.toFixed(2)}`,
        ]],
        footStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 73, 94], textColor: 255 },
      })

      doc.save(`reporte-facturacion-${periodo}-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF descargado')
    } catch (err) {
      toast.error('Error al generar el PDF')
      console.error(err)
    } finally {
      setGeneratingPdf(false)
    }
  }

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
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
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

      {/* Results */}
      {resumen.length === 0 ? (
        <Card>
          <p className="py-12 text-center text-sm text-gray-400">
            No hay pedidos entregados en el período seleccionado.
          </p>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Cadete</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Pedidos</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total ($)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Efectivo</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">MercadoPago</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Transferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {resumen.map((r) => (
                  <tr key={r.cadete_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.cadete_nombre}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.cantidad}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ${r.total_importe.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      ${r.efectivo.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      ${r.mercadopago.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      ${r.transferencia.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-50 dark:bg-zinc-800">
                <tr className="font-semibold text-zinc-900 dark:text-zinc-100">
                  <td className="px-4 py-3">TOTALES</td>
                  <td className="px-4 py-3 text-right">{totales.cantidad}</td>
                  <td className="px-4 py-3 text-right">${totales.total_importe.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${totales.efectivo.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${totales.mercadopago.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">${totales.transferencia.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-end">
            <Button onClick={generatePDF} disabled={generatingPdf || resumen.length === 0}>
              {generatingPdf ? 'Generando...' : 'Exportar PDF'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
