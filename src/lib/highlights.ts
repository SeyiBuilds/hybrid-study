import type { Highlight, HighlightColor, HighlightRect } from './library'

export const HIGHLIGHT_COLORS: Array<{ id: HighlightColor; label: string }> = [
  { id: 'yellow', label: 'Yellow highlighter' },
  { id: 'green', label: 'Green highlighter' },
  { id: 'pink', label: 'Pink highlighter' },
]

/** Background for a highlight drawn over the (always white) PDF page. */
export const highlightFill: Record<HighlightColor, string> = {
  yellow: 'var(--hl-yellow)',
  green: 'var(--hl-green)',
  pink: 'var(--hl-pink)',
}

export function cleanSelectionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Turns a text selection into one rectangle per line, as fractions of the page box,
 * so highlights stay in place at any zoom or screen size.
 */
export function rectsFromRange(range: Range, page: DOMRect): HighlightRect[] {
  const raw = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      left: Math.max(rect.left, page.left),
      right: Math.min(rect.right, page.right),
      top: Math.max(rect.top, page.top),
      bottom: Math.min(rect.bottom, page.bottom),
    }))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
    .sort((a, b) => a.top - b.top || a.left - b.left)

  const lines: typeof raw = []
  for (const rect of raw) {
    const line = lines.find((existing) => {
      const overlap = Math.min(existing.bottom, rect.bottom) - Math.max(existing.top, rect.top)
      return overlap > Math.min(existing.bottom - existing.top, rect.bottom - rect.top) * 0.5
    })
    if (line) {
      line.left = Math.min(line.left, rect.left)
      line.right = Math.max(line.right, rect.right)
      line.top = Math.min(line.top, rect.top)
      line.bottom = Math.max(line.bottom, rect.bottom)
    } else {
      lines.push({ ...rect })
    }
  }

  return lines.map((line) => ({
    x: (line.left - page.left) / page.width,
    y: (line.top - page.top) / page.height,
    w: (line.right - line.left) / page.width,
    h: (line.bottom - line.top) / page.height,
  }))
}

/** The highlight under a point on the page (fractions of the page box), if any. */
export function highlightAt(highlights: Highlight[], x: number, y: number): Highlight | undefined {
  return [...highlights]
    .reverse()
    .find((highlight) => highlight.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h))
}

/** Screen box around a highlight, for placing its toolbar. */
export function highlightBox(highlight: Highlight, page: DOMRect): DOMRect {
  const left = Math.min(...highlight.rects.map((r) => r.x))
  const top = Math.min(...highlight.rects.map((r) => r.y))
  const right = Math.max(...highlight.rects.map((r) => r.x + r.w))
  const bottom = Math.max(...highlight.rects.map((r) => r.y + r.h))
  return new DOMRect(
    page.left + left * page.width,
    page.top + top * page.height,
    (right - left) * page.width,
    (bottom - top) * page.height,
  )
}

export function newId(): string {
  return crypto.randomUUID()
}
