import ClienteDetailContent from './ClienteDetailContent'

export function generateStaticParams() {
  return [{ id: '1' }]
}

export default function Page() {
  return <ClienteDetailContent />
}
