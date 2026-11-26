/** Page quizzes: written through the router, checked, and saved on the device. */
import type { Target } from './client'
import { dismissJob, runAiJob } from './jobs'
import { quizPrompt } from './prompts'
import { parseQuiz, QUESTION_COUNT, type QuizLevel } from './quiz'
import { registerQueueRunner } from './queue'
import { getContent, savePageQuiz, type PageQuiz } from '../lib/library'

// A quiz that waited in the offline queue: rebuild it from the stored page and run it again.
registerQueueRunner('quiz', async (entry) => {
  const page = (await getContent(entry.documentId))?.pages[entry.page - 1]
  if (!page) {
    dismissJob(entry.jobKey)
    return
  }
  const settings = (entry.meta ?? {}) as { count?: number; level?: QuizLevel }
  await generateQuiz({
    documentId: entry.documentId,
    title: entry.title,
    page: entry.page,
    pageText: page.text,
    force: entry.force,
    count: settings.count,
    level: settings.level,
  })
})

export function quizJobKey(documentId: string, page: number): string {
  return `quiz:${documentId}:${page}`
}

export function buildQuizPrompt(input: { pageText: string; title: string; page: number; count?: number; level?: QuizLevel }): string {
  return quizPrompt(input)
}

export function generateQuiz(input: {
  documentId: string
  title: string
  page: number
  pageText: string
  force?: Target
  count?: number
  level?: QuizLevel
}): Promise<void> {
  const count = input.count ?? QUESTION_COUNT
  const level = input.level ?? 'mixed'
  return runAiJob<PageQuiz, { count: number; level: QuizLevel } | undefined>({
    key: quizJobKey(input.documentId, input.page),
    prompt: buildQuizPrompt(input),
    task: 'quiz',
    format: 'quiz',
    force: input.force,
    meta: { count, level },
    retries: 1,
    queue: { kind: 'quiz', documentId: input.documentId, page: input.page, title: input.title },
    save: (result) => {
      const questions = parseQuiz(result.text, Math.random, count, Math.min(3, count))
      const now = Date.now()
      return savePageQuiz({
        documentId: input.documentId,
        page: input.page,
        questions,
        answers: questions.map(() => null),
        checkedAt: null,
        score: null,
        level,
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
