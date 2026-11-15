/** Building blocks for the ruled study sheet. */
import { useEffect, useState, type ReactNode } from 'react'
import type { OnDeviceStatus, Target } from '../ai/client'
import { parseAiText } from '../ai/summaries'
import { dataSize, seconds } from '../lib/format'
import { setRunOn, useRunOn, type RunOn } from '../lib/runOn'

/** A row of the sheet, with an optional note written in the margin. */
export function Row({ note, noteClass = '', children }: { note?: ReactNode; noteClass?: string; children?: ReactNode }) {
  return (
    <div className="relative">
      {note !== undefined && <span className={`margin-note ${noteClass}`}>{note}</span>}
      <div className="past-margin pr-5 sm:pr-8">{children}</div>
    </div>
  )
}

/** One blank ruled line between sections. */
export function Gap() {
  return <div style={{ height: 'var(--line)' }} aria-hidden />
}

/** Renders **bold** spans from model output. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-[620]">
            {part}
          </strong>
        ) : (
          part.replace(/\*/g, '')
        ),
      )}
    </>
  )
}

/** AI text as bullets and lines, revealed whole once it is ready. */
export function AiText({ text }: { text: string }) {
  return (
    <div className="reading reveal">
      {parseAiText(text).map((line, index) =>
        line.kind === 'item' ? (
          <p key={index} className="on-lines flex gap-3">
            <span className="mt-[calc(var(--line)/2-3px)] h-1.5 w-1.5 shrink-0 rounded-full bg-ink/70" aria-hidden />
            <span className="min-w-0">
              <Inline text={line.text} />
            </span>
          </p>
        ) : (
          <p key={index} className="on-lines">
            <Inline text={line.text} />
          </p>
        ),
      )}
    </div>
  )
}

/** Where it ran, how long it took and the data used, stacked in the margin like marks on a script. */
export function MarginMarks({
  source,
  totalMs,
  bytes,
  edited = false,
}: {
  source: Target
  totalMs: number
  bytes: number
  edited?: boolean
}) {
  const local = source === 'on_device'
  const marks: Array<{ text: string; className: string }> = [
    { text: local ? 'device' : 'cloud', className: local ? 'text-local' : 'text-cloud' },
    { text: seconds(totalMs), className: '' },
    { text: dataSize(bytes), className: '' },
  ]
  if (edited) marks.push({ text: 'edited', className: 'text-pen' })
  return (
    <div
      className="absolute left-0 top-0"
      aria-label={`Ran ${local ? 'on this device' : 'in the cloud'}, took ${seconds(totalMs)}, used ${dataSize(bytes)} of data${edited ? ', edited by you' : ''}`}
    >
      {marks.map((mark, index) => (
        <span key={index} className={`margin-note ${mark.className}`} style={{ top: `calc(var(--line) * ${index})` }}>
          {mark.text}
        </span>
      ))}
    </div>
  )
}

function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [since])
  return Math.max(0, now - since)
}

/** Shown while the AI works: where it is running, a running clock, and a line being drawn. */
export function Working({ target, startedAt }: { target: Target | null; startedAt: number }) {
  const elapsed = useElapsed(startedAt)
  return (
    <div className="relative" role="status">
      <span className={`margin-note ${target === 'on_device' ? 'text-local' : target ? 'text-cloud' : ''}`}>
        {target === 'on_device' ? 'device' : target ? 'cloud' : '…'}
      </span>
      <span className="margin-note figures" style={{ top: 'var(--line)' }}>
        {seconds(elapsed)}
      </span>
      <div className="past-margin pr-5 sm:pr-8">
        <p className="on-lines font-sans text-[0.88rem] text-pencil">
          {target === 'on_device'
            ? 'Working on this laptop. This can take a little while.'
            : target
              ? 'Working in the cloud…'
              : 'Choosing where to run…'}
        </p>
        <div className="flex items-center" style={{ height: 'var(--line)' }}>
          <div className="pencil-line w-full max-w-[16rem]" />
        </div>
      </div>
    </div>
  )
}

const RUN_ON_OPTIONS: Array<{ id: RunOn; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'on_device', label: 'This laptop' },
  { id: 'in_cloud', label: 'Cloud' },
]

const RUN_ON_HELP: Record<RunOn, string> = {
  auto: 'Each request goes where it makes sense: this laptop when it can, the cloud when it must.',
  on_device: 'Free, private and works offline. Slower on laptops without a graphics card.',
  in_cloud: 'Usually faster. Uses mobile data, and needs a connection.',
}

/** The student's choice of where AI runs, for every request on the sheet. */
export function RunOnSwitch({ online, deviceStatus }: { online: boolean; deviceStatus: OnDeviceStatus | null }) {
  const runOn = useRunOn()
  const unavailable: Partial<Record<RunOn, string>> = {}
  if (deviceStatus !== 'available') unavailable.on_device = "This laptop's AI is not ready"
  if (!online) unavailable.in_cloud = 'You are offline'

  return (
    <>
      <Row note="AI">
        <div className="on-lines flex flex-wrap items-center gap-x-3">
          <span className="eyebrow">Run AI on</span>
          <span role="radiogroup" aria-label="Run AI on" className="inline-flex rounded-full border border-rule bg-desk/60 p-0.5">
            {RUN_ON_OPTIONS.map((option) => {
              const selected = runOn === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  title={unavailable[option.id]}
                  onClick={() => setRunOn(option.id)}
                  className={`h-[calc(var(--line)-10px)] rounded-full px-3 font-sans text-[0.78rem] font-[620] transition-colors ${
                    selected ? 'bg-ink text-sheet' : 'text-pencil hover:text-ink'
                  } ${unavailable[option.id] && !selected ? 'opacity-45' : ''}`}
                >
                  {option.label}
                </button>
              )
            })}
          </span>
        </div>
      </Row>
      <Row>
        <p className={`on-lines font-sans text-[0.8rem] ${unavailable[runOn] ? 'text-margin' : 'text-pencil'}`}>
          {unavailable[runOn] ? `${unavailable[runOn]}. Choose another option.` : RUN_ON_HELP[runOn]}
        </p>
      </Row>
    </>
  )
}
