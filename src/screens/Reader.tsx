import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getContent, getSummary, touchDocument, type DocumentContent, type DocumentSummary } from '../lib/library'
import { closePdf, hasUsableText, openPdf, renderPage, type PageText, type PDFDocumentProxy } from '../lib/pdf'
import { plural } from '../lib/format'
import { navigate, routes } from '../lib/useHashRoute'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; summary: DocumentSummary; content: DocumentContent; pdf: PDFDocumentProxy }

function useDocument(id: string): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null
    ;(async () => {
      const [summary, content] = await Promise.all([getSummary(id), getContent(id)])
      if (cancelled) return
      if (!summary || !content) {
        setState({ kind: 'missing' })
        return
      }
      pdf = await openPdf(content.data)
      if (cancelled) {
        void closePdf(pdf)
        return
      }
      setState({ kind: 'ready', summary, content, pdf })
    })().catch((error: Error) => {
      if (!cancelled) setState({ kind: 'failed', message: error.message })
    })
    return () => {
      cancelled = true
      if (pdf) void closePdf(pdf)
    }
  }, [id])

  return state
}

function snippet(page: PageText): string {
  if (!hasUsableText(page)) return 'No text on this page'
  return page.text.replace(/\s+/g, ' ').slice(0, 60)
}

/** Renders the current PDF page at the width of its column. */
function PageCanvas({ pdf, pageNumber }: { pdf: PDFDocumentProxy; pageNumber: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(Math.min(Math.floor(entry.contentRect.width), 900)))
    })
    observer.observe(wrap)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    setRendering(true)
    setError(null)
    const job = renderPage(pdf, pageNumber, canvas, width)
    job.done
      .then(() => setRendering(false))
      .catch(() => {
        setError('This page could not be drawn.')
        setRendering(false)
      })
    return () => job.cancel()
  }, [pdf, pageNumber, width])

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative mx-auto w-fit">
        <canvas
          ref={canvasRef}
          aria-label={`Page ${pageNumber}`}
          className={`block bg-white shadow-[0_1px_0_var(--color-rule),0_22px_48px_-28px_rgb(24_40_72/0.55)] transition-opacity duration-150 ${
            rendering ? 'opacity-60' : 'opacity-100'
          }`}
        />
        {error && <p className="absolute inset-x-0 top-8 text-center text-sm text-margin">{error}</p>}
      </div>
    </div>
  )
}

function PageTextSheet({ page }: { page: PageText }) {
  const usable = hasUsableText(page)
  const paragraphs = useMemo(() => page.text.split(/\n{2,}/).filter(Boolean), [page.text])

  return (
    <article className="ruled relative min-h-full pb-[calc(var(--line)*3)]" aria-label={`Text of page ${page.number}`}>
      <div className="relative" style={{ paddingTop: 'var(--line)' }}>
        <span className="margin-note figures">p.&nbsp;{page.number}</span>
        <p className="past-margin on-lines eyebrow pr-5">What the AI reads</p>
      </div>
      <div className="relative">
        <span className="margin-note figures">{usable ? `${page.words} w` : ''}</span>
        <p className="past-margin on-lines pr-5 text-[0.82rem] text-pencil">
          {usable ? `${plural(page.words, 'word')} on this page` : 'This page has no selectable text'}
        </p>
      </div>

      <div className="past-margin reading pr-5 sm:pr-7" style={{ paddingTop: 'var(--line)' }}>
        {usable ? (
          paragraphs.map((paragraph, index) => (
            <p key={index} className="on-lines whitespace-pre-line" style={{ marginBottom: 'var(--line)' }}>
              {paragraph}
            </p>
          ))
        ) : (
          <p className="on-lines text-pencil">
            It is probably a scanned image or a picture of a slide. You can read it on the left, but summaries and quizzes
            need text, so they will skip this page.
          </p>
        )}
      </div>
    </article>
  )
}

function PageIndex({ pages, current, onSelect }: { pages: PageText[]; current: number; onSelect: (n: number) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <nav aria-label="Pages" className="py-4 pr-2">
      <ol>
        {pages.map((page) => {
          const active = page.number === current
          return (
            <li key={page.number}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onSelect(page.number)}
                aria-current={active ? 'page' : undefined}
                className={`group flex w-full gap-3 rounded-r-md border-l-2 py-2 pl-3 pr-2 text-left transition-colors ${
                  active ? 'border-ink bg-sheet' : 'border-transparent hover:bg-sheet/60'
                }`}
              >
                <span className={`figures w-6 shrink-0 text-right text-[0.78rem] font-[620] ${active ? 'text-ink' : 'text-pencil'}`}>
                  {page.number}
                </span>
                <span
                  className={`line-clamp-2 text-[0.8rem] leading-snug ${
                    hasUsableText(page) ? (active ? 'text-ink' : 'text-pencil') : 'italic text-pencil/70'
                  }`}
                >
                  {snippet(page)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function PageControls({ current, total, onGo }: { current: number; total: number; onGo: (n: number) => void }) {
  const [draft, setDraft] = useState(String(current))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(current)

  const commit = () => {
    const value = Number.parseInt(draft, 10)
    if (Number.isFinite(value)) onGo(Math.min(Math.max(1, value), total))
    setEditing(false)
  }

  const button =
    'whitespace-nowrap rounded-full px-4 py-2 text-[0.85rem] font-[600] transition-colors hover:bg-sheet disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent'

  return (
    <div className="flex items-center justify-center gap-2">
      <button type="button" className={button} onClick={() => onGo(current - 1)} disabled={current <= 1}>
        ← Previous
      </button>
      <label className="figures flex items-center gap-2 whitespace-nowrap text-[0.85rem] text-pencil">
        <span className="sr-only">Page number</span>
        <input
          value={shown}
          inputMode="numeric"
          onFocus={(event) => {
            setDraft(String(current))
            setEditing(true)
            event.target.select()
          }}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setEditing(false)
              event.currentTarget.blur()
            }
          }}
          className="w-12 rounded-md border border-rule bg-sheet py-1 text-center font-[620] text-ink"
        />
        of {total}
      </label>
      <button type="button" className={button} onClick={() => onGo(current + 1)} disabled={current >= total}>
        Next →
      </button>
    </div>
  )
}

function ReaderView({
  summary,
  content,
  pdf,
  requestedPage,
}: {
  summary: DocumentSummary
  content: DocumentContent
  pdf: PDFDocumentProxy
  requestedPage: number | null
}) {
  const total = content.pages.length
  const current = Math.min(Math.max(1, requestedPage ?? summary.lastPage ?? 1), total)
  const page = content.pages[current - 1]
  const [mobileView, setMobileView] = useState<'page' | 'text'>('page')

  const go = (n: number) => {
    const next = Math.min(Math.max(1, n), total)
    if (next !== current) navigate(routes.reader(summary.id, next), { replace: true })
  }

  // Remember the page so the library can reopen here.
  useEffect(() => {
    const timer = window.setTimeout(() => void touchDocument(summary.id, current), 400)
    return () => window.clearTimeout(timer)
  }, [summary.id, current])

  // Arrow keys and Page Up/Down turn pages, unless the reader is typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(current + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tab = (view: 'page' | 'text', label: string) => (
    <button
      type="button"
      onClick={() => setMobileView(view)}
      aria-pressed={mobileView === view}
      className={`flex-1 rounded-full py-1.5 text-[0.85rem] font-[600] transition-colors ${
        mobileView === view ? 'bg-sheet text-ink shadow-[0_1px_0_var(--color-rule)]' : 'text-pencil'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto max-w-[1600px] lg:grid lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] xl:grid-cols-[13rem_minmax(0,1fr)_minmax(22rem,30rem)]">
      <aside className="hidden overflow-y-auto border-r border-rule xl:block">
        <PageIndex pages={content.pages} current={current} onSelect={go} />
      </aside>

      <div className="flex gap-1 rounded-full bg-desk p-1 lg:hidden mx-4 mt-4 border border-rule">
        {tab('page', 'Page')}
        {tab('text', 'Text')}
      </div>

      <section
        className={`flex-col gap-5 overflow-y-auto px-4 py-6 sm:px-8 lg:flex ${mobileView === 'page' ? 'flex' : 'hidden'}`}
        aria-label="Page view"
      >
        <PageCanvas pdf={pdf} pageNumber={current} />
        <PageControls current={current} total={total} onGo={go} />
      </section>

      <section
        className={`overflow-y-auto border-rule px-4 pb-6 lg:block lg:border-l lg:px-0 lg:pb-0 ${
          mobileView === 'text' ? 'block pt-4' : 'hidden'
        }`}
        aria-label="Page text"
      >
        <PageTextSheet page={page} />
        <div className="py-4 lg:hidden">
          <PageControls current={current} total={total} onGo={go} />
        </div>
      </section>
    </div>
  )
}

export function Reader({ id, page, onTitle }: { id: string; page: number | null; onTitle: (title: string | null) => void }) {
  const state = useDocument(id)

  useEffect(() => {
    onTitle(state.kind === 'ready' ? state.summary.title : null)
  }, [state, onTitle])

  if (state.kind === 'loading') {
    return <p className="px-6 py-16 text-center text-pencil">Opening…</p>
  }

  if (state.kind === 'missing' || state.kind === 'failed') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="display text-4xl">
          {state.kind === 'missing' ? 'This document is not on this laptop.' : 'This document could not be opened.'}
        </h1>
        <p className="mt-4 text-pencil">
          {state.kind === 'missing'
            ? 'It may have been removed, or it was opened in another browser. Open the PDF again from the library.'
            : state.message}
        </p>
        <a
          href={routes.library}
          className="mt-8 inline-block font-[620] underline decoration-margin decoration-2 underline-offset-[5px]"
        >
          Back to the library
        </a>
      </div>
    )
  }

  return <ReaderView summary={state.summary} content={state.content} pdf={state.pdf} requestedPage={page} />
}
