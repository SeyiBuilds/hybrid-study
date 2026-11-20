/** Questions about a page: run through the router, answers saved on the device. */
import type { Target } from './client'
import { classifyQuestion } from './difficulty'
import { dismissJob, runAiJob } from './jobs'
import { askPrompt, documentContext } from './prompts'
import { registerQueueRunner } from './queue'
import { getContent, saveAnswer, type PageAnswer } from '../lib/library'
import type { PageText } from '../lib/pageText'

export interface AskMeta {
  question: string
  quote?: string
}

export interface AskInput {
  documentId: string
  title: string
  page: number
  pageText: string
  /** Every page of the document, for questions that reach beyond this one. */
  pages: PageText[]
  question: string
  quote?: string
}

/** The question students get when they press Explain on highlighted words. */
export const EXPLAIN_QUESTION = 'Explain this in simple words.'

export function askJobPrefix(documentId: string, page: number): string {
  return `ask:${documentId}:${page}:`
}

/**
 * Cross-page questions sent to the cloud get text from around the document. On-device
 * requests stay on the current page, within the model's limits.
 */
export function buildAskPrompt(input: AskInput, target: Target): string {
  const crossPage = classifyQuestion(input.question).kind === 'cross-page'
  return askPrompt({
    ...input,
    documentText: crossPage && target === 'in_cloud' ? documentContext(input.pages, input.page) : undefined,
  })
}

export function askAboutPage(input: AskInput & { force?: Target; id?: string }): Promise<void> {
  const id = input.id ?? crypto.randomUUID()
  return runAiJob<PageAnswer, AskMeta>({
    key: `${askJobPrefix(input.documentId, input.page)}${id}`,
    prompt: (decision) => buildAskPrompt(input, decision.target),
    task: 'ask',
    difficulty: classifyQuestion(input.question).difficulty,
    force: input.force,
    meta: { question: input.question, quote: input.quote },
    queue: {
      kind: 'ask',
      documentId: input.documentId,
      page: input.page,
      title: input.title,
      question: input.question,
      quote: input.quote,
    },
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

/** The id of a question, from its job key. */
export function askIdFromKey(key: string): string {
  return key.slice(key.lastIndexOf(':') + 1)
}

// A question that waited in the offline queue: rebuild it from the stored document and ask again.
registerQueueRunner('ask', async (entry) => {
  const content = await getContent(entry.documentId)
  const page = content?.pages[entry.page - 1]
  if (!content || !page || !entry.question) {
    dismissJob(entry.jobKey)
    return
  }
  await askAboutPage({
    id: askIdFromKey(entry.jobKey),
    documentId: entry.documentId,
    title: entry.title,
    page: entry.page,
    pageText: page.text,
    pages: content.pages,
    question: entry.question,
    quote: entry.quote,
    force: entry.force,
  })
})
