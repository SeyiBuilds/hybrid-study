import { useSyncExternalStore } from 'react'
import type { Target } from '../ai/client'

/** Where the student wants AI to run: let the router decide, or pin it. */
export type RunOn = 'auto' | Target

const STORAGE_KEY = 'hybrid-study:run-on'
const listeners = new Set<() => void>()

function read(): RunOn {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'on_device' || value === 'in_cloud') return value
  } catch {
    // Storage can be unavailable (private windows); fall back to automatic.
  }
  return 'auto'
}

let current: RunOn = read()

export function setRunOn(value: RunOn) {
  current = value
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // Not remembered across reloads, but still applies now.
  }
  listeners.forEach((listener) => listener())
}

export function useRunOn(): RunOn {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** The router's `force` value for a preference. */
export function forcedTarget(runOn: RunOn): Target | undefined {
  return runOn === 'auto' ? undefined : runOn
}
