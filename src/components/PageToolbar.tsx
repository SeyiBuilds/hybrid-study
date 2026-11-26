import { ZOOM_STEPS } from '../lib/readerPrefs'

const toolButton =
  'inline-flex h-8 items-center gap-2 rounded-full px-3 font-sans text-[0.82rem] font-[600] text-pencil transition-colors hover:bg-sheet hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent'

function PagesIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M7.5 3.5v13" />
    </svg>
  )
}

function EnlargeIcon({ enlarged }: { enlarged: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      {enlarged ? (
        <path d="M8 3v5H3M12 3v5h5M8 17v-5H3M12 17v-5h5" />
      ) : (
        <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
      )}
    </svg>
  )
}

/** Above the page: show or hide the page list, zoom, and enlarge the page to fill the screen. */
export function PageToolbar({
  pagesOpen,
  onTogglePages,
  zoom,
  onZoom,
  enlarged,
  onToggleEnlarged,
}: {
  pagesOpen: boolean
  onTogglePages: () => void
  zoom: number
  onZoom: (zoom: number) => void
  enlarged: boolean
  onToggleEnlarged: () => void
}) {
  const index = ZOOM_STEPS.indexOf(zoom)
  return (
    <div className="flex items-center gap-2">
      {!enlarged && (
        <button type="button" onClick={onTogglePages} aria-pressed={!pagesOpen} className={`hidden xl:inline-flex ${toolButton}`}>
          <PagesIcon />
          {pagesOpen ? 'Hide pages' : 'Show pages'}
        </button>
      )}
      <div className="ml-auto flex items-center rounded-full border border-rule bg-sheet/60 p-[3px]" role="group" aria-label="Zoom">
        <button
          type="button"
          onClick={() => onZoom(ZOOM_STEPS[index - 1])}
          disabled={index <= 0}
          aria-label="Zoom out"
          className={`${toolButton} h-7 w-7 justify-center px-0 text-[1rem]`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onZoom(1)}
          title="Fit the page to the width"
          aria-label={`Zoom ${Math.round(zoom * 100)}%, fit to width`}
          className="figures h-7 min-w-[3.6rem] rounded-full px-2 font-sans text-[0.8rem] font-[620] text-ink hover:bg-sheet"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => onZoom(ZOOM_STEPS[index + 1])}
          disabled={index >= ZOOM_STEPS.length - 1}
          aria-label="Zoom in"
          className={`${toolButton} h-7 w-7 justify-center px-0 text-[1rem]`}
        >
          +
        </button>
      </div>
      <button type="button" onClick={onToggleEnlarged} aria-pressed={enlarged} className={`hidden lg:inline-flex ${toolButton}`}>
        <EnlargeIcon enlarged={enlarged} />
        {enlarged ? 'Back to study view' : 'Enlarge'}
      </button>
    </div>
  )
}
