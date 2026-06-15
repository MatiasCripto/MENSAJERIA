'use client'

import { Input } from '@/components/ui/Input'
import { useEffect, useRef, useState } from 'react'

type NominatimResult = {
  display_name: string
  lat: string
  lon: string
}

type DireccionAutocompleteProps = {
  label?: string
  name?: string
  placeholder?: string
  value: string
  error?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function DireccionAutocomplete({
  label,
  name,
  placeholder,
  value,
  error,
  onChange,
}: DireccionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const abortRef = useRef<AbortController | undefined>(undefined)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e)
    const query = e.target.value.trim()

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (query.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=ar`,
          {
            signal: controller.signal,
            headers: { 'User-Agent': 'MensajeriaApp/1.0' },
          },
        )
        if (!res.ok) return
        const data: NominatimResult[] = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch {
        // Ignorar errores de abort
      }
    }, 400)
  }

  const handleSelect = (suggestion: NominatimResult) => {
    const syntheticEvent = {
      target: {
        name: name ?? '',
        value: suggestion.display_name,
      },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(syntheticEvent)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={label}
        name={name}
        placeholder={placeholder}
        value={value}
        error={error}
        onChange={handleInputChange}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-[#1a1a1a]">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onClick={() => handleSelect(s)}
              className="cursor-pointer px-3 py-2.5 text-sm text-gray-700 transition-colors hover:bg-zinc-50 hover:text-zinc-700 first:rounded-t-lg last:rounded-b-lg dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              {s.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
