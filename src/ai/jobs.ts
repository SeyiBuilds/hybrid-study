/**
 * AI requests in progress. A job keeps running when the student turns the page, and the
 * answer is shown whole once it is ready (not typed out word by word).
 */
import { useSyncExternalStore } from 'react'
import { describeError, type OutputFormat, type Target } from './client'
import { BadOutputError } from './errors'
import { ask, type AskResult, type Task } from './router'

export type Job<R, M = undefined> =
  | { status: 'running'; key: string; target: Target | null; startedAt: number; meta: M }
  | { status: 'done'; key: string; result: R; meta: M }
  | { status: 'error'; key: string; message: string; meta: M }

const jobs = new Map<string, Job<unknown, unknown>>()
const listeners = new Set<() => void>()
let version = 0
const prefixCache = new Map<string, { version: number; list: Job<unknown, unknown>[] }>()

function emit() {
  version += 1
  listeners.forEach((listener) => listener())
}

function set(job: Job<unknown, unknown>) {
  jobs.set(job.key, job)
  emit()
}

export function dismissJob(key: string) {
  if (jobs.delete(key)) emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useJob<R, M = undefined>(key: string): Job<R, M> | undefined {
  return useSyncExternalStore(subscribe, () => jobs.get(key) as Job<R, M> | undefined)
}

/** All jobs whose key starts with a prefix, oldest first. */
export function useJobs<R, M = undefined>(prefix: string): Job<R, M>[] {
  return useSyncExternalStore(subscribe, () => {
    const cached = prefixCache.get(prefix)
    if (cached && cached.version === version) return cached.list as Job<R, M>[]
    const list = [...jobs.values()].filter((job) => job.key.startsWith(prefix))
    prefixCache.set(prefix, { version, list })
    return list as Job<R, M>[]
  })
}

/**
 * Runs one AI request through the router, then saves the result with `save`.
 * If the output is unusable (`BadOutputError`), it is requested again up to `retries` times;
 * the time and data reported cover every attempt.
 */
export async function runAiJob<R, M>({
  key,
  prompt,
  task,
  format,
  force,
  meta,
  retries = 0,
  save,
}: {
  key: string
  prompt: string
  task: Task
  format?: OutputFormat
  force?: Target
  meta: M
  retries?: number
  save: (result: AskResult) => Promise<R>
}): Promise<void> {
  if (jobs.get(key)?.status === 'running') return
  const startedAt = Date.now()
  let running: Job<R, M> = { status: 'running', key, target: null, startedAt, meta }
  set(running)
  let bytes = 0
  try {
    for (let attempt = 0; ; attempt++) {
      const result = await ask(prompt, {
        task,
        format,
        force,
        // Generation still streams under the hood (for timing); nothing is shown until it is complete.
        onText: () => {},
        onDecision: (decision) => {
          running = { ...running, target: decision.target } as Job<R, M>
          set(running)
        },
      })
      bytes += result.bytes
      try {
        if (!result.text.trim()) throw new BadOutputError('The model returned an empty answer. Try again.')
        const saved = await save({ ...result, bytes, totalMs: Date.now() - startedAt })
        set({ status: 'done', key, result: saved, meta })
        return
      } catch (error) {
        if (!(error instanceof BadOutputError) || attempt >= retries) throw error
      }
    }
  } catch (error) {
    set({ status: 'error', key, message: describeError(error), meta })
  }
}
