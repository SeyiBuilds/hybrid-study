/**
 * Turns the raw text lines of each PDF page into clean, readable blocks:
 * running headers, footers and page numbers are removed, wrapped lines are
 * joined back into paragraphs, and headings, list items and contents entries
 * are recognised. The same clean text is what the AI reads.
 */

/** Bump when extraction changes, so stored documents are re-extracted on open. */
export const EXTRACT_VERSION = 2

/** One visual line of text on a page, in PDF units (y grows upwards). */
export interface RawLine {
  text: string
  x: number
  endX: number
  y: number
  /** Font size of the line's largest text. */
  size: number
}

export type BlockKind = 'heading' | 'paragraph' | 'list' | 'entry'

export interface TextBlock {
  kind: BlockKind
  text: string
  /** For contents entries: the value on the right, usually a page number. */
  value?: string
  /** True when there is visible space before this block (a new paragraph rather than the next line). */
  gapBefore: boolean
}

export interface PageText {
  /** 1-based page number. */
  number: number
  /** Clean text for the AI, blocks separated by line breaks. */
  text: string
  words: number
  blocks: TextBlock[]
}

const LEADER = /\s*(?:[.·_…]\s?){4,}\s*/g
const PAGE_NUMBER = /^(?:page\s*)?[-–(]?\s*\d{1,4}\s*[-–)]?(?:\s*(?:of|\/)\s*\d{1,4})?$/i
const LIST_MARKER = /^(?:[•▪◦●○■□➢►✓\-–*]|\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}[.)])\s+\S/i
const ENTRY = /^(.{2,}?)\s…\s(\S{1,8})$/

function clean(text: string): string {
  return text.replace(LEADER, ' … ').replace(/\s+/g, ' ').trim()
}

function edgeKey(text: string): string {
  return text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()
}

/** Indexes of the top and bottom few lines of a page, where headers and footers live. */
function edgeIndexes(lines: RawLine[], count = 3): Set<number> {
  const byHeight = lines.map((line, index) => ({ y: line.y, index })).sort((a, b) => b.y - a.y)
  const picked = [...byHeight.slice(0, count), ...byHeight.slice(-count)]
  return new Set(picked.map((entry) => entry.index))
}

/**
 * Removes lines repeated at the top or bottom of many pages (running headers and footers)
 * and bare page numbers at the edges.
 */
export function removeRunningLines(pages: RawLine[][]): RawLine[][] {
  const edges = pages.map((lines) => edgeIndexes(lines))
  const counts = new Map<string, number>()
  pages.forEach((lines, p) => {
    const seen = new Set<string>()
    edges[p].forEach((i) => seen.add(edgeKey(lines[i].text)))
    seen.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))
  })
  const threshold = pages.length >= 3 ? Math.max(2, Math.ceil(pages.length * 0.4)) : Number.POSITIVE_INFINITY

  return pages.map((lines, p) =>
    lines.filter((line, i) => {
      if (!edges[p].has(i)) return true
      const text = line.text.trim()
      if (PAGE_NUMBER.test(text)) return false
      return (counts.get(edgeKey(text)) ?? 0) < threshold
    }),
  )
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** Body text size: the size that most of the page's characters are set in. */
function bodySize(lines: RawLine[]): number {
  const weights = new Map<number, number>()
  for (const line of lines) {
    const size = Math.round(line.size * 2) / 2
    weights.set(size, (weights.get(size) ?? 0) + line.text.length)
  }
  let best = 0
  let bestWeight = -1
  weights.forEach((weight, size) => {
    if (weight > bestWeight) {
      best = size
      bestWeight = weight
    }
  })
  return best || 10
}

function appendLine(block: TextBlock, text: string) {
  if (/[a-z]-$/.test(block.text) && /^[a-z]/.test(text)) {
    block.text = block.text.slice(0, -1) + text
  } else {
    block.text = `${block.text} ${text}`
  }
}

/** Rebuilds headings, paragraphs, list items and contents entries from a page's lines. */
export function buildBlocks(lines: RawLine[]): TextBlock[] {
  const usable = lines.filter((line) => clean(line.text))
  if (usable.length === 0) return []

  const body = bodySize(usable)
  const gaps: number[] = []
  for (let i = 1; i < usable.length; i++) {
    const gap = usable[i - 1].y - usable[i].y
    if (gap > 0 && Math.abs(usable[i].size - body) < body * 0.15) gaps.push(gap)
  }
  const lineGap = median(gaps) || body * 1.25
  const fullWidth = Math.max(...usable.map((line) => line.endX - line.x))

  const blocks: TextBlock[] = []
  let previous: RawLine | null = null

  for (const line of usable) {
    const text = clean(line.text)
    const gap = previous ? previous.y - line.y : 0
    const spaced = previous !== null && (gap > lineGap * 1.45 || gap < -lineGap)
    const current = blocks[blocks.length - 1]
    const isHeading = line.size >= body * 1.18 && text.length <= 140
    const entry = text.match(ENTRY)
    const isList = LIST_MARKER.test(text)
    // A line well short of the full width usually ends its paragraph.
    const previousEndedShort =
      previous !== null &&
      previous.endX - previous.x < fullWidth * 0.72 &&
      !/[-,;:(]$/.test(previous.text.trim())

    if (isHeading) {
      if (current?.kind === 'heading' && !spaced && previous && Math.abs(previous.size - line.size) < 0.5) {
        appendLine(current, text)
      } else {
        blocks.push({ kind: 'heading', text, gapBefore: blocks.length > 0 })
      }
    } else if (entry) {
      blocks.push({ kind: 'entry', text: entry[1], value: entry[2], gapBefore: spaced })
    } else if (isList) {
      blocks.push({ kind: 'list', text, gapBefore: spaced })
    } else if (current && (current.kind === 'paragraph' || current.kind === 'list') && !spaced && !previousEndedShort) {
      appendLine(current, text)
    } else {
      blocks.push({
        kind: 'paragraph',
        text,
        gapBefore: blocks.length > 0 && (spaced || current?.kind === 'heading' || current?.kind === 'entry'),
      })
    }
    previous = line
  }
  return blocks
}

export function blocksToText(blocks: TextBlock[]): string {
  return blocks
    .map((block, index) => {
      const content = block.kind === 'entry' ? `${block.text} … ${block.value}` : block.text
      if (index === 0) return content
      return (block.gapBefore ? '\n\n' : '\n') + content
    })
    .join('')
}

export function countWords(text: string): number {
  return text.match(/\S+/g)?.length ?? 0
}

export function toPageText(number: number, lines: RawLine[]): PageText {
  const blocks = buildBlocks(lines)
  const text = blocksToText(blocks)
  return { number, text, words: countWords(text), blocks }
}

/** Below this many characters a page is treated as having no selectable text (likely a scan). */
const MIN_TEXT_CHARS = 20

export function hasUsableText(page: PageText): boolean {
  return page.text.length >= MIN_TEXT_CHARS
}

/** A short label for the page index: the first heading, or the opening words. */
export function pageLabel(page: PageText): string {
  if (!hasUsableText(page)) return 'No text on this page'
  const heading = page.blocks.find((block) => block.kind === 'heading')
  const source = heading ?? page.blocks[0]
  return source.text.slice(0, 70)
}
