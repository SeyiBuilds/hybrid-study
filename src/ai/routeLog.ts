/** The router's recent decisions, shown under "How it decides". Kept in memory only. */
import { useSyncExternalStore } from 'react'
import type { Target } from './client'
import type { Task } from './router'

export interface RouteLogEntry {
  id: number
  task: Task
  target: Target
  reason: string
}

const MAX_ENTRIES = 5
let entries: RouteLogEntry[] = []
let nextId = 1
const listeners = new Set<() => void>()

export function logRoute(entry: Omit<RouteLogEntry, 'id'>) {
  entries = [{ ...entry, id: nextId++ }, ...entries].slice(0, MAX_ENTRIES)
  listeners.forEach((listener) => listener())
}

export function useRouteLog(): RouteLogEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => entries,
  )
}
