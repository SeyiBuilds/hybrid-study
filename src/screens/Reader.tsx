import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { SummarySection } from '../components/SummarySection'
import {
  getContent,
  getDocumentSummary,
  saveDocument,
  touchDocument,
  type DocumentContent,
  type DocumentSummary,
} from '../lib/library'
import {
  closePdf,
  extractPages,
  hasUsableText,
  openPdf,
  pageLabel,
  renderPage,
  type PageText,
  type PDFDocumentProxy,
} from '../lib/pdf'
import { EXTRACT_VERSION, type TextBlock } from '../lib/pageText'
import { navigate, routes } from '../lib/useHashRoute'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'updating'; done: number; total: number }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; summary: DocumentSummary; content: DocumentContent; pdf: PDFDocumentProxy }

function useDocument(id: string): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    let pdf: PDFDocumentProxy | null = null
    ;(async () => {
      let [summary, content] = await Promise.all([getDocumentSummary(id), getContent(id)])
      if (cancelled) return
      if (!summary || !content) {
        setState({ kind: 'missing' })
        return
      }
      pdf = await openPdf(content.data)
      if (cancelled) return

      // Documents saved by an older version of the extractor get their text rebuilt once.
      if ((content.version ?? 1) < EXTRACT_VERSION) {
        const pages = await extractPages(pdf, (done, total) => {
          if (!cancelled) setState({ kind: 'updating', done, total })
        })
        if (cancelled) return
        content = { ...content, pages, version: EXTRACT_VERSION }
        summary = { ...summary, textPages: pages.filter(hasUsableText).length }
        await saveDocument(summary, content)
        if (cancelled) return
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

const LIST_SPLIT = /^(\S{1,5})\s+([\s\S]*)$/

function Block({ block, first }: { block: TextBlock; first: boolean }) {
  const style = !first && block.gapBefore ? { marginTop: 'var(--line)' } : undefined

  if (block.kind === 'heading') {
    return (
      <h3 className="on-lines font-sans text-[1.06rem] font-[660] tracking-[-0.005em]" style={style}>
        {block.text}
      </h3>
    )
  }
  if (block.kind === 'entry') {
    return (
      <p className="on-lines flex items-baseline gap-2" style={style}>
        <span className="min-w-0">{block.text}</span>
        <span className="min-w-4 flex-1 -translate-y-[0.3em] border-b border-dotted border-pencil/60" aria-hidden />
        <span className="figures font-sans text-[0.85rem] text-pencil">{block.value}</span>
      </p>
    )
  }
  if (block.kind === 'list') {
    const match = block.text.match(LIST_SPLIT)
    return (
      <p className="on-lines flex gap-2" style={style}>
        <span className="figures w-6 shrink-0 font-sans text-[0.85rem] text-pencil">{match?.[1] ?? '•'}</span>
        <span className="min-w-0">{match?.[2] ?? block.text}</span>
      </p>
    )
  }
  return (
    <p className="on-lines" style={style}>
      {block.text}
    </p>
  )
}

function PageTextSheet({ page, top }: { page: PageText; top: ReactNode }) {
  const usable = hasUsableText(page)

  return (
    <article className="ruled relative min-h-full pb-[calc(var(--line)*3)]" aria-label={`Study sheet for page ${page.number}`}>
      <div style={{ paddingTop: 'var(--line)' }}>{top}</div>

      <div className="relative" style={{ marginTop: 'var(--line)' }}>
        <span className="margin-note figures">{usable ? `${page.words} w` : ''}</span>
        <p className="past-margin on-lines eyebrow pr-5">What the AI reads</p>
      </div>

      <div className="past-margin reading pr-5 sm:pr-8">
        {usable ? (
          page.blocks.map((block, index) => <Block key={index} block={block} first={index === 0} />)
        ) : (
          <p className="on-lines text-pencil">
            This page has no selectable text. It is probably a scanned image or a picture of a slide. You can read it on
            the left, but summaries and quizzes need text, so they skip this page.
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
                  {pageLabel(page)}
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

interface Connectivity {
  online: boolean
  deviceStatus: OnDeviceStatus | null
}

function ReaderView({
  summary,
  content,
  pdf,
  requestedPage,
  connectivity,
}: {
  summary: DocumentSummary
  content: DocumentContent
  pdf: PDFDocumentProxy
  requestedPage: number | null
  connectivity: Connectivity
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
        {tab('text', 'Study')}
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
        aria-label="Study sheet"
      >
        <PageTextSheet
          page={page}
          top={
            <SummarySection
              documentId={summary.id}
              title={summary.title}
              page={page}
              online={connectivity.online}
              deviceStatus={connectivity.deviceStatus}
            />
          }
        />
        <div className="py-4 lg:hidden">
          <PageControls current={current} total={total} onGo={go} />
        </div>
      </section>
    </div>
  )
}

export function Reader({
  id,
  page,
  onTitle,
  connectivity,
}: {
  id: string
  page: number | null
  onTitle: (title: string | null) => void
  connectivity: Connectivity
}) {
  const state = useDocument(id)

  useEffect(() => {
    onTitle(state.kind === 'ready' ? state.summary.title : null)
  }, [state, onTitle])

  if (state.kind === 'loading') {
    return <p className="px-6 py-16 text-center text-pencil">Opening…</p>
  }

  if (state.kind === 'updating') {
    return (
      <p className="figures px-6 py-16 text-center text-pencil" aria-live="polite">
        Tidying up the text of this document: page {state.done} of {state.total}
      </p>
    )
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

  return (
    <ReaderView
      summary={state.summary}
      content={state.content}
      pdf={state.pdf}
      requestedPage={page}
      connectivity={connectivity}
    />
  )
}
