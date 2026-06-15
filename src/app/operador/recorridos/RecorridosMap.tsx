'use client'

import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Recorrido, Parada } from '@/lib/types'

// Fix default Leaflet icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function createStopIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width: 28px; height: 28px; background: #f97316; border: 3px solid white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">⏱</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function createStartIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width: 16px; height: 16px; background: #22c55e; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function createEndIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width: 16px; height: 16px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function createWaypointIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width: 10px; height: 10px; background: #dc2626; border: 2px solid white; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,0.2);"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

interface Props {
  puntos: Recorrido[]
  paradas: Parada[]
  selectedParadaIndex?: number | null
}

export default function RecorridosMap({ puntos, paradas, selectedParadaIndex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const paradaMarkersRef = useRef<L.Marker[]>([])
  const prevSelectedRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || puntos.length === 0) return

    // Clear existing layers (except tile layer)
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) return
      layer.remove()
    })

    const latlngs: [number, number][] = puntos.map((p) => [p.lat, p.lng])

    // Polyline
    L.polyline(latlngs, {
      color: '#dc2626',
      weight: 3,
      opacity: 0.8,
    }).addTo(map)

    // Start marker (green)
    const start = puntos[0]
    L.marker([start.lat, start.lng], { icon: createStartIcon() })
      .addTo(map)
      .bindTooltip('Inicio', { permanent: false, direction: 'top' })

    // End marker (red)
    const end = puntos[puntos.length - 1]
    L.marker([end.lat, end.lng], { icon: createEndIcon() })
      .addTo(map)
      .bindTooltip('Última posición', { permanent: false, direction: 'top' })

    // Waypoint markers every 10 points
    const step = Math.max(1, Math.floor(puntos.length / 10))
    for (let i = step; i < puntos.length - 1; i += step) {
      const p = puntos[i]
      const time = new Date(p.timestamp).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      L.marker([p.lat, p.lng], { icon: createWaypointIcon() })
        .addTo(map)
        .bindTooltip(time, { permanent: false, direction: 'top' })
    }

    // Stop markers (orange clock)
    paradaMarkersRef.current = paradas.map((parada, i) => {
      const inicioStr = parada.inicio.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const finStr = parada.fin.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      })
      const marker = L.marker([parada.lat, parada.lng], { icon: createStopIcon() })
        .addTo(map)
        .bindPopup(
          `<div style="font-size:13px;line-height:1.5">
            <strong>Parada #${i + 1}</strong><br/>
            Inicio: ${inicioStr}<br/>
            Fin: ${finStr}<br/>
            Duración: ${parada.duracionMinutos} min
          </div>`,
          { closeButton: true, maxWidth: 240 },
        )
      return marker
    })

    // Fit bounds
    const bounds = L.latLngBounds(latlngs)
    map.fitBounds(bounds, { padding: [60, 60] })
  }, [puntos, paradas])

  // Fly to selected parada
  useEffect(() => {
    const map = mapRef.current
    if (!map || selectedParadaIndex == null) return
    if (selectedParadaIndex < 0 || selectedParadaIndex >= paradaMarkersRef.current.length) return

    const parada = paradas[selectedParadaIndex]
    const marker = paradaMarkersRef.current[selectedParadaIndex]
    if (!parada || !marker) return

    map.setView([parada.lat, parada.lng], 17)
    marker.openPopup()
  }, [selectedParadaIndex, paradas])

  return (
    <div
      ref={containerRef}
      className="h-[500px] w-full rounded-lg border border-gray-200"
    />
  )
}
