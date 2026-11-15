/** Page summaries: run through the router and saved on the device. */
import type { Target } from './client'
import { runAiJob } from './jobs'
import { summarisePrompt } from './prompts'
import { savePageSummary, type PageSummary } from '../lib/library'

export function summaryJobKey(documentId: string, page: number): string {
  return `summary:${documentId}:${page}`
}

export function buildSummaryPrompt(input: { pageText: string; title: string; page: number }): string {
  return summarisePrompt(input)
}

export function summarisePage(input: {
  documentId: string
  title: string
  page: number
  pageText: string
  force?: Target
}): Promise<void> {
  return runAiJob<PageSummary, undefined>({
    key: summaryJobKey(input.documentId, input.page),
    prompt: buildSummaryPrompt(input),
    task: 'summarise',
    force: input.force,
    meta: undefined,
    save: (result) =>
      savePageSummary({
        documentId: input.documentId,
        page: input.page,
        text: result.text.trim(),
        source: result.source,
        totalMs: result.totalMs,
        bytes: result.bytes,
        createdAt: Date.now(),
      }),
  })
}

export type AiLine = { kind: 'item' | 'para'; text: string }

/** Splits model output into bullet items and plain lines. */
export function parseAiText(text: string): AiLine[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const bullet = line.match(/^(?:[-*•–]|\d{1,2}[.)])\s+(.*)$/)
      return bullet ? { kind: 'item' as const, text: bullet[1] } : { kind: 'para' as const, text: line }
    })
}
