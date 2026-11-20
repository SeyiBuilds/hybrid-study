/** Page quizzes: written through the router, checked, and saved on the device. */
import type { Target } from './client'
import { dismissJob, runAiJob } from './jobs'
import { quizPrompt } from './prompts'
import { parseQuiz } from './quiz'
import { registerQueueRunner } from './queue'
import { getContent, savePageQuiz, type PageQuiz } from '../lib/library'

// A quiz that waited in the offline queue: rebuild it from the stored page and run it again.
registerQueueRunner('quiz', async (entry) => {
  const page = (await getContent(entry.documentId))?.pages[entry.page - 1]
  if (!page) {
    dismissJob(entry.jobKey)
    return
  }
  await generateQuiz({ documentId: entry.documentId, title: entry.title, page: entry.page, pageText: page.text, force: entry.force })
})

export function quizJobKey(documentId: string, page: number): string {
  return `quiz:${documentId}:${page}`
}

export function buildQuizPrompt(input: { pageText: string; title: string; page: number }): string {
  return quizPrompt(input)
}

export function generateQuiz(input: {
  documentId: string
  title: string
  page: number
  pageText: string
  force?: Target
}): Promise<void> {
  return runAiJob<PageQuiz, undefined>({
    key: quizJobKey(input.documentId, input.page),
    prompt: buildQuizPrompt(input),
    task: 'quiz',
    format: 'quiz',
    force: input.force,
    meta: undefined,
    retries: 1,
    queue: { kind: 'quiz', documentId: input.documentId, page: input.page, title: input.title },
    save: (result) => {
      const questions = parseQuiz(result.text)
      const now = Date.now()
      return savePageQuiz({
        documentId: input.documentId,
        page: input.page,
        questions,
        answers: questions.map(() => null),
        checkedAt: null,
        score: null,
        scores: [],
        source: result.source,
        totalMs: result.totalMs,
        bytes: result.bytes,
        createdAt: now,
        updatedAt: now,
      })
    },
  })
}
