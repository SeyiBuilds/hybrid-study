/** Page summaries: run through the router and saved on the device. */
import type { Target } from './client'
import { dismissJob, runAiJob } from './jobs'
import { summarisePrompt } from './prompts'
import { registerQueueRunner } from './queue'
import { getContent, savePageSummary, type PageSummary } from '../lib/library'

// A summary that waited in the offline queue: rebuild it from the stored page and run it again.
registerQueueRunner('summary', async (entry) => {
  const page = (await getContent(entry.documentId))?.pages[entry.page - 1]
  if (!page) {
    dismissJob(entry.jobKey)
    return
  }
  await summarisePage({ documentId: entry.documentId, title: entry.title, page: entry.page, pageText: page.text, force: entry.force })
})

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
    queue: { kind: 'summary', documentId: input.documentId, page: input.page, title: input.title },
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

export interface AiLine {
  kind: 'item' | 'para' | 'math'
  text: string
  /** Belongs to the bullet above (a formula under it, or text after that formula). */
  indent?: boolean
}

/**
 * Formulas that get a line of their own: $$…$$ or \[…\] (possibly across lines or in the
 * middle of a sentence), and any equation written inline as `…`, $…$ or \(…\).
 */
const DISPLAY_MATH =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|`([^`\n]*=[^`\n]*)`|\$(?!\s)([^$\n]*=[^$\n]*?)(?<!\s)\$|\\\(([^\n]*?=[^\n]*?)\\\)/g
const MATH_MARK = '\u0000'
const BULLET = /^(?:[-*•–]|\d{1,2}[.)])\s+(.*)$/
const BARE_BULLET = /^(?:[-*•–]|\d{1,2}[.)])$/

/**
 * Splits model output into bullet items, plain lines and formulas. Display formulas
 * always get a line of their own, under the bullet they belong to.
 */
export function parseAiText(text: string): AiLine[] {
  const marked = text
    .replace(/\r/g, '')
    .replace(DISPLAY_MATH, (_, ...groups: Array<string | undefined>) => {
      const tex = (groups.slice(0, 5).find((group) => group !== undefined) ?? '').replace(/\s*\n\s*/g, ' ').trim()
      return tex ? `\n${MATH_MARK}${tex}\n` : ''
    })
  const lines: AiLine[] = []
  let inItem = false
  let afterMath = false
  for (const raw of marked.split('\n')) {
    const line = raw.trim()
    // Skip empty lines, and lone punctuation left behind when a formula was lifted out of a sentence.
    if (!line || (afterMath && /^[.,;:]+$/.test(line))) continue
    if (line.startsWith(MATH_MARK)) {
      lines.push({ kind: 'math', text: line.slice(1), indent: inItem })
      afterMath = true
      continue
    }
    if (BARE_BULLET.test(line)) {
      inItem = true
      afterMath = false
      continue
    }
    const bullet = line.match(BULLET)
    if (bullet) {
      lines.push({ kind: 'item', text: bullet[1] })
      inItem = true
    } else {
      // Text straight after a formula inside a bullet carries on that bullet.
      const continues: boolean = inItem && afterMath
      lines.push({ kind: 'para', text: line, indent: continues })
      inItem = continues
    }
    afterMath = false
  }
  return lines
}
