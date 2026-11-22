/** Building blocks for the ruled study sheet. */
import { useEffect, useState, type ReactNode } from 'react'
import type { OnDeviceStatus, Target } from '../ai/client'
import { deviceIsFast, speedLabel, useDeviceSpeed } from '../ai/deviceSpeed'
import { useRouteLog } from '../ai/routeLog'
import { decide, type Task } from '../ai/router'
import { parseAiText } from '../ai/summaries'
import { dataSize, seconds } from '../lib/format'
import { networkLabel, useNetwork, type NetworkState } from '../lib/network'
import { forcedTarget, setRunOn, useRunOn, type RunOn } from '../lib/runOn'
import type { DotKind, RunPreview } from './sheetStyles'

/** A row of the sheet, to the right of the margin rule, with an optional note written in the margin. */
export function Row({ note, noteClass = '', children }: { note?: ReactNode; noteClass?: string; children?: ReactNode }) {
  return (
    <div className="relative">
      {note !== undefined && <span className={`margin-note ${noteClass}`}>{note}</span>}
      <div className="past-margin pr-5 sm:pr-7">{children}</div>
    </div>
  )
}

/** Says what this part of the sheet is, with an optional note on the right. */
export function SheetHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <Row>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="on-lines font-sans text-[1rem] font-[680] tracking-[-0.005em] text-ink">{children}</h2>
        {aside !== undefined && <span className="on-lines shrink-0 font-sans text-[0.78rem] text-pencil">{aside}</span>}
      </div>
    </Row>
  )
}

/** Plain-words lead-in under a heading. */
export function Lead({ children }: { children: ReactNode }) {
  return (
    <Row>
      <p className="on-lines font-sans text-[0.9rem] text-ink">{children}</p>
    </Row>
  )
}

const DOT_CLASS: Record<DotKind, string> = {
  device: 'bg-local',
  cloud: 'bg-cloud',
  queued: 'border-[1.5px] border-cloud',
  blocked: 'bg-margin',
  idle: 'bg-pencil/60',
}

const WHERE_CLASS: Record<DotKind, string> = {
  device: 'text-local',
  cloud: 'text-cloud',
  queued: 'text-cloud',
  blocked: 'text-margin',
  idle: 'text-ink',
}

/** A small coloured dot: green for this laptop, blue for the cloud, an open ring for queued. */
export function Dot({ kind, pulse = false }: { kind: DotKind; pulse?: boolean }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[kind]} ${pulse ? 'animate-pulse' : ''}`} aria-hidden />
}

/** A dot that lines up with the first line of the text beside it. */
function DotSlot({ kind, pulse }: { kind: DotKind; pulse?: boolean }) {
  return (
    <span className="flex h-[var(--line)] shrink-0 items-center">
      <Dot kind={kind} pulse={pulse} />
    </span>
  )
}

function Sep() {
  return <span aria-hidden>·</span>
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

/** The badge on every answer: where it ran, how long it took and the data it used. Actions sit on the right. */
export function SourceBadge({
  source,
  totalMs,
  bytes,
  edited = false,
  children,
}: {
  source: Target
  totalMs: number
  bytes: number
  edited?: boolean
  children?: ReactNode
}) {
  const kind: DotKind = source === 'on_device' ? 'device' : 'cloud'
  return (
    <Row>
      <div className="on-lines flex flex-wrap items-center justify-between gap-x-4">
        <p className="figures flex flex-wrap items-center gap-x-2 font-sans text-[0.78rem] text-pencil">
          <Dot kind={kind} />
          <span className={`font-[640] ${WHERE_CLASS[kind]}`}>{kind === 'device' ? 'This laptop' : 'Cloud'}</span>
          <Sep />
          <span>{seconds(totalMs)}</span>
          <Sep />
          <span>{bytes === 0 ? 'no data used' : `${dataSize(bytes)} used`}</span>
          {edited && (
            <>
              <Sep />
              <span className="text-pen">edited by you</span>
            </>
          )}
        </p>
        {children && <div className="flex items-baseline gap-4">{children}</div>}
      </div>
    </Row>
  )
}

/** Before a request runs: where it will go, why, and what it costs. */
export function RunHint({ preview }: { preview: RunPreview }) {
  return (
    <Row>
      <p data-run-hint className={`on-lines flex gap-2 font-sans text-[0.8rem] ${preview.blocked ? 'text-margin' : 'text-pencil'}`}>
        <DotSlot kind={preview.kind} />
        <span>{preview.text}</span>
      </p>
    </Row>
  )
}

/** Something went wrong, in red, with what the student can do about it. */
export function Problem({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <Row>
      <p className="on-lines flex items-center gap-2 font-sans text-[0.78rem] font-[640] text-margin">
        <Dot kind="blocked" />
        That didn&apos;t work
      </p>
      <p className="on-lines font-sans text-[0.88rem] text-margin">{message}</p>
      {children && <p className="on-lines flex flex-wrap items-baseline gap-x-4">{children}</p>}
    </Row>
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

/** A request waiting in the offline queue, with a way to run it on this laptop now or cancel it. */
export function Queued({
  onDevice,
  onCancel,
}: {
  /** Run it on this laptop instead of waiting; omitted when the laptop can't. */
  onDevice?: () => void
  onCancel: () => void
}) {
  return (
    <Row>
      <div role="status">
        <p className="on-lines flex items-center gap-2 font-sans text-[0.78rem]">
          <Dot kind="queued" />
          <span className="font-[640] text-cloud">Queued for the cloud</span>
        </p>
        <p className="on-lines font-sans text-[0.88rem] text-ink">
          Waiting for a connection. It goes to the cloud by itself when you&apos;re back online.
        </p>
        <p className="on-lines flex flex-wrap items-baseline gap-x-4">
          {onDevice && (
            <button
              type="button"
              onClick={onDevice}
              className="font-sans text-[0.82rem] font-[620] text-ink underline decoration-margin decoration-2 underline-offset-4"
            >
              Answer on this laptop now
            </button>
          )}
          <button type="button" onClick={onCancel} className="font-sans text-[0.8rem] font-[560] text-pencil hover:text-ink">
            Cancel
          </button>
        </p>
      </div>
    </Row>
  )
}

/** Shown while the AI works: where it is running, a running clock, and a line being drawn. */
export function Working({
  target,
  startedAt,
  deviceMessage = 'Working on this laptop. This can take a little while.',
}: {
  target: Target | null
  startedAt: number
  deviceMessage?: string
}) {
  const elapsed = useElapsed(startedAt)
  const kind: DotKind = target === 'on_device' ? 'device' : target ? 'cloud' : 'idle'
  return (
    <Row>
      <div role="status">
        <p className="on-lines figures flex items-center gap-2 font-sans text-[0.78rem] text-pencil">
          <Dot kind={kind} pulse />
          <span className={`font-[640] ${WHERE_CLASS[kind]}`}>
            {kind === 'device' ? 'This laptop' : kind === 'cloud' ? 'Cloud' : 'Choosing where to run'}
          </span>
          <Sep />
          <span aria-hidden>{seconds(elapsed)}</span>
        </p>
        <p className="on-lines font-sans text-[0.88rem] text-ink">
          {kind === 'device' ? deviceMessage : kind === 'cloud' ? 'Working in the cloud…' : 'Choosing where to run…'}
        </p>
        <div className="flex items-center" style={{ height: 'var(--line)' }}>
          <div className="pencil-line w-full max-w-[16rem]" />
        </div>
      </div>
    </Row>
  )
}

const RUN_ON_OPTIONS: Array<{ id: RunOn; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'on_device', label: 'This laptop' },
  { id: 'in_cloud', label: 'Cloud' },
]

const CHOICE_HELP: Record<Target, string> = {
  on_device: 'Data saver: free and works offline. Slower on laptops without a graphics card.',
  in_cloud: 'Usually faster, but uses data and needs a connection.',
}

const TASK_LABELS: Record<Task, string> = {
  summarise: 'Summary',
  ask: 'Question',
  quiz: 'Quiz',
  'connection-test': 'Connection test',
  'speed-check': 'Speed check',
}

function autoHelp(network: NetworkState, deviceReady: boolean, deviceFast: boolean): string {
  if (!deviceReady && network.quality === 'offline') {
    return "You're offline and this laptop's AI isn't ready, so requests wait and go to the cloud when you're back online."
  }
  if (!deviceReady) return "Using the cloud, because this laptop's AI is not ready."
  if (network.quality === 'offline') {
    return "You're offline, so simple tasks run on this laptop and hard questions wait for the cloud."
  }
  if (network.saveData) return "Your browser's data saver is on, so everything stays on this laptop."
  if (!network.usable) return 'The connection is very weak, so everything stays on this laptop.'
  if (!deviceFast) return 'This laptop is slow at AI, so requests use the cloud while the connection is good. Choose This laptop to save data.'
  return 'Simple tasks stay on this laptop. Hard questions use the cloud.'
}

/** The router's inputs and its recent decisions, for anyone curious (and for the demo). */
function RouterDetails({ deviceStatus, runOn, network }: { deviceStatus: OnDeviceStatus | null; runOn: RunOn; network: NetworkState }) {
  const log = useRouteLog()
  const speed = useDeviceSpeed()
  const saver = runOn === 'on_device' ? 'On (This laptop)' : network.saveData ? 'On (browser)' : 'Off'
  const rows: Array<[string, string]> = [
    ['Connection', networkLabel(network)],
    ["This laptop's AI", deviceStatus === 'available' ? 'Ready' : 'Not ready'],
    ["This laptop's speed", speedLabel(speed)],
    ['Data saver', saver],
  ]
  return (
    <div className="reveal mt-3 rounded-md border border-rule bg-sheet px-4 py-3 font-sans text-[0.8rem] leading-[1.5]">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-pencil">{label}</dt>
            <dd className="figures text-right font-[560] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-3 border-t border-rule pt-3 text-[0.72rem] font-[640] uppercase tracking-[0.06em] text-pencil">
        Recent decisions
      </h3>
      {log.length === 0 ? (
        <p className="mt-1 text-pencil">Decisions will appear here as you study.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {log.map((entry) => (
            <li key={entry.id} className="text-pencil">
              <span className="font-[600] text-ink">
                {TASK_LABELS[entry.task]}: {entry.deferred ? 'queued' : entry.target === 'on_device' ? 'this laptop' : 'cloud'}
              </span>
              {' · '}
              {entry.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The student's choice of where AI runs, above the sheet: a three-way switch, a dot
 * for where everyday requests go right now, and why.
 */
export function RunOnBar({ deviceStatus }: { deviceStatus: OnDeviceStatus | null }) {
  const runOn = useRunOn()
  const network = useNetwork()
  const deviceFast = deviceIsFast(useDeviceSpeed())
  const [showDetails, setShowDetails] = useState(false)
  const deviceReady = deviceStatus === 'available'
  const unavailable: Partial<Record<RunOn, string>> = {}
  if (!deviceReady) unavailable.on_device = "This laptop's AI is not ready"

  const decision = decide({ task: 'summarise', force: forcedTarget(runOn), onDeviceStatus: deviceStatus, network, deviceFast })
  const problem = unavailable[runOn] ? `${unavailable[runOn]}. Choose another option.` : null
  const kind: DotKind = problem ? 'blocked' : decision.deferred ? 'queued' : decision.target === 'on_device' ? 'device' : 'cloud'
  const help =
    problem ??
    (runOn === 'auto'
      ? autoHelp(network, deviceReady, deviceFast)
      : runOn === 'in_cloud' && decision.deferred
        ? "You're offline, so requests wait and go to the cloud when you're back online."
        : CHOICE_HELP[runOn])

  return (
    <div className="px-4 pt-4 lg:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="run-ai-on" className="font-sans text-[0.85rem] font-[680] text-ink">
          Run AI on
        </h2>
        <div role="radiogroup" aria-labelledby="run-ai-on" className="flex rounded-full border border-rule bg-sheet/60 p-[3px]">
          {RUN_ON_OPTIONS.map((option) => {
            const selected = runOn === option.id
            const disabled = Boolean(unavailable[option.id]) && !selected
            return (
              <label
                key={option.id}
                title={unavailable[option.id]}
                className={`rounded-full px-3.5 py-[5px] font-sans text-[0.82rem] leading-none transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  selected
                    ? 'cursor-pointer bg-ink font-[640] text-sheet'
                    : disabled
                      ? 'cursor-not-allowed font-[520] text-pencil/50'
                      : 'cursor-pointer font-[520] text-pencil hover:text-ink'
                }`}
              >
                <input
                  type="radio"
                  name="run-ai-on"
                  value={option.id}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setRunOn(option.id)}
                  className="sr-only"
                />
                {option.label}
              </label>
            )
          })}
        </div>
      </div>
      <div className="mt-2.5 flex gap-2.5 font-sans text-[0.8rem] leading-[1.45]">
        <span className="flex h-[1.45em] shrink-0 items-center">
          <Dot kind={kind} />
        </span>
        <p className={problem ? 'text-margin' : 'text-pencil'}>
          {help}{' '}
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="whitespace-nowrap font-[620] text-ink underline decoration-rule decoration-1 underline-offset-[3px] hover:decoration-ink"
          >
            {showDetails ? 'Hide how it decides' : 'How it decides'}
          </button>
        </p>
      </div>
      {showDetails && <RouterDetails deviceStatus={deviceStatus} runOn={runOn} network={network} />}
    </div>
  )
}
