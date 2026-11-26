import { useState, type KeyboardEvent } from 'react'
import { ZOOM_STEPS } from '../lib/readerPrefs'
import { IconButton } from './controls'
import { icons } from './icons'

function PageNumber({ current, total, onGo }: { current: number; total: number; onGo: (n: number) => void }) {
  const [draft, setDraft] = useState(String(current))
  const [editing, setEditing] = useState(false)

  const commit = () => {
    const value = Number.parseInt(draft, 10)
    if (Number.isFinite(value)) onGo(Math.min(Math.max(1, value), total))
    setEditing(false)
  }

  return (
    <label className="figures flex items-center gap-1.5 px-1 font-sans text-[0.82rem] text-pencil">
      <span className="sr-only">Page number</span>
      <input
        value={editing ? draft : String(current)}
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
        className="h-7 w-10 rounded-md border border-rule bg-desk/60 text-center font-[640] text-ink focus:border-ink"
      />
      <span>of {total}</span>
    </label>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
}

/**
 * The page's controls, together in one bar floating at the bottom of the page:
 * turn pages, zoom, and enlarge the page to fill the screen.
 */
export function ReaderBar({
  current,
  total,
  onGo,
  zoom,
  onZoom,
  enlarged,
  onToggleEnlarged,
}: {
  current: number
  total: number
  onGo: (page: number) => void
  zoom: number
  onZoom: (zoom: number) => void
  enlarged: boolean
  onToggleEnlarged: () => void
}) {
  const step = ZOOM_STEPS.indexOf(zoom)
  return (
    <div className="pointer-events-none sticky bottom-4 z-10 mt-4 flex justify-center">
      <div
        role="toolbar"
        aria-label="Page controls"
        className="pointer-events-auto flex items-center rounded-full border border-rule bg-sheet/95 px-1.5 py-1 shadow-[0_12px_32px_-14px_rgb(0_0_0/0.55)] backdrop-blur"
      >
        <IconButton label="Previous page" onClick={() => onGo(current - 1)} disabled={current <= 1}>
          {icons.previous}
        </IconButton>
        <PageNumber current={current} total={total} onGo={onGo} />
        <IconButton label="Next page" onClick={() => onGo(current + 1)} disabled={current >= total}>
          {icons.next}
        </IconButton>
        <Divider />
        <IconButton label="Zoom out" onClick={() => onZoom(ZOOM_STEPS[step - 1])} disabled={step <= 0}>
          {icons.zoomOut}
        </IconButton>
        <button
          type="button"
          onClick={() => onZoom(1)}
          title="Fit the page to the width"
          aria-label={`Zoom ${Math.round(zoom * 100)}%, fit to width`}
          className="figures h-8 min-w-[3.4rem] rounded-full px-1 font-sans text-[0.8rem] font-[640] text-ink hover:bg-desk"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={() => onZoom(ZOOM_STEPS[step + 1])} disabled={step >= ZOOM_STEPS.length - 1}>
          {icons.zoomIn}
        </IconButton>
        <span className="hidden lg:contents">
          <Divider />
          <IconButton label={enlarged ? 'Back to the study view' : 'Enlarge the page'} onClick={onToggleEnlarged} pressed={enlarged}>
            {enlarged ? icons.shrink : icons.enlarge}
          </IconButton>
        </span>
      </div>
    </div>
  )
}
