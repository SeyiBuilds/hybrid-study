/**
 * The exam formats: what an exam holds, the schemas the models follow for written
 * questions and for marking, and the checks every reply passes before a student sees it.
 */
import { Schema } from 'firebase/ai'
import { BadOutputError } from './errors'
import type { QuizLevel, QuizQuestion } from './quiz'

export type ExamQuestion =
  | ({ kind: 'mcq' } & QuizQuestion)
  | { kind: 'written'; question: string; modelAnswer: string; keyPoints: string[]; marks: number }

export interface WrittenMark {
  score: number
  feedback: string
  correction: string
  tip: string
}

export interface ExamSettings {
  /** Total questions, objective and written together. */
  count: number
  /** Include a written (theory) section. */
  written: boolean
  level: QuizLevel
  minutes: number
  fromPage: number
  toPage: number
  /** Use the course's past questions as a guide to style and difficulty. */
  usePast: boolean
}

export interface Exam {
  id: string
  documentId: string
  title: string
  settings: ExamSettings
  questions: ExamQuestion[]
  /** Option index for objective questions, text for written ones, null if unanswered. */
  answers: Array<number | string | null>
  /** Set when the student presses Start; the timer runs from here. */
  startedAt: number | null
  endsAt: number | null
  submittedAt: number | null
  /** Marks for written questions (null for objective questions or not yet marked). */
  marks: Array<WrittenMark | null>
  markedAt: number | null
  score: number | null
  outOf: number | null
  /** Longer explanations the student asked for after marking, by question index. */
  explanations: Record<number, string>
  /** Where the questions were written: how many requests ran where, and the data used. */
  source: { device: number; cloud: number; totalMs: number; bytes: number }
  createdAt: number
}

export const writtenSchema = Schema.object({
  properties: {
    questions: Schema.array({
      minItems: 1,
      maxItems: 10,
      items: Schema.object({
        properties: {
          question: Schema.string(),
          marks: Schema.integer(),
          modelAnswer: Schema.string(),
          keyPoints: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
})

export const markingSchema = Schema.object({
  properties: {
    score: Schema.integer(),
    feedback: Schema.string(),
    correction: Schema.string(),
    tip: Schema.string(),
  },
})

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[ \t]+/g, ' ').trim() : ''
}

function extractJson(reply: string): Record<string, unknown> {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) throw new BadOutputError('The reply came back in the wrong format. Try again.')
  try {
    return JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    throw new BadOutputError('The reply came back incomplete. Try again.')
  }
}

/** Written questions from the model's reply; unusable ones are dropped. */
export function parseWritten(reply: string): Array<Extract<ExamQuestion, { kind: 'written' }>> {
  const data = extractJson(reply)
  const raw = Array.isArray(data.questions) ? (data.questions as Array<Record<string, unknown>>) : []
  const questions = raw
    .map((item) => ({
      kind: 'written' as const,
      question: text(item?.question),
      modelAnswer: text(item?.modelAnswer),
      keyPoints: Array.isArray(item?.keyPoints) ? item.keyPoints.map(text).filter(Boolean).slice(0, 8) : [],
      marks: Math.min(20, Math.max(2, Math.round(Number(item?.marks) || 5))),
    }))
    .filter((item) => item.question && item.modelAnswer)
  if (questions.length === 0) throw new BadOutputError('The AI could not write usable written questions. Try again.')
  return questions
}

/** A mark for one written answer, kept within the question's marks. */
export function parseMark(reply: string, outOf: number): WrittenMark {
  const data = extractJson(reply)
  const score = Math.round(Number(data.score))
  if (!Number.isFinite(score)) throw new BadOutputError('The marking came back without a score. Try again.')
  return {
    score: Math.min(outOf, Math.max(0, score)),
    feedback: text(data.feedback),
    correction: text(data.correction),
    tip: text(data.tip),
  }
}

/** Nigerian university grading: A 70+, B 60–69, C 50–59, D 45–49, E 40–44, F below 40. */
export function gradeFor(percent: number): string {
  if (percent >= 70) return 'A'
  if (percent >= 60) return 'B'
  if (percent >= 50) return 'C'
  if (percent >= 45) return 'D'
  if (percent >= 40) return 'E'
  return 'F'
}

/** Written questions in an exam of this size: about a tenth, at least two. */
export function writtenCountFor(settings: Pick<ExamSettings, 'count' | 'written'>): number {
  return settings.written ? Math.max(2, Math.round(settings.count / 10)) : 0
}

export function questionMarks(question: ExamQuestion): number {
  return question.kind === 'mcq' ? 1 : question.marks
}
