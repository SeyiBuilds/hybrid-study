/**
 * PDF loading, per-page text extraction and page rendering with pdf.js.
 * The worker is bundled with the app (no CDN), so this works offline.
 */
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { removeRunningLines, toPageText, type PageText, type RawLine } from './pageText'

GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy }
export { hasUsableText, pageLabel, type PageText } from './pageText'

/** Opens a PDF from bytes. The bytes are copied because pdf.js transfers them to its worker. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
}

/** Releases the document and its worker resources. */
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy()
}

/**
 * Groups a page's text items into visual lines by their position, so text that pdf.js
 * returns in pieces (contents entries, dot leaders, page numbers) stays on one line.
 */
async function readLines(doc: PDFDocumentProxy, pageNumber: number): Promise<RawLine[]> {
  const page = await doc.getPage(pageNumber)
  const content = await page.getTextContent()
  const lines: RawLine[] = []
  let current: RawLine | null = null

  for (const item of content.items) {
    if (!('str' in item)) continue
    const { str, transform, width, height } = item as TextItem
    if (!str) continue
    const x = transform[4] as number
    const y = transform[5] as number
    const size = Math.hypot(transform[2] as number, transform[3] as number) || height || 10

    if (current && Math.abs(y - current.y) <= Math.max(current.size, size) * 0.45) {
      const gap = x - current.endX
      if (gap > size * 0.18 && !current.text.endsWith(' ') && !str.startsWith(' ')) current.text += ' '
      current.text += str
      current.endX = Math.max(current.endX, x + width)
      current.size = Math.max(current.size, size)
    } else {
      if (current) lines.push(current)
      current = { text: str, x, endX: x + width, y, size }
    }
  }
  if (current) lines.push(current)
  page.cleanup()
  return lines.filter((line) => line.text.trim())
}

/** Extracts clean text for every page, reporting progress as pages are read. */
export async function extractPages(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
): Promise<PageText[]> {
  const raw: RawLine[][] = []
  for (let number = 1; number <= doc.numPages; number++) {
    raw.push(await readLines(doc, number))
    onProgress?.(number, doc.numPages)
  }
  return removeRunningLines(raw).map((lines, index) => toPageText(index + 1, lines))
}

/**
 * Renders one page into a canvas at the given CSS width, sharp on high-DPI screens.
 * Returns a cancel function for when the page changes before rendering finishes.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
): { done: Promise<void>; cancel: () => void } {
  let cancelled = false
  let cancelRender: (() => void) | null = null

  const done = (async () => {
    const page = await doc.getPage(pageNumber)
    if (cancelled) return
    const base = page.getViewport({ scale: 1 })
    const scale = cssWidth / base.width
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const viewport = page.getViewport({ scale: scale * ratio })

    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`

    const task = page.render({ canvas, viewport })
    cancelRender = () => task.cancel()
    try {
      await task.promise
    } catch (error) {
      if ((error as { name?: string }).name !== 'RenderingCancelledException') throw error
    }
  })()

  return {
    done,
    cancel: () => {
      cancelled = true
      cancelRender?.()
    },
  }
}
