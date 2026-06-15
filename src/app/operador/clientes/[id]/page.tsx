'use client'

import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/useSession'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generateStaticParams() {
  return [{ id: '1' }]
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type Cliente = {
  id: string
  nombre: string
  empresa: string | null
  telefono: string | null
  direccion_habitual: string | null
  modalidad_pago: string | null
  saldo_deuda: number | null
  cuit: string | null
}

type Movimiento = {
  id: string
  cliente_id: string
  tipo: 'cargo' | 'pago'
  monto: number
  descripcion: string | null
  fecha: string
  created_at: string
}

type Contacto = {
  id: string
  cliente_id: string
  nombre: string
  cargo: string | null
  telefono: string | null
  created_at: string
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function ClienteCuentaCorrientePage() {
  const { isOperador, loading: sessionLoading } = useSession()
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  const id = params.id as string

  // ── State ──
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoDescripcion, setPagoDescripcion] = useState('')
  const [submittingPago, setSubmittingPago] = useState(false)

  // PDF loading
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Contactos
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [showContactoModal, setShowContactoModal] = useState(false)
  const [contactoForm, setContactoForm] = useState({ nombre: '', cargo: '', telefono: '' })
  const [submittingContacto, setSubmittingContacto] = useState(false)

  // ── Auth guard ──
  useEffect(() => {
    if (!sessionLoading && !isOperador) {
      router.replace('/login')
    }
  }, [sessionLoading, isOperador, router])

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    if (!id) return

    try {
      setFetching(true)
      setError(null)

      const [clienteRes, movimientosRes, contactosRes] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase
          .from('cuenta_corriente')
          .select('*')
          .eq('cliente_id', id)
          .order('fecha', { ascending: false }),
        supabase
          .from('clientes_contactos')
          .select('*')
          .eq('cliente_id', id)
          .order('nombre', { ascending: true }),
      ])

      if (clienteRes.error) throw new Error(clienteRes.error.message)
      if (movimientosRes.error) throw new Error(movimientosRes.error.message)
      if (contactosRes.error) throw new Error(contactosRes.error.message)

      setCliente(clienteRes.data)
      setMovimientos(movimientosRes.data ?? [])
      setContactos(contactosRes.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los datos')
    } finally {
      setFetching(false)
    }
  }, [id, supabase])

  useEffect(() => {
    if (!sessionLoading && isOperador && id) {
      fetchData()
    }
  }, [sessionLoading, isOperador, id, fetchData])

  // ── Registrar pago ──
  const handleRegistrarPago = async () => {
    if (!pagoMonto.trim()) {
      toast.error('El monto es obligatorio')
      return
    }

    const monto = Number.parseFloat(pagoMonto.trim())
    if (Number.isNaN(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido mayor a 0')
      return
    }

    if (!cliente) return

    setSubmittingPago(true)

    try {
      // Insert movimiento
      const { error: insertError } = await supabase
        .from('cuenta_corriente')
        .insert({
          cliente_id: id,
          tipo: 'pago',
          monto,
          descripcion: pagoDescripcion.trim() || 'Pago registrado',
          fecha: new Date().toISOString(),
        })

      if (insertError) throw new Error(insertError.message)

      // Update saldo_deuda
      const nuevoSaldo = Math.max(0, (cliente.saldo_deuda ?? 0) - monto)

      const { error: updateError } = await supabase
        .from('clientes')
        .update({ saldo_deuda: nuevoSaldo })
        .eq('id', id)

      if (updateError) throw new Error(updateError.message)

      toast.success('Pago registrado correctamente')
      setShowPaymentModal(false)
      setPagoMonto('')
      setPagoDescripcion('')
      fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el pago')
    } finally {
      setSubmittingPago(false)
    }
  }

  // ── Generar resumen PDF ──
  const generatePDF = useCallback(() => {
    if (!cliente) return

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

      // ── Title ──
      doc.setFontSize(18)
      doc.setFont('Helvetica', 'bold')
      doc.setTextColor(220, 38, 38)
      doc.text('Resumen de Cuenta Corriente', pageWidth / 2, y, {
        align: 'center',
      })
      doc.setTextColor(0, 0, 0)
      y += 10

      // Date
      doc.setFontSize(9)
      doc.setFont('Helvetica', 'normal')
      const todayStr = new Date().toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
      doc.text(`Fecha: ${todayStr}`, margin, y)
      y += 8

      // ── Header separator ──
      doc.setDrawColor(220, 38, 38)
      doc.setLineWidth(0.8)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6

      // ── Client data box ──
      const clientBoxH = 24
      drawBox(margin, y, contentWidth, clientBoxH)
      doc.setFillColor(220, 38, 38)
      doc.rect(margin, y, contentWidth, 7, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.setFont('Helvetica', 'bold')
      doc.text('DATOS DEL CLIENTE', margin + 2, y + 5)
      doc.setTextColor(0, 0, 0)
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Cliente: ${cliente.nombre}`, margin + 2, y + 13)
      if (cliente.empresa) {
        doc.text(`Empresa: ${cliente.empresa}`, margin + 2, y + 18)
      }
      if (cliente.cuit) {
        doc.text(`CUIT: ${cliente.cuit}`, margin + 2, y + 23)
      } else {
        doc.text(`Dirección: ${cliente.direccion_habitual ?? '-'}`, margin + 2, y + 23)
      }
      y += clientBoxH + 6

      // ── Movimientos table ──
      const tableBody = movimientos.map((m) => [
        new Date(m.fecha).toLocaleDateString('es-AR'),
        m.tipo === 'cargo' ? 'Cargo' : 'Pago',
        m.descripcion ?? '-',
        `$${Number(m.monto).toFixed(2)}`,
      ])

      const saldoPendiente = cliente.saldo_deuda ?? 0

      autoTable(doc, {
        startY: y,
        head: [['Fecha', 'Tipo', 'Descripción', 'Monto']],
        body: tableBody,
        foot: [
          ['', '', 'Saldo pendiente', `$${saldoPendiente.toFixed(2)}`],
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
          textColor: [220, 38, 38],
          fontStyle: 'bold',
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 20 },
          2: { cellWidth: 'auto' as unknown as number },
          3: { cellWidth: 30, halign: 'right' },
        },
        didParseCell(data) {
          // Color cargo rows in red, pago rows in green
          if (data.section === 'body') {
            const raw = data.row.raw as (string | number | null | undefined)[]
            const tipo = raw?.[1]
            if (tipo === 'Cargo') {
              data.cell.styles.textColor = [220, 38, 38]
            } else if (tipo === 'Pago') {
              data.cell.styles.textColor = [22, 163, 74]
            }
          }
        },
        tableLineColor: [0, 0, 0],
        tableLineWidth: 0.3,
      })

      // @ts-expect-error autoTable adds finalY
      y = doc.lastAutoTable.finalY + 10

      // ── Footer: saldo pendiente line ──
      doc.setDrawColor(220, 38, 38)
      doc.setLineWidth(0.8)
      doc.line(margin, y, pageWidth - margin, y)
      y += 6
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(220, 38, 38)
      doc.text(
        `Saldo pendiente: $${saldoPendiente.toFixed(2)}`,
        pageWidth - margin,
        y,
        { align: 'right' },
      )
      doc.setTextColor(0, 0, 0)

      doc.save(`resumen-cc-${cliente.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`)
      toast.success('Resumen PDF generado correctamente')
    } catch (err) {
      toast.error('Error al generar el resumen PDF')
      console.error(err)
    } finally {
      setGeneratingPdf(false)
    }
  }, [cliente, movimientos])

  // ── Contacto handlers ──
  const handleEliminarContacto = async (contactoId: string) => {
    if (!window.confirm('¿Eliminar este contacto?')) return
    const { error } = await supabase
      .from('clientes_contactos')
      .delete()
      .eq('id', contactoId)
    if (error) {
      toast.error('Error al eliminar el contacto')
      return
    }
    setContactos((prev) => prev.filter((c) => c.id !== contactoId))
    toast.success('Contacto eliminado')
  }

  const handleAgregarContacto = async () => {
    if (!contactoForm.nombre.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSubmittingContacto(true)
    const { data, error } = await supabase
      .from('clientes_contactos')
      .insert({
        cliente_id: id,
        nombre: contactoForm.nombre.trim(),
        cargo: contactoForm.cargo.trim() || null,
        telefono: contactoForm.telefono.trim() || null,
      })
      .select()
      .single()
    if (error || !data) {
      toast.error('Error al agregar el contacto')
      setSubmittingContacto(false)
      return
    }
    setContactos((prev) => [...prev, data])
    setShowContactoModal(false)
    setContactoForm({ nombre: '', cargo: '', telefono: '' })
    setSubmittingContacto(false)
    toast.success('Contacto agregado')
  }

  // ── Loading state (session) ──
  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ── Loading state (data) ──
  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchData}>
          Reintentar
        </Button>
      </div>
    )
  }

  // ── No cliente ──
  if (!cliente) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-gray-500 dark:text-zinc-400">Cliente no encontrado</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/operador/clientes')}
        >
          Volver a clientes
        </Button>
      </div>
    )
  }

  // ── Render ──
  const saldo = cliente.saldo_deuda ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={() => router.push('/operador/clientes')}
            className="mb-2 text-sm text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; Volver a clientes
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {cliente.nombre}
          </h1>
          {cliente.empresa && (
            <p className="mt-1 text-sm text-gray-500 dark:text-zinc-400">
              {cliente.empresa}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={generatePDF} disabled={generatingPdf}>
            {generatingPdf ? 'Generando...' : 'Generar resumen PDF'}
          </Button>
          <Button onClick={() => setShowPaymentModal(true)}>
            Registrar pago
          </Button>
        </div>
      </div>

      {/* Client info card */}
      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
              Teléfono
            </p>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">
              {cliente.telefono ?? '-'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
              Dirección
            </p>
            <p className="mt-1 text-sm text-gray-900 dark:text-white">
              {cliente.direccion_habitual ?? '-'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
              Modalidad de pago
            </p>
            <p className="mt-1 text-sm">
              {cliente.modalidad_pago === 'cuenta_corriente' ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                  Cuenta corriente
                </span>
              ) : (
                <span className="text-gray-900 dark:text-white">
                  {cliente.modalidad_pago ?? 'Contado'}
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
              Saldo actual
            </p>
            <p
              className={`mt-1 text-xl font-bold ${
                saldo > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              ${saldo.toFixed(2)}
            </p>
          </div>
        </div>
      </Card>

      {/* Contactos habituales */}
      <Card title="Contactos habituales">
        <div className="space-y-3">
          {contactos.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-zinc-400">
              No hay contactos registrados
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {contactos.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{c.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                      {[c.cargo, c.telefono].filter(Boolean).join(' · ') || ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEliminarContacto(c.id)}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowContactoModal(true)}>
            + Agregar contacto
          </Button>
        </div>
      </Card>

      {/* Movimientos table */}
      <Card title="Movimientos de cuenta corriente">
        {movimientos.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 dark:text-zinc-400">
              No hay movimientos registrados
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-zinc-800">
              <thead className="bg-gray-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-zinc-800 dark:bg-[#1a1a1a]">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {new Date(m.fecha).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {m.tipo === 'cargo' ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-400">
                          Cargo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-400">
                          Pago
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-zinc-300">
                      {m.descripcion ?? '-'}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-sm text-right font-medium ${
                        m.tipo === 'cargo'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {m.tipo === 'cargo' ? '-' : '+'}${Number(m.monto).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Registrar pago modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPaymentModal(false)
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Registrar pago
            </h2>

            <div className="space-y-4">
              <Input
                label="Monto *"
                type="number"
                step="0.01"
                min="0.01"
                value={pagoMonto}
                onChange={(e) => setPagoMonto(e.target.value)}
                placeholder="0.00"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                  Descripción
                </label>
                <textarea
                  value={pagoDescripcion}
                  onChange={(e) => setPagoDescripcion(e.target.value)}
                  placeholder="Descripción del pago..."
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 dark:border-zinc-700 dark:bg-[#1a1a1a] dark:text-white dark:placeholder:text-zinc-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentModal(false)
                  setPagoMonto('')
                  setPagoDescripcion('')
                }}
                disabled={submittingPago}
              >
                Cancelar
              </Button>
              <Button onClick={handleRegistrarPago} disabled={submittingPago}>
                {submittingPago ? 'Registrando...' : 'Confirmar pago'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Agregar contacto modal */}
      {showContactoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowContactoModal(false)
              setContactoForm({ nombre: '', cargo: '', telefono: '' })
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-[#1a1a1a]">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Agregar contacto
            </h2>
            <div className="space-y-4">
              <Input
                label="Nombre *"
                value={contactoForm.nombre}
                onChange={(e) => setContactoForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre del contacto"
              />
              <Input
                label="Cargo"
                value={contactoForm.cargo}
                onChange={(e) => setContactoForm((prev) => ({ ...prev, cargo: e.target.value }))}
                placeholder="Ej: Encargado, Recepcionista"
              />
              <Input
                label="Teléfono"
                value={contactoForm.telefono}
                onChange={(e) => setContactoForm((prev) => ({ ...prev, telefono: e.target.value }))}
                placeholder="11 1234-5678"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowContactoModal(false)
                  setContactoForm({ nombre: '', cargo: '', telefono: '' })
                }}
                disabled={submittingContacto}
              >
                Cancelar
              </Button>
              <Button onClick={handleAgregarContacto} disabled={submittingContacto}>
                {submittingContacto ? 'Guardando...' : 'Agregar contacto'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
