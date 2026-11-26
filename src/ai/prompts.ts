/**
 * Prompts sent to the models. Kept short and single-turn so they suit Gemini Nano
 * (on-device limit: 9216 tokens) as well as the cloud model.
 */
import type { QuizLevel } from './quiz'
import { ROUTER_DEFAULTS } from './routerConfig'
import type { PageText } from '../lib/pageText'

/** About 1,500 tokens of page text: comfortably inside the on-device limit with room for the answer. */
const MAX_PAGE_CHARS = 6000

/** How formulas should be written so the app can typeset them on their own lines. */
const FORMULA_RULE =
  'Write every formula, equation or calculation step on its own line as LaTeX between $$ and $$, directly under the sentence or bullet it belongs to, never in the middle of a sentence. For example:\n- Weight depends on mass and gravity:\n$$w = mg$$'

function trimPage(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text
  return `${text.slice(0, MAX_PAGE_CHARS)}\n[The rest of the page was cut to fit.]`
}

/** Text from around the document for cross-page questions: nearest pages first, then in page order. */
export function documentContext(pages: PageText[], currentPage: number, maxChars = ROUTER_DEFAULTS.crossPageChars): string {
  const nearestFirst = pages
    .filter((page) => page.text)
    .sort((a, b) => Math.abs(a.number - currentPage) - Math.abs(b.number - currentPage))
  const chosen: PageText[] = []
  let used = 0
  for (const page of nearestFirst) {
    if (used + page.text.length > maxChars) continue
    chosen.push(page)
    used += page.text.length
  }
  return chosen
    .sort((a, b) => a.number - b.number)
    .map((page) => `[Page ${page.number}]\n${page.text}`)
    .join('\n\n')
}

export function askPrompt({
  pageText,
  title,
  page,
  question,
  quote,
  documentText,
}: {
  pageText: string
  title: string
  page: number
  question: string
  quote?: string
  /** Text from several pages, used instead of the current page for cross-page questions. */
  documentText?: string
}): string {
  return [
    'You help a university student understand their lecture notes.',
    'Answer the question in plain English in at most 120 words. Use short bullet points starting with "- " only if they make the answer clearer.',
    'If the answer involves a calculation, show each step and say briefly why it is done.',
    FORMULA_RULE,
    documentText
      ? `Base the answer on the notes below. The student is reading page ${page}. If the notes do not contain the answer, start with "Not in these notes:" and answer briefly from general knowledge.`
      : 'Base the answer on the page text. If the page does not contain the answer, start with "Not on this page:" and answer briefly from general knowledge.',
    '',
    ...(quote ? ['The student highlighted these words:', '"""', quote.slice(0, 800), '"""', ''] : []),
    `Question: ${question.slice(0, 600)}`,
    '',
    `Notes: ${title}${documentText ? '' : `, page ${page}`}`,
    documentText ? 'Notes text:' : 'Page text:',
    '"""',
    documentText ?? trimPage(pageText),
    '"""',
  ].join('\n')
}

const LEVEL_RULES: Record<QuizLevel, string> = {
  easy: 'Make the questions easy: recall of definitions, terms and facts stated in the notes.',
  medium: 'Make the questions medium difficulty: test understanding and simple application, not just recall.',
  hard: 'Make the questions hard: multi-step reasoning, applying formulas to new numbers, comparing ideas and spotting subtle differences. Wrong options should be common mistakes.',
  mixed: 'Mix the difficulty: about a third easy recall, a third testing understanding, and a third hard application or calculation.',
}

const PLAIN_FORMULAS = 'Write formulas in plain text with symbols such as ×, ÷, ², ³, √, ρ, Σ and subscripts like V₁. Do not use LaTeX.'

export function quizPrompt({
  pageText,
  title,
  page,
  count = 5,
  level = 'mixed',
}: {
  pageText: string
  title: string
  page: number
  count?: number
  level?: QuizLevel
}): string {
  return [
    'You write exam practice questions for a university student from their lecture notes.',
    `Write exactly ${count} multiple-choice questions that test understanding of the page below.`,
    LEVEL_RULES[level],
    '- Use only facts stated on the page.',
    '- Give each question 4 short options. Exactly one is correct; the other three must be believable but wrong according to the page.',
    '- "answer" is the letter of the correct option: A, B, C or D.',
    '- "explanation" is one short sentence saying why that answer is correct.',
    `- ${PLAIN_FORMULAS}`,
    '- Do not ask about page numbers, headings or the course title.',
    'Reply with JSON only.',
    '',
    `Notes: ${title}, page ${page}`,
    'Page text:',
    '"""',
    trimPage(pageText),
    '"""',
  ].join('\n')
}

export function summarisePrompt({ pageText, title, page }: { pageText: string; title: string; page: number }): string {
  return [
    'You help a university student revise from their lecture notes.',
    'Summarise the page below in 3 to 5 short bullet points, in plain English.',
    'Keep key terms, definitions, numbers and formulas exactly as written.',
    'Use only information from the page. Do not add an introduction or a conclusion.',
    'Start each bullet with "- ".',
    FORMULA_RULE,
    '',
    `Notes: ${title}, page ${page}`,
    'Page text:',
    '"""',
    trimPage(pageText),
    '"""',
  ].join('\n')
}

function pastQuestionsBlock(past?: string): string[] {
  if (!past) return []
  return [
    'Past exam questions for this course are below. Match their style, structure, wording and difficulty, but write NEW questions about the notes. Never copy a past question.',
    '"""',
    past,
    '"""',
    '',
  ]
}

/** One batch of objective questions for a timed exam. */
export function examMcqPrompt({
  notes,
  title,
  count,
  level,
  past,
  avoid,
}: {
  notes: string
  title: string
  count: number
  level: QuizLevel
  past?: string
  /** Questions already in the exam, so this batch doesn't repeat them. */
  avoid: string[]
}): string {
  return [
    'You set university exam questions from a student\'s lecture notes.',
    `Write exactly ${count} multiple-choice questions on the notes below.`,
    `- ${LEVEL_RULES[level]}`,
    '- Cover different parts of the notes. Do not ask about page numbers, headings or the course title.',
    '- Give each question 4 options. Exactly one is correct; the other three must be believable but wrong, such as common mistakes.',
    '- For calculation questions, change the numbers from the worked examples so the student has to work it out.',
    '- "answer" is the letter of the correct option: A, B, C or D.',
    '- "explanation" is one or two sentences on why the answer is correct, with the working for calculations.',
    '- "tip" is one short tip or trick that helps remember or solve this kind of question.',
    `- ${PLAIN_FORMULAS}`,
    ...(avoid.length ? ['- Do not repeat these questions:', ...avoid.slice(-30).map((q) => `  * ${q.slice(0, 120)}`)] : []),
    'Reply with JSON only.',
    '',
    ...pastQuestionsBlock(past),
    `Notes: ${title}`,
    'Notes text:',
    '"""',
    notes,
    '"""',
  ].join('\n')
}

/** The written (theory) section of a timed exam. */
export function examWrittenPrompt({
  notes,
  title,
  count,
  level,
  past,
}: {
  notes: string
  title: string
  count: number
  level: QuizLevel
  past?: string
}): string {
  return [
    'You set the theory section of a university exam from a student\'s lecture notes.',
    `Write exactly ${count} written questions on the notes below.`,
    `- ${LEVEL_RULES[level]}`,
    '- Each question should need a short explanation, a derivation or a worked calculation, from a few lines to half a page.',
    '- "marks" is what the question is worth, from 5 to 10.',
    '- "modelAnswer" is a complete answer a lecturer would accept, with the working for calculations.',
    '- "keyPoints" lists the 3 to 6 points a marker should look for.',
    `- ${PLAIN_FORMULAS}`,
    'Reply with JSON only.',
    '',
    ...pastQuestionsBlock(past),
    `Notes: ${title}`,
    'Notes text:',
    '"""',
    notes,
    '"""',
  ].join('\n')
}

/** Marking one written answer against the model answer. */
export function markWrittenPrompt({
  question,
  marks,
  modelAnswer,
  keyPoints,
  answer,
}: {
  question: string
  marks: number
  modelAnswer: string
  keyPoints: string[]
  answer: string
}): string {
  return [
    'You are a fair university examiner marking one written answer.',
    `Question (${marks} marks): ${question}`,
    `Model answer: ${modelAnswer}`,
    ...(keyPoints.length ? ['Points to look for:', ...keyPoints.map((point) => `- ${point}`)] : []),
    '',
    'Student\'s answer:',
    '"""',
    answer.slice(0, 4000),
    '"""',
    '',
    `Give marks for each correct point, even if it is worded differently. Give 0 if the answer is blank or unrelated.`,
    `- "score" is the marks awarded, a whole number from 0 to ${marks}.`,
    '- "feedback" is one or two sentences to the student: what they got right and what was missing.',
    '- "correction" is the correct answer in brief, with the working for calculations.',
    '- "tip" is one short tip for answering this kind of question in an exam.',
    `- ${PLAIN_FORMULAS}`,
    'Reply with JSON only.',
  ].join('\n')
}

/** A longer explanation of an exam question the student asked about after marking. */
export function explainExamPrompt({
  question,
  options,
  correct,
  given,
  notes,
}: {
  question: string
  /** Lettered options for objective questions. */
  options?: string[]
  /** The right answer, as text. */
  correct: string
  /** What the student answered, as text, or empty. */
  given: string
  notes: string
}): string {
  return [
    'You are a patient tutor helping a university student understand an exam question they got wrong.',
    `Question: ${question}`,
    ...(options ? options.map((option, index) => `${'ABCD'[index]}. ${option}`) : []),
    `Correct answer: ${correct}`,
    `Student's answer: ${given || '(no answer)'}`,
    '',
    'Explain in simple words why the correct answer is right and where the student probably went wrong.',
    'If it involves a calculation, show each step and say why it is done, and give any tip or shortcut that makes it easier.',
    'At most 180 words. Use short bullet points starting with "- " where they help.',
    FORMULA_RULE,
    '',
    'Relevant notes:',
    '"""',
    trimPage(notes),
    '"""',
  ].join('\n')
}
