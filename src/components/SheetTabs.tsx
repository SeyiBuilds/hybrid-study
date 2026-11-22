import { useRef, type KeyboardEvent } from 'react'
import { SHEET_TABS, type Activity, type SheetTab } from '../lib/sheetTab'
import { Dot } from './sheet'

const ACTIVITY_LABEL: Record<Exclude<Activity, null>, string> = {
  running: 'working',
  queued: 'queued',
  error: 'needs attention',
}

/** Index tabs on the edge of the sheet, like dividers in a ring binder. */
export function SheetTabs({
  tab,
  onTab,
  activity,
  counts,
}: {
  tab: SheetTab
  onTab: (tab: SheetTab) => void
  activity: Record<SheetTab, Activity>
  counts: Partial<Record<SheetTab, number>>
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = SHEET_TABS.findIndex((item) => item.id === tab)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % SHEET_TABS.length
    if (event.key === 'ArrowLeft') next = (index - 1 + SHEET_TABS.length) % SHEET_TABS.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = SHEET_TABS.length - 1
    if (next < 0) return
    // Keep the arrow keys from also turning the page.
    event.preventDefault()
    event.stopPropagation()
    const id = SHEET_TABS[next].id
    onTab(id)
    refs.current[id]?.focus()
  }

  return (
    <div role="tablist" aria-label="Study tools" className="mt-4 flex gap-1 px-4 lg:px-5">
      {SHEET_TABS.map((item) => {
        const selected = item.id === tab
        const state = activity[item.id]
        const count = counts[item.id]
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[item.id] = element
            }}
            type="button"
            role="tab"
            id={`sheet-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`sheet-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTab(item.id)}
            onKeyDown={onKeyDown}
            className={`relative -mb-px flex items-center gap-1.5 rounded-t-[6px] border px-3.5 pb-2 pt-[7px] font-sans text-[0.86rem] transition-colors focus-visible:outline-offset-[-3px] ${
              selected
                ? 'z-10 border-rule border-b-transparent bg-sheet font-[660] text-ink'
                : 'border-transparent font-[540] text-pencil hover:bg-sheet/50 hover:text-ink'
            }`}
          >
            {item.label}
            {count ? <span className="figures text-[0.74rem] font-[560] text-pencil">{count}</span> : null}
            {state && (
              <>
                <Dot kind={state === 'error' ? 'blocked' : state === 'queued' ? 'queued' : 'idle'} pulse={state === 'running'} />
                <span className="sr-only">({ACTIVITY_LABEL[state]})</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
