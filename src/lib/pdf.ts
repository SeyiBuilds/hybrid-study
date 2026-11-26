/**
 * PDF loading, per-page text extraction and page rendering with pdf.js.
 * The worker is bundled with the app (no CDN), so this works offline.
 */
import { getDocument, GlobalWorkerOptions, PDFWorker, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { removeRunningLines, toPageText, type PageText, type RawLine } from './pageText'

GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy }
export { hasUsableText, pageLabel, type PageText } from './pageText'

let sharedWorker: PDFWorker | null = null

/**
 * One pdf.js worker for the whole app, started when the app loads and reused by every
 * document. By default pdf.js downloads a fresh worker each time a document opens, so a
 * dropped connection (or a stopped server) after the app loaded meant no PDF could open.
 */
function pdfWorker(): PDFWorker {
  if (!sharedWorker) {
    const worker = new PDFWorker()
    // If it failed to start (e.g. offline on first load), try again next time.
    worker.promise.catch(() => {
      if (sharedWorker === worker) sharedWorker = null
    })
    sharedWorker = worker
  }
  return sharedWorker
}

/** Starts the PDF worker early, while the app's files are still reachable. */
export function startPdfWorker(): Promise<void> {
  return pdfWorker().promise
}

/** Opens a PDF from bytes. The bytes are copied because pdf.js transfers them to its worker. */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({
    data: new Uint8Array(bytes.slice(0)),
    worker: pdfWorker(),
    // Pages are drawn on the main thread; no separate renderer worker to download.
    disableWorkerRendering: true,
  }).promise
}

/** Releases the document. The shared worker stays alive for the next one. */
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
 * Renders one page at the given CSS width: the image into a canvas (sharp on high-DPI
 * screens) and an invisible, selectable text layer on top, so students can select and
 * highlight words on the page itself.
 * Returns the page scale and a cancel function for when the page changes mid-render.
 */
export function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  textLayerContainer: HTMLElement,
  cssWidth: number,
): { done: Promise<{ scale: number }>; cancel: () => void } {
  let cancelled = false
  const cancellers: Array<() => void> = []

  const done = (async () => {
    const page = await doc.getPage(pageNumber)
    if (cancelled) return { scale: 1 }
    const base = page.getViewport({ scale: 1 })
    const scale = cssWidth / base.width
    // Draw at extra density so small print and formulas stay crisp, but keep the canvas
    // under about 4000 pixels wide so zoomed pages don't use too much memory.
    const wanted = Math.max((window.devicePixelRatio || 1) * 1.5, 2)
    const ratio = Math.max(1, Math.min(wanted, 4096 / cssWidth))
    const viewport = page.getViewport({ scale: scale * ratio })

    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${Math.floor(viewport.width / ratio)}px`
    canvas.style.height = `${Math.floor(viewport.height / ratio)}px`

    const task = page.render({ canvas, viewport })
    cancellers.push(() => task.cancel())
    try {
      await task.promise
    } catch (error) {
      if ((error as { name?: string }).name !== 'RenderingCancelledException') throw error
      return { scale }
    }
    if (cancelled) return { scale }

    // pdf.js sizes the text layer from --total-scale-factor on an ancestor.
    textLayerContainer.replaceChildren()
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textLayerContainer,
      viewport: page.getViewport({ scale }),
    })
    cancellers.push(() => textLayer.cancel())
    await textLayer.render()
    return { scale }
  })()

  return {
    done,
    cancel: () => {
      cancelled = true
      cancellers.forEach((cancel) => cancel())
    },
  }
}
