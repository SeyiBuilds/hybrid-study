import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { ImportError, importPdf, type ImportProgress } from '../lib/importPdf'
import { deleteDocument, listDocuments, type DocumentSummary } from '../lib/library'
import { fileSize, plural, timeAgo } from '../lib/format'
import { navigate, routes } from '../lib/useHashRoute'

type ImportState =
  | { kind: 'idle' }
  | { kind: 'working'; fileName: string; progress: ImportProgress }
  | { kind: 'failed'; message: string }

function progressText(progress: ImportProgress): string {
  switch (progress.stage) {
    case 'reading':
      return 'Opening the file…'
    case 'extracting':
      return `Reading page ${progress.done} of ${progress.total}`
    case 'saving':
      return 'Saving to this laptop…'
  }
}

function progressFraction(progress: ImportProgress): number {
  if (progress.stage === 'reading') return 0.04
  if (progress.stage === 'saving') return 1
  return progress.done / progress.total
}

function DocumentRow({ doc, onRemoved }: { doc: DocumentSummary; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const scanned = doc.pageCount - doc.textPages

  const remove = async () => {
    await deleteDocument(doc.id)
    onRemoved()
  }

  return (
    <li className="group relative">
      <span className="margin-note">{doc.pageCount} pp</span>
      <div className="past-margin flex items-start gap-4 pr-4 sm:pr-6">
        <a href={routes.reader(doc.id, doc.lastPage)} className="min-w-0 flex-1 rounded-sm outline-offset-4">
          <span className="on-lines block truncate text-[1.02rem] font-[560] group-hover:underline group-hover:decoration-rule group-hover:decoration-2 group-hover:underline-offset-[6px]">
            {doc.title}
          </span>
          <span className="on-lines block truncate text-[0.82rem] text-pencil">
            {doc.lastPage > 1 ? `On page ${doc.lastPage}` : 'Not started'} · opened {timeAgo(doc.openedAt)} ·{' '}
            {fileSize(doc.bytes)}
            {scanned > 0 && ` · ${plural(scanned, 'page')} without text`}
          </span>
        </a>
        <div className="on-lines flex shrink-0 items-center gap-3 text-[0.8rem]">
          {confirming ? (
            <>
              <span className="hidden text-pencil sm:inline">Remove from this laptop?</span>
              <button type="button" onClick={remove} className="font-semibold text-margin hover:underline">
                Remove
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-pencil hover:text-ink">
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-pencil transition-opacity hover:text-margin focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

export function Library() {
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)

  const load = useCallback(async () => {
    setDocs(await listDocuments())
  }, [])

  useEffect(() => {
    let cancelled = false
    listDocuments().then((list) => {
      if (!cancelled) setDocs(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const open = async (file: File | undefined) => {
    if (!file || importState.kind === 'working') return
    setImportState({ kind: 'working', fileName: file.name, progress: { stage: 'reading' } })
    try {
      const id = await importPdf(file, (progress) => setImportState({ kind: 'working', fileName: file.name, progress }))
      setImportState({ kind: 'idle' })
      navigate(routes.reader(id))
    } catch (error) {
      const message =
        error instanceof ImportError ? error.message : `${file.name} could not be opened. ${(error as Error).message ?? ''}`
      setImportState({ kind: 'failed', message })
    }
  }

  const onDragEnter = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes('Files')) return
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void open(event.dataTransfer.files[0])
  }

  const working = importState.kind === 'working'

  return (
    <main
      className="mx-auto max-w-5xl px-4 pb-24 sm:px-6"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <section className="pt-12 sm:pt-20">
        <h1 className="display text-[clamp(2.9rem,9vw,5.75rem)]">
          Open your
          <br />
          lecture notes.
        </h1>
        <p className="mt-6 max-w-[34rem] text-[1.05rem] leading-relaxed text-pencil">
          Your PDFs stay on this laptop. Study them one page at a time, with AI that runs on the device when it can and in
          the cloud only when it must.
        </p>
      </section>

      <section
        aria-label="Your documents"
        className={`ruled relative mt-10 overflow-hidden rounded-[3px] shadow-[0_1px_0_var(--color-rule),0_18px_40px_-24px_rgb(24_40_72/0.45)] transition-[box-shadow] ${
          dragging ? 'ring-2 ring-ink ring-offset-4 ring-offset-desk' : ''
        }`}
      >
        {/* Open a file: the first entry on the page. */}
        <div className="relative" style={{ minHeight: 'calc(var(--line) * 4)' }}>
          <span className="margin-note" style={{ top: 'var(--line)' }}>
            New
          </span>
          <div className="past-margin pr-4 sm:pr-6" style={{ paddingTop: 'var(--line)' }}>
            {working ? (
              <div aria-live="polite">
                <p className="on-lines truncate text-[1.02rem] font-[560]">{importState.fileName}</p>
                <p className="on-lines figures text-[0.85rem] text-pencil">{progressText(importState.progress)}</p>
                <div className="mt-[calc(var(--line)/2-1px)] h-[2px] w-full max-w-md bg-rule">
                  <div
                    className="h-full bg-ink transition-[width] duration-300"
                    style={{ width: `${Math.round(progressFraction(importState.progress) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="on-lines flex flex-wrap items-baseline gap-x-3">
                  <span className="hidden text-[1.15rem] font-[620] sm:inline">
                    {dragging ? 'Drop it here' : 'Drop a lecture PDF here'}
                  </span>
                  <span className="hidden text-pencil sm:inline">or</span>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-[1.15rem] font-[620] text-ink underline decoration-margin decoration-2 underline-offset-[5px] hover:decoration-ink sm:text-base"
                  >
                    <span className="sm:hidden">Choose a lecture PDF</span>
                    <span className="hidden sm:inline">choose a file</span>
                  </button>
                </div>
                <p className={`on-lines text-[0.85rem] ${importState.kind === 'failed' ? 'text-margin' : 'text-pencil'}`}>
                  {importState.kind === 'failed'
                    ? importState.message
                    : 'Up to 60 MB. Pages that are scanned images open fine but have no text to study.'}
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                void open(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
        </div>

        {/* What is already on this laptop. */}
        <div className="relative">
          <span className="margin-note figures">{docs && docs.length > 0 ? docs.length : ''}</span>
          <p className="past-margin on-lines eyebrow">On this laptop</p>
        </div>

        {docs === null ? (
          <div style={{ height: 'calc(var(--line) * 4)' }} />
        ) : docs.length === 0 ? (
          <div className="past-margin pr-6" style={{ minHeight: 'calc(var(--line) * 5)' }}>
            <p className="on-lines text-[0.9rem] text-pencil">
              Nothing here yet. PDFs you open are kept on this device, so you can come back to them offline.
            </p>
          </div>
        ) : (
          <ul style={{ paddingBottom: 'var(--line)' }}>
            {docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} onRemoved={() => void load()} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
