/**
 * PDF loading, per-page text extraction and page rendering with pdf.js.
 * The worker is bundled with the app (no CDN), so this works offline.
 */
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy }

export interface PageText {
  /** 1-based page number, as printed in the PDF viewer. */
  number: number
  text: string
  words: number
}

/** Below this many characters a page is treated as having no selectable text (likely a scan). */
const MIN_TEXT_CHARS = 20

export function hasUsableText(page: PageText): boolean {
  return page.text.length >= MIN_TEXT_CHARS
}

/** Opens a PDF from bytes. The bytes are copied because pdf.js transfers them to its worker. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
}

/** Releases the document and its worker resources. */
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy()
}

function normalise(raw: string): string {
  return raw
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function countWords(text: string): number {
  const matches = text.match(/\S+/g)
  return matches ? matches.length : 0
}

/** Extracts the text of every page, reporting progress as pages complete. */
export async function extractPages(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number)
    const content = await page.getTextContent()
    let raw = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      const textItem = item as TextItem
      raw += textItem.str
      if (textItem.hasEOL) raw += '\n'
    }
    page.cleanup()
    const text = normalise(raw)
    pages.push({ number, text, words: countWords(text) })
    onProgress?.(number, doc.numPages)
  }
  return pages
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
