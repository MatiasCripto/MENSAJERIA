import OperadorPedidoDetail from './OperadorPedidoDetail'

export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function Page() {
  return <OperadorPedidoDetail />
}
