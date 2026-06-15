'use client'

import { cn } from '@/lib/utils/cn'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'

// Fix default marker icon issue with Next.js/webpack
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

L.Marker.prototype.options.icon = defaultIcon

// Cadete marker icon
const cadeteIcon = L.divIcon({
  className: '',
  html: `<div style="
    background-color: #dc2626;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: bold;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  ">📍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
})

interface CadetePosition {
  cadete_id: string
  lat: number
  lng: number
  timestamp: string
  cadete_nombre: string
}

interface LiveMapProps {
  positions: CadetePosition[]
  className?: string
}

function LiveMap({ positions, className }: LiveMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg bg-gray-100',
          className,
        )}
        style={{ height: '100%', minHeight: '400px' }}
      >
        <p className="text-sm text-gray-500">Cargando mapa...</p>
      </div>
    )
  }

  // Default center: average of all positions, or Buenos Aires
  const avgLat =
    positions.length > 0
      ? positions.reduce((s, p) => s + p.lat, 0) / positions.length
      : -34.6037
  const avgLng =
    positions.length > 0
      ? positions.reduce((s, p) => s + p.lng, 0) / positions.length
      : -58.3816

  return (
    <div
      className={cn('rounded-lg overflow-hidden', className)}
      style={{ height: '100%', minHeight: '400px' }}
    >
      <MapContainer
        center={[avgLat, avgLng]}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {positions
          .filter((p) => p.lat && p.lng)
          .map((pos) => (
            <Marker
              key={pos.cadete_id}
              position={[pos.lat, pos.lng]}
              icon={cadeteIcon}
            >
              <Popup>
                <div className="min-w-[120px] text-sm">
                  <p className="font-semibold text-gray-900">
                    {pos.cadete_nombre}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Última actualización:{' '}
                    {new Date(pos.timestamp).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  )
}

export default LiveMap
