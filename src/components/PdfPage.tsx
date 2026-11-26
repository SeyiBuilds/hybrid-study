import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Highlight, HighlightRect } from '../lib/library'
import { cleanSelectionText, highlightAt, highlightBox, highlightFill, rectsFromRange } from '../lib/highlights'
import { renderPage, type PDFDocumentProxy } from '../lib/pdf'

export interface PageSelection {
  text: string
  rects: HighlightRect[]
  /** Screen box of the selection, for placing the toolbar. */
  anchor: DOMRect
}

/**
 * One PDF page: the rendered image, the student's highlights drawn over it, and an
 * invisible text layer on top so words can be selected like in any PDF reader.
 */
export function PdfPage({
  pdf,
  pageNumber,
  highlights,
  flashId,
  zoom,
  onSelection,
  onHighlightClick,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  /** Size relative to the page fitting the reading area's width. */
  zoom: number
  highlights: Highlight[]
  /** A highlight to draw attention to (e.g. picked from the study sheet). */
  flashId: string | null
  onSelection: (selection: PageSelection | null) => void
  onHighlightClick: (highlight: Highlight, anchor: DOMRect) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    // ResizeObserver already batches changes once per frame.
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(Math.floor(entry.contentRect.width), 1100)))
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const text = textRef.current
    const page = pageRef.current
    if (!canvas || !text || !page || width === 0) return
    setRendering(true)
    setError(null)
    const job = renderPage(pdf, pageNumber, canvas, text, Math.floor(width * zoom))
    job.done
      .then(({ scale }) => {
        page.style.setProperty('--total-scale-factor', String(scale))
        setRendering(false)
      })
      .catch(() => {
        setError('This page could not be drawn.')
        setRendering(false)
      })
    return () => job.cancel()
  }, [pdf, pageNumber, width, zoom])

  // Report finished selections inside the text layer; clear when the selection collapses.
  useEffect(() => {
    const evaluate = () => {
      const selection = document.getSelection()
      const layer = textRef.current
      const page = pageRef.current
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !layer || !page) return
      const range = selection.getRangeAt(0)
      if (!layer.contains(range.commonAncestorContainer)) return
      const text = cleanSelectionText(range.toString())
      if (text.length < 2) return
      const rects = rectsFromRange(range, page.getBoundingClientRect())
      if (rects.length === 0) return
      onSelection({ text, rects, anchor: range.getBoundingClientRect() })
    }
    const onRelease = () => window.setTimeout(evaluate, 0)
    const onChange = () => {
      const selection = document.getSelection()
      if (!selection || selection.isCollapsed) onSelection(null)
    }
    document.addEventListener('pointerup', onRelease)
    document.addEventListener('keyup', onRelease)
    document.addEventListener('selectionchange', onChange)
    return () => {
      document.removeEventListener('pointerup', onRelease)
      document.removeEventListener('keyup', onRelease)
      document.removeEventListener('selectionchange', onChange)
    }
  }, [onSelection])

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const selection = document.getSelection()
    if (selection && !selection.isCollapsed) return
    const page = pageRef.current
    if (!page) return
    const box = page.getBoundingClientRect()
    const hit = highlightAt(highlights, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
    if (hit) onHighlightClick(hit, highlightBox(hit, box))
  }

  return (
    <div ref={wrapRef} className={`w-full shrink-0 overflow-y-hidden pb-3 ${zoom > 1 ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
      <div
        ref={pageRef}
        onClick={onClick}
        className="relative mx-auto w-fit"
        style={{ '--scale-round-x': '1px', '--scale-round-y': '1px' } as CSSProperties}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className={`block bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_6px_18px_-10px_rgb(0_0_0/0.45)] transition-opacity duration-150 ${
            rendering ? 'opacity-60' : 'opacity-100'
          }`}
        />
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {highlights.map((highlight) =>
            highlight.rects.map((rect, index) => (
              <div
                key={`${highlight.id}-${index}`}
                className={`absolute rounded-[2px] mix-blend-multiply ${highlight.id === flashId ? 'highlight-flash' : ''}`}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                  background: highlightFill[highlight.color],
                }}
              />
            )),
          )}
        </div>
        <div ref={textRef} className="textLayer" aria-label={`Text of page ${pageNumber}`} />
        {error && <p className="absolute inset-x-0 top-8 text-center text-sm text-margin">{error}</p>}
      </div>
    </div>
  )
}
