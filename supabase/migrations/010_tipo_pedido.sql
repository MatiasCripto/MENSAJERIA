-- Agregar tipo de pedido: entrega, retiro, tramite
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'entrega'
  CHECK (tipo IN ('entrega', 'retiro', 'tramite'));
