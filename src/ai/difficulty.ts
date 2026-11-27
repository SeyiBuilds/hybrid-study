/**
 * Decides whether a question is simple enough for the on-device model. Page summaries
 * and page quizzes are always simple; questions are judged from their wording.
 */
import { ROUTER_DEFAULTS, type RouterConfig } from './routerConfig'

export type Difficulty = 'simple' | 'hard'
export type HardKind = 'multi-step' | 'cross-page' | 'diagram' | 'long'

export interface QuestionDifficulty {
  difficulty: Difficulty
  kind: HardKind | null
}

const CROSS_PAGE = [
  /\b(whole|entire|all(?: of)?(?: the| my)?)\s+(document|notes?|pdf|guide|chapters?|course|book|lectures?|pages)\b/i,
  /\b(other|previous|next|earlier|later|another|following|last)\s+(pages?|sections?|chapters?|topics?|lectures?)\b/i,
  /\bacross\s+(?:the\s+|my\s+)?(pages|chapters|sections|notes|lectures)\b/i,
  /\bpages?\s+\d+\s*(?:and|to|-|–)\s*\d+\b/i,
  /\bthroughout\s+(?:the\s+|my\s+)?(document|notes|guide|course|book)\b/i,
]

const MULTI_STEP = [
  /\bstep[- ]by[- ]step\b/i,
  /\bwalk me through\b/i,
  /\bexplain\s+(why|how)\b/i,
  /\b(derive|prove|proof|solve|calculate|compute|work out|trace)\b/i,
  /\b(compare|contrast|analy[sz]e|evaluate|justify|critically)\b/i,
  /\b(difference|differences|relationship)\s+between\b/i,
  /\b(pros and cons|advantages and disadvantages)\b/i,
]

const DIAGRAM = /\b(diagrams?|draw|sketch|illustrat\w*|flow ?chart|free[- ]body|label(?:led)? figure)\b/i

/** The student asked for a picture, not just words. */
export function wantsDiagram(question: string): boolean {
  return DIAGRAM.test(question)
}

export function classifyQuestion(question: string, config: RouterConfig = ROUTER_DEFAULTS): QuestionDifficulty {
  if (CROSS_PAGE.some((pattern) => pattern.test(question))) return { difficulty: 'hard', kind: 'cross-page' }
  if (wantsDiagram(question)) return { difficulty: 'hard', kind: 'diagram' }
  if (MULTI_STEP.some((pattern) => pattern.test(question))) return { difficulty: 'hard', kind: 'multi-step' }
  const words = question.match(/\S+/g)?.length ?? 0
  if (words >= config.hardQuestionWords) return { difficulty: 'hard', kind: 'long' }
  return { difficulty: 'simple', kind: null }
}
