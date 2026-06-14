// =============================================================
// TypeScript types matching the SQL schema (001_initial_schema.sql)
// =============================================================

export type UserRole = 'operador' | 'cadete'

export type EstadoPedido =
  | 'pendiente'
  | 'asignado'
  | 'en_retiro'
  | 'en_camino'
  | 'entregado'
  | 'fallido'

export type TipoIntento =
  | 'entregado'
  | 'no_atendio'
  | 'cerrado'
  | 'otro'

// =============================================================
// TABLE: usuarios
// =============================================================
export interface Usuario {
  id: string
  email: string
  nombre: string
  rol: UserRole
  activo: boolean
  created_at: string
}

export type FormaPago =
  | 'efectivo'
  | 'mercadopago'
  | 'transferencia'

// =============================================================
// TABLE: pedidos
// =============================================================
export interface Pedido {
  id: string
  codigo: number
  palabra_clave: string
  estado: EstadoPedido
  cadete_id: string | null
  retiro_direccion: string
  retiro_contacto: string
  retiro_telefono: string
  entrega_direccion: string
  entrega_contacto: string
  entrega_telefono: string
  token_cliente: string
  notas: string | null
  cliente_empresa: string | null
  contacto_nombre: string | null
  hora_salida: string | null
  importe: number | null
  forma_pago: FormaPago | null
  created_at: string
  updated_at: string
}

// =============================================================
// TABLE: intentos_entrega
// =============================================================
export interface IntentoEntrega {
  id: string
  pedido_id: string
  cadete_id: string
  tipo: TipoIntento
  foto_url: string | null
  receptor_nombre: string | null
  receptor_dni: string | null
  notas: string | null
  created_at: string
}

// =============================================================
// TABLE: ubicaciones_cadete
// =============================================================
export interface UbicacionCadete {
  id: string
  cadete_id: string
  lat: number
  lng: number
  timestamp: string
  pedido_id?: string | null
}

// =============================================================
// Payload from get_pedido_by_token RPC
// =============================================================
export interface TrackingData {
  pedido: Pedido | null
  intentos: IntentoEntrega[]
  ubicacion: UbicacionCadete | null
  error?: string
}
