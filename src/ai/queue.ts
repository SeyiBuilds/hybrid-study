/**
 * The offline queue: requests that can't run yet (offline and they need the cloud) wait
 * here, saved on the device, and are sent automatically when the connection returns.
 * Each feature registers how to run its own entries again.
 */
import { useSyncExternalStore } from 'react'
import type { Target } from './client'

export type QueueKind = 'ask' | 'summary' | 'quiz'

export interface QueueEntry {
  /** The job this entry belongs to; also its id. */
  jobKey: string
  kind: QueueKind
  documentId: string
  page: number
  title: string
  question?: string
  quote?: string
  /** The student's own choice of where to run, if they made one. */
  force?: Target
  meta?: unknown
  reason: string
  queuedAt: number
}

const STORAGE_KEY = 'hybrid-study:queue'

function load(): QueueEntry[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? (stored as QueueEntry[]) : []
  } catch {
    return []
  }
}

let entries = load()
const listeners = new Set<() => void>()

function save(next: QueueEntry[]) {
  entries = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((listener) => listener())
}

export function queuedEntries(): QueueEntry[] {
  return entries
}

export function enqueue(entry: QueueEntry) {
  save([...entries.filter((existing) => existing.jobKey !== entry.jobKey), entry])
}

export function dequeue(jobKey: string) {
  if (entries.some((entry) => entry.jobKey === jobKey)) save(entries.filter((entry) => entry.jobKey !== jobKey))
}

export function useQueue(): QueueEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => entries,
  )
}

const runners = new Map<QueueKind, (entry: QueueEntry) => Promise<void>>()

export function registerQueueRunner(kind: QueueKind, run: (entry: QueueEntry) => Promise<void>) {
  runners.set(kind, run)
}

let flushing = false

/**
 * Sends everything waiting, one at a time, oldest first. An entry that still can't run
 * (the connection dropped again) goes back into the queue by itself.
 */
export async function flushQueue(): Promise<void> {
  if (flushing || !navigator.onLine || entries.length === 0) return
  flushing = true
  try {
    for (const entry of [...entries].sort((a, b) => a.queuedAt - b.queuedAt)) {
      const run = runners.get(entry.kind)
      if (!run) continue
      dequeue(entry.jobKey)
      await run(entry)
    }
  } finally {
    flushing = false
  }
}
