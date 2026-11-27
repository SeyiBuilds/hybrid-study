/**
 * Timed exams. Questions are written in batches through the router (an exam is a hard,
 * long task, so it prefers the cloud), objective answers are marked on the device, and
 * written answers are marked by the AI against a model answer.
 */
import { getOnDeviceStatus, type OutputFormat, type Target } from './client'
import { BadOutputError, DeferredError } from './errors'
import {
  parseMark,
  parseWritten,
  questionMarks,
  writtenCountFor,
  type Exam,
  type ExamQuestion,
  type ExamSettings,
  type WrittenMark,
} from './examFormat'
import { runAiJob } from './jobs'
import { examMcqPrompt, examWrittenPrompt, explainExamPrompt, markWrittenPrompt } from './prompts'
import { parseQuiz } from './quiz'
import { ask, type AskResult, type RouteDecision } from './router'
import { getExam, saveExam } from '../lib/library'
import { hasUsableText, type PageText } from '../lib/pageText'

/** Objective questions asked for in one request. */
const BATCH = 10
/** Notes sent with each batch: more in the cloud, less to fit Gemini Nano's limit on-device. */
const CLOUD_NOTES_CHARS = 24000
const DEVICE_NOTES_CHARS = 7000
const PAST_CHARS = 2500

export class ExamCancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'ExamCancelled'
  }
}

export interface WriteProgress {
  done: number
  total: number
  target: Target | null
}

function trim(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[The rest was cut to fit.]`
}

/** Splits the chosen pages into runs of roughly equal length, one per batch, in page order. */
function splitNotes(pages: PageText[], parts: number): string[] {
  const total = pages.reduce((sum, page) => sum + page.text.length, 0)
  const per = total / Math.max(1, parts)
  const out: string[] = []
  let current: string[] = []
  let size = 0
  for (const page of pages) {
    current.push(`[Page ${page.number}]\n${page.text}`)
    size += page.text.length
    if (size >= per && out.length < parts - 1) {
      out.push(current.join('\n\n'))
      current = []
      size = 0
    }
  }
  if (current.length) out.push(current.join('\n\n'))
  return out
}

/** A sample from across all the chosen pages, for the written section. */
function spreadSample(parts: string[], max: number): string {
  const each = Math.floor(max / Math.max(1, parts.length))
  return parts.map((part) => part.slice(0, each)).join('\n\n')
}

function notesFor(text: string, decision: RouteDecision): string {
  return trim(text, decision.target === 'in_cloud' ? CLOUD_NOTES_CHARS : DEVICE_NOTES_CHARS)
}

/**
 * Asks through the router; when it would wait for a connection but this laptop can
 * answer, it answers here instead (for marking, where waiting would leave the student
 * without a result).
 */
async function askOrDevice(
  prompt: string | ((decision: RouteDecision) => string),
  options: { task: 'exam' | 'marking'; format: OutputFormat; force?: Target; onDecision?: (decision: RouteDecision) => void },
  deviceFallback: boolean,
): Promise<AskResult> {
  const run = (force?: Target) =>
    ask(prompt, { task: options.task, difficulty: 'hard', format: options.format, force, onText: () => {}, onDecision: options.onDecision })
  try {
    return await run(options.force)
  } catch (error) {
    if (!(error instanceof DeferredError) || !deviceFallback || options.force) throw error
    if ((await getOnDeviceStatus()) !== 'available') throw error
    return run('on_device')
  }
}

export async function writeExam({
  documentId,
  title,
  pages,
  settings,
  past,
  force,
  onProgress,
  isCancelled,
}: {
  documentId: string
  title: string
  pages: PageText[]
  settings: ExamSettings
  past?: string
  force?: Target
  onProgress: (progress: WriteProgress) => void
  isCancelled: () => boolean
}): Promise<Exam> {
  const chosen = pages.filter((page) => page.number >= settings.fromPage && page.number <= settings.toPage && hasUsableText(page))
  if (chosen.length === 0) throw new BadOutputError('These pages have no text to set questions from. Choose pages with text.')

  const writtenCount = writtenCountFor(settings)
  const objectiveCount = settings.count - writtenCount
  const parts = splitNotes(chosen, Math.ceil(objectiveCount / BATCH))
  const pastText = settings.usePast && past ? trim(past, PAST_CHARS) : undefined
  const source = { device: 0, cloud: 0, totalMs: 0, bytes: 0 }
  const startedAt = Date.now()
  const objective: Array<Extract<ExamQuestion, { kind: 'mcq' }>> = []
  const written: Array<Extract<ExamQuestion, { kind: 'written' }>> = []
  const seen = new Set<string>()
  let target: Target | null = null
  const report = () => onProgress({ done: objective.length + written.length, total: settings.count, target })

  const run = async (prompt: (decision: RouteDecision) => string, format: OutputFormat) => {
    if (isCancelled()) throw new ExamCancelled()
    const result = await askOrDevice(prompt, {
      task: 'exam',
      format,
      force,
      onDecision: (decision) => {
        target = decision.target
        report()
      },
    }, false)
    if (result.source === 'on_device') source.device += 1
    else source.cloud += 1
    source.bytes += result.bytes
    if (isCancelled()) throw new ExamCancelled()
    return result
  }

  // Objective section, batch by batch across the notes. A batch that comes back unusable
  // is simply asked again from the next part of the notes.
  for (let attempt = 0; objective.length < objectiveCount && attempt < parts.length + 4; attempt++) {
    const need = Math.min(BATCH, objectiveCount - objective.length)
    const part = parts[attempt % parts.length]
    try {
      const result = await run(
        (decision) =>
          examMcqPrompt({
            notes: notesFor(part, decision),
            title,
            count: need,
            level: settings.level,
            past: pastText,
            avoid: objective.map((question) => question.question),
          }),
        'quiz',
      )
      for (const question of parseQuiz(result.text, Math.random, need, 1)) {
        const key = question.question.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        objective.push({ kind: 'mcq', ...question })
        if (objective.length >= objectiveCount) break
      }
    } catch (error) {
      if (!(error instanceof BadOutputError)) throw error
    }
    report()
  }
  if (objective.length < Math.ceil(objectiveCount / 2)) {
    throw new BadOutputError('The AI could not write enough questions from these pages. Try again, or choose more pages.')
  }

  // Written section, from a sample of all the chosen pages.
  for (let attempt = 0; written.length < writtenCount && attempt < 2; attempt++) {
    try {
      const result = await run(
        (decision) =>
          examWrittenPrompt({
            notes: spreadSample(parts, decision.target === 'in_cloud' ? CLOUD_NOTES_CHARS : DEVICE_NOTES_CHARS),
            title,
            count: writtenCount - written.length,
            level: settings.level,
            past: pastText,
          }),
        'written',
      )
      written.push(...parseWritten(result.text).slice(0, writtenCount - written.length))
    } catch (error) {
      if (!(error instanceof BadOutputError)) throw error
    }
    report()
  }
  if (writtenCount > 0 && written.length === 0) {
    throw new BadOutputError('The AI could not write the written questions. Try again.')
  }

  const questions: ExamQuestion[] = [...objective, ...written]
  const exam: Exam = {
    id: crypto.randomUUID(),
    documentId,
    title,
    settings: { ...settings, count: questions.length },
    questions,
    answers: questions.map(() => null),
    startedAt: null,
    endsAt: null,
    submittedAt: null,
    marks: questions.map(() => null),
    markedAt: null,
    score: null,
    outOf: null,
    explanations: {},
    source: { ...source, totalMs: Date.now() - startedAt },
    createdAt: Date.now(),
  }
  await saveExam(exam)
  return exam
}

/** The same questions again, with a fresh timer and no answers. */
export async function retakeExam(exam: Exam): Promise<Exam> {
  const copy: Exam = {
    ...exam,
    id: crypto.randomUUID(),
    answers: exam.questions.map(() => null),
    startedAt: null,
    endsAt: null,
    submittedAt: null,
    marks: exam.questions.map(() => null),
    markedAt: null,
    score: null,
    outOf: null,
    explanations: {},
    createdAt: Date.now(),
  }
  await saveExam(copy)
  return copy
}

async function markOne(question: Extract<ExamQuestion, { kind: 'written' }>, answer: string, force?: Target): Promise<WrittenMark> {
  const prompt = markWrittenPrompt({ ...question, answer })
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await askOrDevice(prompt, { task: 'marking', format: 'marking', force }, true)
      return parseMark(result.text, question.marks)
    } catch (error) {
      if (!(error instanceof BadOutputError) || attempt >= 1) throw error
    }
  }
}

export function objectiveScore(exam: Exam): { score: number; outOf: number } {
  let score = 0
  let outOf = 0
  exam.questions.forEach((question, index) => {
    if (question.kind !== 'mcq') return
    outOf += 1
    if (exam.answers[index] === question.correct) score += 1
  })
  return { score, outOf }
}

/**
 * Marks a submitted exam: objective questions straight away, written answers one by one
 * through the AI (progress is saved, so a dropped connection doesn't lose finished marks).
 */
export async function markExam(
  exam: Exam,
  { force, onProgress }: { force?: Target; onProgress: (done: number, total: number) => void },
): Promise<Exam> {
  const marks = [...exam.marks]
  const writtenIndexes = exam.questions.flatMap((question, index) => (question.kind === 'written' ? [index] : []))
  let done = 0
  onProgress(done, writtenIndexes.length)
  for (const index of writtenIndexes) {
    const question = exam.questions[index] as Extract<ExamQuestion, { kind: 'written' }>
    if (!marks[index]) {
      const given = exam.answers[index]
      const answer = typeof given === 'string' ? given.trim() : ''
      marks[index] = answer
        ? await markOne(question, answer, force)
        : { score: 0, feedback: 'No answer was given.', correction: question.modelAnswer, tip: '' }
      await saveExam({ ...exam, marks })
    }
    done += 1
    onProgress(done, writtenIndexes.length)
  }
  const objective = objectiveScore(exam)
  const writtenScore = writtenIndexes.reduce((sum, index) => sum + (marks[index]?.score ?? 0), 0)
  const outOf = exam.questions.reduce((sum, question) => sum + questionMarks(question), 0)
  const marked: Exam = { ...exam, marks, markedAt: Date.now(), score: objective.score + writtenScore, outOf }
  await saveExam(marked)
  return marked
}

/** The pages that share the most words with a question: context for explaining it. */
export function relevantNotes(pages: PageText[], question: string): string {
  const words = new Set(question.toLowerCase().match(/[a-z]{4,}/g) ?? [])
  return pages
    .filter(hasUsableText)
    .map((page) => ({ page, hits: (page.text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((word) => words.has(word)).length }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map(({ page }) => `[Page ${page.number}]\n${page.text}`)
    .join('\n\n')
}

export function explainJobKey(examId: string, index: number): string {
  return `exam-explain:${examId}:${index}`
}

/** A longer explanation of one question, saved with the exam. */
export function explainExamQuestion(exam: Exam, index: number, pages: PageText[], force?: Target): Promise<void> {
  const question = exam.questions[index]
  const given = exam.answers[index]
  const prompt = (decision: RouteDecision) =>
    question.kind === 'mcq'
      ? explainExamPrompt({
          diagram: decision.target === 'in_cloud' ? 'auto' : 'off',
          question: question.question,
          options: question.options,
          correct: `${'ABCD'[question.correct]}. ${question.options[question.correct]}`,
          given: typeof given === 'number' ? `${'ABCD'[given]}. ${question.options[given]}` : '',
          notes: relevantNotes(pages, question.question),
        })
      : explainExamPrompt({
          diagram: decision.target === 'in_cloud' ? 'auto' : 'off',
          question: question.question,
          correct: question.modelAnswer,
          given: typeof given === 'string' ? given : '',
          notes: relevantNotes(pages, question.question),
        })
  return runAiJob<string, undefined>({
    key: explainJobKey(exam.id, index),
    prompt,
    task: 'ask',
    difficulty: 'hard',
    force,
    meta: undefined,
    save: async (result) => {
      const text = result.text.trim()
      const fresh = (await getExam(exam.id)) ?? exam
      await saveExam({ ...fresh, explanations: { ...fresh.explanations, [index]: text } })
      return text
    },
  })
}
