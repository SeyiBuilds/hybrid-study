/**
 * The quiz format: the schema both models must follow, and the checks every quiz has to
 * pass before a student sees it. The schema is a strong request, not a guarantee, so the
 * output is always parsed and validated here.
 */
import { Schema } from 'firebase/ai'
import { BadOutputError } from './errors'
import type { PageText } from '../lib/pageText'

export const QUESTION_COUNT = 5
const MIN_USABLE_QUESTIONS = 3
const OPTION_COUNT = 4
const LETTERS = ['A', 'B', 'C', 'D']

/** A page needs this many words of real content (not headings or contents entries) for a quiz. */
const MIN_QUIZ_WORDS = 40

export interface QuizQuestion {
  question: string
  options: string[]
  /** Index of the correct option. */
  correct: number
  explanation: string
}

/** Passed as `responseConstraint` on-device and `responseSchema` in the cloud. */
export const quizSchema = Schema.object({
  properties: {
    questions: Schema.array({
      minItems: QUESTION_COUNT,
      maxItems: QUESTION_COUNT,
      items: Schema.object({
        properties: {
          question: Schema.string(),
          options: Schema.array({ items: Schema.string(), minItems: OPTION_COUNT, maxItems: OPTION_COUNT }),
          answer: Schema.enumString({ enum: LETTERS }),
          explanation: Schema.string(),
        },
      }),
    }),
  },
})

export function hasEnoughForQuiz(page: PageText): boolean {
  const words = page.blocks
    .filter((block) => block.kind === 'paragraph' || block.kind === 'list')
    .reduce((total, block) => total + (block.text.match(/\S+/g)?.length ?? 0), 0)
  return words >= MIN_QUIZ_WORDS
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function cleanOption(value: unknown): string {
  return cleanText(value).replace(/^\(?[A-Da-d][.):]\s+/, '')
}

/** The JSON object in the model's reply, even if it came wrapped in a code fence or extra words. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new BadOutputError('The questions came back in the wrong format. Try again.')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new BadOutputError('The questions came back incomplete. Try again.')
  }
}

function correctIndex(answer: unknown, options: string[]): number {
  const text = cleanText(answer)
  const letter = LETTERS.indexOf(text.charAt(0).toUpperCase())
  if (letter !== -1 && (text.length === 1 || /^[A-Da-d][\s.):]/.test(text))) return letter
  return options.findIndex((option) => option.toLowerCase() === text.toLowerCase())
}

/** Options that point at other options ("Both A and B") must stay in their written order. */
function refersToOtherOptions(options: string[]): boolean {
  return options.some((option) => /\b(all|none|both|neither)\b.*\b(above|these|[A-D])\b|\b[A-D] (and|or) [A-D]\b/i.test(option))
}

function shuffled(question: QuizQuestion, random: () => number): QuizQuestion {
  if (refersToOtherOptions(question.options)) return question
  const order = question.options.map((_, index) => index)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correct: order.indexOf(question.correct),
  }
}

/**
 * Turns the model's reply into checked questions. Unusable questions are dropped;
 * the whole reply is rejected if too few remain. Options are shuffled because small
 * models tend to put the right answer first.
 */
export function parseQuiz(text: string, random: () => number = Math.random): QuizQuestion[] {
  const data = extractJson(text) as { questions?: unknown }
  const raw = Array.isArray(data.questions) ? data.questions : []
  const seen = new Set<string>()
  const questions: QuizQuestion[] = []

  for (const item of raw as Array<Record<string, unknown>>) {
    const question = cleanText(item?.question)
    const options = Array.isArray(item?.options) ? item.options.map(cleanOption) : []
    const distinct = new Set(options.map((option) => option.toLowerCase()))
    const correct = correctIndex(item?.answer, options)
    const key = question.toLowerCase()
    if (!question || seen.has(key)) continue
    if (options.length !== OPTION_COUNT || options.some((option) => !option) || distinct.size !== OPTION_COUNT) continue
    if (correct < 0 || correct >= OPTION_COUNT) continue
    seen.add(key)
    questions.push(shuffled({ question, options, correct, explanation: cleanText(item?.explanation) }, random))
  }

  if (questions.length < MIN_USABLE_QUESTIONS) {
    throw new BadOutputError('The AI could not write usable questions for this page. Try again.')
  }
  return questions.slice(0, QUESTION_COUNT)
}
