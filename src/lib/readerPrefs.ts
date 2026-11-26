/** Reader view settings remembered on this device: page zoom and whether the page list is open. */
import { useState } from 'react'

/** Zoom steps, relative to the page fitting the width of the reading area. */
export const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5]

function usePersisted<T>(key: string, fallback: T, valid: (value: unknown) => boolean): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored)
        if (valid(parsed)) return parsed as T
      }
    } catch {
      // Storage blocked or unreadable: use the default.
    }
    return fallback
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Not remembered, but still applied.
    }
  }
  return [value, set]
}

export function useZoom(): [number, (zoom: number) => void] {
  return usePersisted('hybrid-study:zoom', 1, (value) => ZOOM_STEPS.includes(value as number))
}

export function usePagesPane(): [boolean, (open: boolean) => void] {
  return usePersisted('hybrid-study:pages-pane', true, (value) => typeof value === 'boolean')
}
