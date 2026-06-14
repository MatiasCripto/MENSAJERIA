import PedidoContentWrapper from './PedidoContentWrapper'

export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function Page() {
  return <PedidoContentWrapper />
}
