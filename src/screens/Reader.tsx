import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { askAboutPage, EXPLAIN_QUESTION } from '../ai/asks'
import type { OnDeviceStatus } from '../ai/client'
import { AskSection } from '../components/AskSection'
import { MarkToolbar, type ToolbarTarget } from '../components/MarkToolbar'
import { NotesSection } from '../components/NotesSection'
import { PageToolbar } from '../components/PageToolbar'
import { PdfPage, type PageSelection } from '../components/PdfPage'
import { Row, RunOnBar } from '../components/sheet'
import { SheetTabs } from '../components/SheetTabs'
import { useSheetActivity, useSheetTab } from '../lib/sheetTab'
import { QuizSection } from '../components/QuizSection'
import { SummarySection } from '../components/SummarySection'
import { newId } from '../lib/highlights'
import {
  deleteHighlight,
  getContent,
  getDocumentSummary,
  listHighlights,
  saveDocument,
  saveHighlight,
  touchDocument,
  type DocumentContent,
  type DocumentSummary,
  type Highlight,
  type HighlightColor,
} from '../lib/library'
import {
  closePdf,
  extractPages,
  hasUsableText,
  openPdf,
  pageLabel,
  type PageText,
  type PDFDocumentProxy,
} from '../lib/pdf'
import { EXTRACT_VERSION, type TextBlock } from '../lib/pageText'
import { usePagesPane, useZoom, ZOOM_STEPS } from '../lib/readerPrefs'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { navigate, routes } from '../lib/useHashRoute'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'updating'; done: number; total: number }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; summary: DocumentSummary; content: DocumentContent; pdf: PDFDocumentProxy }

/** Plain-language reason a document failed to open. */
function openErrorMessage(error: Error): string {
  if (/fake worker|dynamically imported module|failed to fetch|networkerror/i.test(error.message)) {
    return "Part of the PDF reader didn't load because the connection to Hybrid Study dropped. Reload the page once you're connected. Your document, notes and highlights are safe on this laptop."
  }
  return `The PDF couldn't be read (${error.message}). Your notes and highlights are safe. Try opening the PDF again from the library.`
}

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
      if (!cancelled) setState({ kind: 'failed', message: openErrorMessage(error) })
    })
    return () => {
      cancelled = true
      if (pdf) void closePdf(pdf)
    }
  }, [id])

  return state
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

/** The cleaned-up text the AI reads, folded away at the foot of the sheet until the student wants to check it. */
function PageTextSection({ page }: { page: PageText }) {
  const [open, setOpen] = useState(false)
  const usable = hasUsableText(page)

  return (
    <section aria-label="Text the AI reads" style={{ marginTop: 'calc(var(--line) * 2)' }}>
      <Row>
        <p className="on-lines flex items-baseline justify-between gap-4">
          <span className="font-sans text-[0.82rem] font-[640] text-pencil">
            What the AI reads
            {usable && <span className="figures font-[500]"> · {page.words} words</span>}
          </span>
          {usable && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="font-sans text-[0.8rem] font-[600] text-ink underline decoration-rule underline-offset-[3px] hover:decoration-ink"
            >
              {open ? 'Hide' : 'Show'}
            </button>
          )}
        </p>
        <div className="reading">
          {!usable ? (
            <p className="on-lines text-pencil">
              This page has no selectable text. It is probably a scanned image or a picture of a slide, so summaries,
              questions and highlights skip it.
            </p>
          ) : open ? (
            page.blocks.map((block, index) => <Block key={index} block={block} first={index === 0} />)
          ) : (
            <p className="on-lines font-sans text-[0.8rem] text-pencil">
              The page&apos;s text, cleaned up from the PDF. Summaries and answers are based on it.
            </p>
          )}
        </div>
      </Row>
    </section>
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
  const [mobileView, setMobileView] = useState<'page' | 'study'>('page')
  const runOn = useRunOn()
  const [highlights, setHighlights] = useState<{ page: number; list: Highlight[] }>({ page: 0, list: [] })
  const [selection, setSelection] = useState<PageSelection | null>(null)
  const [toolbar, setToolbar] = useState<ToolbarTarget | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null)
  const [askPrefill, setAskPrefill] = useState<{ quote: string; nonce: number } | null>(null)
  const [sheetTab, setSheetTab] = useSheetTab()
  const [zoom, setZoom] = useZoom()
  const [pagesOpen, setPagesOpen] = usePagesPane()
  // Enlarged: the page fills the screen; the page list and study sheet step aside.
  const [enlarged, setEnlarged] = useState(false)
  const showStudy = () => {
    setMobileView('study')
    setEnlarged(false)
  }
  const activity = useSheetActivity(summary.id, current)
  const paperRef = useRef<HTMLDivElement>(null)
  const pageHighlights = highlights.page === current ? highlights.list : []

  // A new page or a different tab starts at the top of the sheet.
  useEffect(() => {
    paperRef.current?.scrollTo({ top: 0 })
  }, [current, sheetTab])

  const go = (n: number) => {
    const next = Math.min(Math.max(1, n), total)
    if (next !== current) navigate(routes.reader(summary.id, next), { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    listHighlights(summary.id, current).then((list) => {
      if (!cancelled) setHighlights({ page: current, list })
    })
    return () => {
      cancelled = true
      setToolbar(null)
      setSelection(null)
    }
  }, [summary.id, current])

  // Remember the page so the library can reopen here.
  useEffect(() => {
    const timer = window.setTimeout(() => void touchDocument(summary.id, current), 400)
    return () => window.clearTimeout(timer)
  }, [summary.id, current])

  // Arrow keys and Page Up/Down turn pages, + and - zoom, Escape leaves the enlarged view,
  // unless the reader is typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(current + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(current - 1)
      const step = ZOOM_STEPS.indexOf(zoom)
      if ((event.key === '+' || event.key === '=') && step < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[step + 1])
      if (event.key === '-' && step > 0) setZoom(ZOOM_STEPS[step - 1])
      if (event.key === 'Escape' && enlarged) setEnlarged(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const onSelection = useCallback((next: PageSelection | null) => {
    setSelection(next)
    setToolbar((open) => {
      if (next) return { kind: 'selection', anchor: next.anchor }
      return open?.kind === 'selection' ? null : open
    })
  }, [])

  const closeToolbar = useCallback(() => setToolbar(null), [])

  const storeHighlight = (highlight: Highlight) => {
    setHighlights((state) =>
      state.page !== highlight.page
        ? state
        : {
            page: state.page,
            list: state.list.some((h) => h.id === highlight.id)
              ? state.list.map((h) => (h.id === highlight.id ? highlight : h))
              : [...state.list, highlight].sort(
                  (a, b) => (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0) || (a.rects[0]?.x ?? 0) - (b.rects[0]?.x ?? 0),
                ),
          },
    )
    void saveHighlight(highlight)
  }

  const removeHighlight = (id: string) => {
    setHighlights((state) => ({ ...state, list: state.list.filter((h) => h.id !== id) }))
    void deleteHighlight(id)
  }

  /** Turns the current selection into a highlight and returns it. */
  const highlightSelection = (color: HighlightColor): Highlight | null => {
    if (!selection) return null
    const now = Date.now()
    const highlight: Highlight = {
      id: newId(),
      documentId: summary.id,
      page: current,
      color,
      text: selection.text,
      rects: selection.rects,
      note: '',
      createdAt: now,
      updatedAt: now,
    }
    storeHighlight(highlight)
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    return highlight
  }

  const onToolbarHighlight = (color: HighlightColor) => {
    if (toolbar?.kind === 'highlight') storeHighlight({ ...toolbar.highlight, color, updatedAt: Date.now() })
    else highlightSelection(color)
    setToolbar(null)
  }

  const onToolbarNote = () => {
    const highlight = toolbar?.kind === 'highlight' ? toolbar.highlight : highlightSelection('yellow')
    setToolbar(null)
    if (!highlight) return
    showStudy()
    setSheetTab('notes')
    setFocusNoteId(null)
    window.requestAnimationFrame(() => setFocusNoteId(highlight.id))
  }

  const onToolbarAsk = () => {
    const quote = toolbar?.kind === 'highlight' ? toolbar.highlight.text : selection?.text
    setToolbar(null)
    if (!quote) return
    showStudy()
    setSheetTab('ask')
    setAskPrefill({ quote, nonce: Date.now() })
  }

  // Explain: ask straight away for a plain-words breakdown of the marked words.
  const onToolbarExplain = () => {
    const quote = toolbar?.kind === 'highlight' ? toolbar.highlight.text : selection?.text
    setToolbar(null)
    if (!quote) return
    window.getSelection()?.removeAllRanges()
    showStudy()
    setSheetTab('ask')
    void askAboutPage({
      documentId: summary.id,
      title: summary.title,
      page: current,
      pageText: page.text,
      pages: content.pages,
      question: EXPLAIN_QUESTION,
      quote,
      force: forcedTarget(runOn),
    })
    // The new question appears just under the question box.
    window.requestAnimationFrame(() => paperRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  const onToolbarRemove = () => {
    if (toolbar?.kind === 'highlight') removeHighlight(toolbar.highlight.id)
    setToolbar(null)
  }

  const showHighlight = (id: string) => {
    setMobileView('page')
    setFlashId(null)
    window.requestAnimationFrame(() => setFlashId(id))
  }

  const tab = (view: 'page' | 'study', label: string) => (
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
    <div
      className={`mx-auto max-w-[1600px] lg:grid lg:h-[calc(100dvh-3.5rem)] ${
        enlarged
          ? 'lg:grid-cols-[minmax(0,1fr)]'
          : pagesOpen
            ? 'lg:grid-cols-[minmax(0,1fr)_minmax(23rem,29rem)] xl:grid-cols-[13rem_minmax(0,1fr)_minmax(26rem,34rem)]'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(23rem,29rem)] xl:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)]'
      }`}
    >
      <aside className={`hidden overflow-y-auto border-r border-rule ${pagesOpen && !enlarged ? 'xl:block' : ''}`}>
        <PageIndex pages={content.pages} current={current} onSelect={go} />
      </aside>

      <div className="mx-4 mt-4 flex gap-1 rounded-full border border-rule bg-desk p-1 lg:hidden">
        {tab('page', 'Page')}
        {tab('study', 'Study')}
      </div>

      <section
        className={`flex-col gap-4 overflow-y-auto px-4 pb-6 pt-4 sm:px-8 lg:flex ${mobileView === 'page' ? 'flex' : 'hidden'}`}
        aria-label="Page view"
      >
        <PageToolbar
          pagesOpen={pagesOpen}
          onTogglePages={() => setPagesOpen(!pagesOpen)}
          zoom={zoom}
          onZoom={setZoom}
          enlarged={enlarged}
          onToggleEnlarged={() => setEnlarged(!enlarged)}
        />
        <PdfPage
          pdf={pdf}
          pageNumber={current}
          zoom={zoom}
          highlights={pageHighlights}
          flashId={flashId}
          onSelection={onSelection}
          onHighlightClick={(highlight, anchor) => setToolbar({ kind: 'highlight', highlight, anchor })}
        />
        <PageControls current={current} total={total} onGo={go} />
      </section>

      <section
        className={`pb-2 lg:min-h-0 lg:flex-col lg:border-l lg:border-rule lg:pb-0 ${
          enlarged ? 'hidden' : `lg:flex ${mobileView === 'study' ? 'block' : 'hidden'}`
        }`}
        aria-label="Study sheet"
      >
        <article className="flex flex-col lg:min-h-0 lg:flex-1" aria-label={`Study sheet for page ${current}`}>
          <RunOnBar deviceStatus={connectivity.deviceStatus} />
          <SheetTabs tab={sheetTab} onTab={setSheetTab} activity={activity} counts={{ notes: pageHighlights.length }} />
          <div
            ref={paperRef}
            className="ruled relative mx-4 mb-4 min-h-[calc(var(--line)*12)] rounded-b-[6px] rounded-tr-[6px] border border-rule shadow-[0_18px_40px_-28px_rgb(24_40_72/0.5)] lg:mx-5 lg:mb-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
            style={{ '--margin': '3.25rem', paddingTop: 'var(--line)', paddingBottom: 'calc(var(--line) * 2)' } as CSSProperties}
          >
            <div role="tabpanel" id="sheet-panel-summary" aria-labelledby="sheet-tab-summary" hidden={sheetTab !== 'summary'}>
              <SummarySection
                documentId={summary.id}
                title={summary.title}
                page={page}
                deviceStatus={connectivity.deviceStatus}
              />
            </div>
            <div role="tabpanel" id="sheet-panel-ask" aria-labelledby="sheet-tab-ask" hidden={sheetTab !== 'ask'}>
              <AskSection
                documentId={summary.id}
                title={summary.title}
                page={page}
                pages={content.pages}
                deviceStatus={connectivity.deviceStatus}
                prefill={askPrefill}
              />
            </div>
            <div role="tabpanel" id="sheet-panel-quiz" aria-labelledby="sheet-tab-quiz" hidden={sheetTab !== 'quiz'}>
              <QuizSection
                key={`${summary.id}:${current}`}
                documentId={summary.id}
                title={summary.title}
                page={page}
                deviceStatus={connectivity.deviceStatus}
              />
            </div>
            <div role="tabpanel" id="sheet-panel-notes" aria-labelledby="sheet-tab-notes" hidden={sheetTab !== 'notes'}>
              <NotesSection
                documentId={summary.id}
                page={current}
                highlights={pageHighlights}
                focusNoteId={focusNoteId}
                onChangeHighlight={storeHighlight}
                onRemoveHighlight={removeHighlight}
                onShowHighlight={showHighlight}
              />
            </div>
            <PageTextSection page={page} />
          </div>
        </article>
        <div className="pb-4 lg:hidden">
          <PageControls current={current} total={total} onGo={go} />
        </div>
      </section>

      {toolbar && (
        <MarkToolbar
          target={toolbar}
          onHighlight={onToolbarHighlight}
          onNote={onToolbarNote}
          onExplain={onToolbarExplain}
          onAsk={onToolbarAsk}
          onRemove={onToolbarRemove}
          onClose={closeToolbar}
        />
      )}
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
        <div className="mt-8 flex items-center justify-center gap-6">
          {state.kind === 'failed' && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-ink px-5 py-2 text-[0.9rem] font-[620] text-sheet hover:opacity-90"
            >
              Reload
            </button>
          )}
          <a
            href={routes.library}
            className="inline-block font-[620] underline decoration-margin decoration-2 underline-offset-[5px]"
          >
            Back to the library
          </a>
        </div>
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
