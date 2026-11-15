/**
 * Page summaries: runs them through the router, keeps in-progress jobs alive while the
 * student turns pages, and saves finished summaries on the device so they reopen
 * instantly, offline and for free.
 */
import { useSyncExternalStore } from 'react'
import { describeError, type Target } from './client'
import { summarisePrompt } from './prompts'
import { ask, type RouteDecision } from './router'
import { savePageSummary, type PageSummary } from '../lib/library'

export type SummaryJob =
  | { status: 'running'; key: string; text: string; target: Target | null; reason: string | null; startedAt: number }
  | { status: 'done'; key: string; summary: PageSummary }
  | { status: 'error'; key: string; message: string; text: string }

const jobs = new Map<string, SummaryJob>()
const listeners = new Set<() => void>()

function update(job: SummaryJob) {
  jobs.set(job.key, job)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function summaryKey(documentId: string, page: number): string {
  return `${documentId}:${page}`
}

/** The latest job for a page in this session, if any. */
export function useSummaryJob(key: string): SummaryJob | undefined {
  return useSyncExternalStore(subscribe, () => jobs.get(key))
}

export function buildSummaryPrompt(input: { pageText: string; title: string; page: number }): string {
  return summarisePrompt(input)
}

/** Starts summarising a page unless that page is already being summarised. */
export async function summarisePage(input: {
  documentId: string
  title: string
  page: number
  pageText: string
}): Promise<void> {
  const key = summaryKey(input.documentId, input.page)
  if (jobs.get(key)?.status === 'running') return

  let running: Extract<SummaryJob, { status: 'running' }> = {
    status: 'running',
    key,
    text: '',
    target: null,
    reason: null,
    startedAt: Date.now(),
  }
  update(running)

  try {
    const result = await ask(buildSummaryPrompt(input), {
      task: 'summarise',
      onDecision: (decision: RouteDecision) => {
        running = { ...running, target: decision.target, reason: decision.reason }
        update(running)
      },
      onText: (text) => {
        running = { ...running, text }
        update(running)
      },
    })
    const text = result.text.trim()
    if (!text) throw new Error('The model returned an empty summary. Try again.')
    const summary = await savePageSummary({
      documentId: input.documentId,
      page: input.page,
      text,
      source: result.source,
      totalMs: result.totalMs,
      bytes: result.bytes,
      createdAt: Date.now(),
    })
    update({ status: 'done', key, summary })
  } catch (error) {
    update({ status: 'error', key, message: describeError(error), text: running.text })
  }
}

export type SummaryLine = { kind: 'item' | 'para'; text: string }

/** Splits model output into bullet items and plain lines. */
export function parseSummary(text: string): SummaryLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = line.match(/^(?:[-*•–]|\d{1,2}[.)])\s+(.*)$/)
      return bullet ? { kind: 'item' as const, text: bullet[1] } : { kind: 'para' as const, text: line }
    })
}
