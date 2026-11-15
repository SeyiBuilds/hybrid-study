import { useEffect, useRef, useState } from 'react'
import { highlightFill } from '../lib/highlights'
import { getNote, saveNote, type Highlight } from '../lib/library'
import { Row } from './sheet'
import { penField, quietButton } from './sheetStyles'

/** Saves a value a moment after the student stops typing. */
function useAutosave(value: string | null, save: (value: string) => Promise<unknown>, delay = 500) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const first = useRef(true)
  useEffect(() => {
    if (value === null) return
    if (first.current) {
      first.current = false
      return
    }
    setState('saving')
    const timer = window.setTimeout(() => {
      save(value).then(() => setState('saved'))
    }, delay)
    return () => window.clearTimeout(timer)
    // `save` is recreated each render; the value is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay])
  return state
}

function PageNotes({ documentId, page }: { documentId: string; page: number }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getNote(documentId, page).then((note) => {
      if (!cancelled) setText(note?.text ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [documentId, page])

  const state = useAutosave(text, (value) => saveNote(documentId, page, value))

  return (
    <>
      <Row note={state === 'saving' ? '…' : state === 'saved' ? 'saved' : 'you'} noteClass="text-pen">
        <h2 className="on-lines eyebrow">My notes</h2>
      </Row>
      <Row>
        {text === null ? (
          <div style={{ height: 'calc(var(--line) * 3)' }} />
        ) : (
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="My notes for this page"
            placeholder="Write your own notes for this page. They stay on this laptop."
            className={penField}
            style={{ minHeight: 'calc(var(--line) * 3)' }}
          />
        )}
      </Row>
    </>
  )
}

function HighlightNote({
  highlight,
  focus,
  onChange,
}: {
  highlight: Highlight
  focus: boolean
  onChange: (highlight: Highlight) => void
}) {
  const [note, setNote] = useState(highlight.note)
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutosave(note, async (value) => onChange({ ...highlight, note: value, updatedAt: Date.now() }))

  useEffect(() => {
    if (!focus) return
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])

  return (
    <textarea
      ref={ref}
      value={note}
      onChange={(event) => setNote(event.target.value)}
      rows={1}
      aria-label="Note for this highlight"
      placeholder="Add a note…"
      className={penField}
    />
  )
}

export function NotesSection({
  documentId,
  page,
  highlights,
  focusNoteId,
  onChangeHighlight,
  onRemoveHighlight,
  onShowHighlight,
}: {
  documentId: string
  page: number
  highlights: Highlight[]
  focusNoteId: string | null
  onChangeHighlight: (highlight: Highlight) => void
  onRemoveHighlight: (id: string) => void
  onShowHighlight: (id: string) => void
}) {
  return (
    <section aria-label="My notes">
      <PageNotes key={`${documentId}:${page}`} documentId={documentId} page={page} />

      <div style={{ marginTop: 'var(--line)' }}>
        <Row note={<span className="figures">{highlights.length || ''}</span>}>
          <h2 className="on-lines eyebrow">Highlights on this page</h2>
        </Row>
        {highlights.length === 0 ? (
          <Row>
            <p className="on-lines font-sans text-[0.85rem] text-pencil">
              Select words on the page to highlight them, add a note or ask about them.
            </p>
          </Row>
        ) : (
          highlights.map((highlight) => (
            <div key={highlight.id} className="relative">
              <span
                className="absolute bottom-[6px] top-[6px] w-[3px] rounded-full"
                style={{ left: 'calc(var(--margin) + 0.35rem)', background: highlightFill[highlight.color] }}
                aria-hidden
              />
              <Row>
                <p className="reading on-lines">{highlight.text}</p>
                <HighlightNote highlight={highlight} focus={focusNoteId === highlight.id} onChange={onChangeHighlight} />
                <p className="on-lines flex gap-4">
                  <button type="button" onClick={() => onShowHighlight(highlight.id)} className={quietButton}>
                    Show on page
                  </button>
                  <button type="button" onClick={() => onRemoveHighlight(highlight.id)} className={quietButton}>
                    Remove
                  </button>
                </p>
              </Row>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
