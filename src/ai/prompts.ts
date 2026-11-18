/**
 * Prompts sent to the models. Kept short and single-turn so they suit Gemini Nano
 * (on-device limit: 9216 tokens) as well as the cloud model.
 */
import { ROUTER_DEFAULTS } from './routerConfig'
import type { PageText } from '../lib/pageText'

/** About 1,500 tokens of page text: comfortably inside the on-device limit with room for the answer. */
const MAX_PAGE_CHARS = 6000

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

export function quizPrompt({ pageText, title, page }: { pageText: string; title: string; page: number }): string {
  return [
    'You write exam practice questions for a university student from their lecture notes.',
    'Write exactly 5 multiple-choice questions that test understanding of the page below.',
    '- Use only facts stated on the page.',
    '- Give each question 4 short options. Exactly one is correct; the other three must be believable but wrong according to the page.',
    '- "answer" is the letter of the correct option: A, B, C or D.',
    '- "explanation" is one short sentence saying why that answer is correct.',
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
    '',
    `Notes: ${title}, page ${page}`,
    'Page text:',
    '"""',
    trimPage(pageText),
    '"""',
  ].join('\n')
}
