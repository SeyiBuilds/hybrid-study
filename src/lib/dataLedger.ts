/**
 * The data-saved counter: what answering on this laptop saved, compared with sending the
 * same request to the cloud, and what the cloud actually used. Kept on this device.
 */
import { useSyncExternalStore } from 'react'

export interface DataLedger {
  savedBytes: number
  usedBytes: number
  onDeviceAnswers: number
  cloudAnswers: number
  since: number
}

const STORAGE_KEY = 'hybrid-study:data-ledger'

function empty(): DataLedger {
  return { savedBytes: 0, usedBytes: 0, onDeviceAnswers: 0, cloudAnswers: 0, since: Date.now() }
}

function load(): DataLedger {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as DataLedger | null
    if (stored && typeof stored.savedBytes === 'number') return { ...empty(), ...stored }
  } catch {
    // Start a fresh counter if storage is unreadable.
  }
  return empty()
}

let ledger = load()
const listeners = new Set<() => void>()

function set(next: DataLedger) {
  ledger = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger))
  } catch {
    // Counted for this visit only.
  }
  listeners.forEach((listener) => listener())
}

export function recordUsage({ onDevice, usedBytes, savedBytes }: { onDevice: boolean; usedBytes: number; savedBytes: number }) {
  set({
    ...ledger,
    savedBytes: ledger.savedBytes + savedBytes,
    usedBytes: ledger.usedBytes + usedBytes,
    onDeviceAnswers: ledger.onDeviceAnswers + (onDevice ? 1 : 0),
    cloudAnswers: ledger.cloudAnswers + (onDevice ? 0 : 1),
  })
}

export function resetLedger() {
  set(empty())
}

export function useDataLedger(): DataLedger {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => ledger,
  )
}
