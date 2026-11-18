/**
 * Prompts sent to the models. Kept short and single-turn so they suit Gemini Nano
 * (on-device limit: 9216 tokens) as well as the cloud model.
 */

/** About 1,500 tokens of page text: comfortably inside the on-device limit with room for the answer. */
const MAX_PAGE_CHARS = 6000

function trimPage(text: string): string {
  if (text.length <= MAX_PAGE_CHARS) return text
  return `${text.slice(0, MAX_PAGE_CHARS)}\n[The rest of the page was cut to fit.]`
}

export function askPrompt({
  pageText,
  title,
  page,
  question,
  quote,
}: {
  pageText: string
  title: string
  page: number
  question: string
  quote?: string
}): string {
  return [
    'You help a university student understand their lecture notes.',
    'Answer the question in plain English in at most 120 words. Use short bullet points starting with "- " only if they make the answer clearer.',
    'Base the answer on the page text. If the page does not contain the answer, start with "Not on this page:" and answer briefly from general knowledge.',
    '',
    ...(quote ? ['The student highlighted these words:', '"""', quote.slice(0, 800), '"""', ''] : []),
    `Question: ${question.slice(0, 600)}`,
    '',
    `Notes: ${title}, page ${page}`,
    'Page text:',
    '"""',
    trimPage(pageText),
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
