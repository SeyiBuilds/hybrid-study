/**
 * AI requests in progress. A job keeps running when the student turns the page, and the
 * answer is shown whole once it is ready (not typed out word by word).
 */
import { useSyncExternalStore } from 'react'
import { describeError, type Target } from './client'
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

/** Runs one AI request through the router, then saves the result with `save`. */
export async function runAiJob<R, M>({
  key,
  prompt,
  task,
  force,
  meta,
  save,
}: {
  key: string
  prompt: string
  task: Task
  force?: Target
  meta: M
  save: (result: AskResult) => Promise<R>
}): Promise<void> {
  if (jobs.get(key)?.status === 'running') return
  let running: Job<R, M> = { status: 'running', key, target: null, startedAt: Date.now(), meta }
  set(running)
  try {
    const result = await ask(prompt, {
      task,
      force,
      // Generation still streams under the hood (for timing); nothing is shown until it is complete.
      onText: () => {},
      onDecision: (decision) => {
        running = { ...running, target: decision.target } as Job<R, M>
        set(running)
      },
    })
    if (!result.text.trim()) throw new Error('The model returned an empty answer. Try again.')
    set({ status: 'done', key, result: await save(result), meta })
  } catch (error) {
    set({ status: 'error', key, message: describeError(error), meta })
  }
}
