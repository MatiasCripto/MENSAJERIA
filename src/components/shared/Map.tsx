'use client'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils/cn'

// Fix default marker icon (Leaflet's default icon doesn't load in webpack bundlers)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface MapMarker {
  lat: number
  lng: number
  label?: string
  popup?: string
}

interface MapProps {
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  className?: string
  height?: string
}

export default function Map({ center, zoom = 14, markers = [], className, height = '300px' }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: center || [-34.6037, -58.3816], // default: Buenos Aires
      zoom,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [center, zoom])

  // Update markers when they change
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Add new markers
    markers.forEach(marker => {
      const m = L.marker([marker.lat, marker.lng]).addTo(map)

      if (marker.popup) {
        m.bindPopup(marker.popup)
      }
      if (marker.label) {
        m.bindTooltip(marker.label)
      }

      markersRef.current.push(m)
    })

    // Fit bounds if multiple markers
    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }

    // Center on single marker
    if (markers.length === 1 && center === undefined) {
      map.setView([markers[0].lat, markers[0].lng], zoom)
    }
  }, [markers, center, zoom])

  return <div ref={mapRef} className={cn('w-full rounded-lg', className)} style={{ height }} />
}
