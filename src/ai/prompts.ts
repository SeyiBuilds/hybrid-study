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
