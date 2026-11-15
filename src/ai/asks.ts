/** Questions about a page: run through the router, answers saved on the device. */
import type { Target } from './client'
import { runAiJob } from './jobs'
import { askPrompt } from './prompts'
import { saveAnswer, type PageAnswer } from '../lib/library'

export interface AskMeta {
  question: string
  quote?: string
}

export function askJobPrefix(documentId: string, page: number): string {
  return `ask:${documentId}:${page}:`
}

export function askAboutPage(input: {
  documentId: string
  title: string
  page: number
  pageText: string
  question: string
  quote?: string
  force?: Target
}): Promise<void> {
  const id = crypto.randomUUID()
  return runAiJob<PageAnswer, AskMeta>({
    key: `${askJobPrefix(input.documentId, input.page)}${id}`,
    prompt: askPrompt(input),
    task: 'ask',
    force: input.force,
    meta: { question: input.question, quote: input.quote },
    save: (result) =>
      saveAnswer({
        id,
        documentId: input.documentId,
        page: input.page,
        question: input.question,
        quote: input.quote,
        text: result.text.trim(),
        source: result.source,
        totalMs: result.totalMs,
        bytes: result.bytes,
        createdAt: Date.now(),
      }),
  })
}
