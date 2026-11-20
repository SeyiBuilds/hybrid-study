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
    <div className="relative" role="status">
      <span className="margin-note text-cloud">queued</span>
      <div className="past-margin pr-5 sm:pr-8">
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
    </div>
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
            ? deviceMessage
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="on-lines flex justify-between gap-4 font-sans text-[0.8rem]">
      <span className="shrink-0 text-pencil">{label}</span>
      <span className="figures truncate font-[560] text-ink">{value}</span>
    </p>
  )
}

/** The router's inputs and its recent decisions, for anyone curious (and for the demo). */
function RouterDetails({ deviceStatus, runOn, network }: { deviceStatus: OnDeviceStatus | null; runOn: RunOn; network: NetworkState }) {
  const log = useRouteLog()
  const speed = useDeviceSpeed()
  const saver = runOn === 'on_device' ? 'On (This laptop)' : network.saveData ? 'On (browser)' : 'Off'
  return (
    <>
      <Row>
        <DetailRow label="Connection" value={networkLabel(network)} />
        <DetailRow label="This laptop's AI" value={deviceStatus === 'available' ? 'Ready' : 'Not ready'} />
        <DetailRow label="This laptop's speed" value={speedLabel(speed)} />
        <DetailRow label="Data saver" value={saver} />
      </Row>
      <Row note={log.length > 0 ? 'latest' : undefined}>
        {log.length === 0 ? (
          <p className="on-lines font-sans text-[0.8rem] text-pencil">Decisions will appear here as you study.</p>
        ) : (
          log.map((entry) => (
            <p key={entry.id} className="on-lines font-sans text-[0.8rem] text-pencil">
              <span className="font-[560] text-ink">
                {TASK_LABELS[entry.task]}: {entry.deferred ? 'queued' : entry.target === 'on_device' ? 'this laptop' : 'cloud'}
              </span>
              {' · '}
              {entry.reason}
            </p>
          ))
        )}
      </Row>
    </>
  )
}

/**
 * The student's choice of where AI runs, written on the ruled line like options on a
 * question paper: the chosen one is underlined in red, and the margin records where
 * everyday requests will go right now.
 */
export function RunOnSwitch({ deviceStatus }: { deviceStatus: OnDeviceStatus | null }) {
  const runOn = useRunOn()
  const network = useNetwork()
  const deviceFast = deviceIsFast(useDeviceSpeed())
  const [showDetails, setShowDetails] = useState(false)
  const deviceReady = deviceStatus === 'available'
  const unavailable: Partial<Record<RunOn, string>> = {}
  if (!deviceReady) unavailable.on_device = "This laptop's AI is not ready"

  const decision = decide({ task: 'summarise', force: forcedTarget(runOn), onDeviceStatus: deviceStatus, network, deviceFast })
  const problem = unavailable[runOn] ? `${unavailable[runOn]}. Choose another option.` : null
  // Where everyday requests go right now: this laptop, the cloud, or the offline queue.
  const target = problem ? null : decision.deferred ? 'queued' : decision.target
  const help =
    problem ??
    (runOn === 'auto'
      ? autoHelp(network, deviceReady, deviceFast)
      : runOn === 'in_cloud' && decision.deferred
        ? "You're offline, so requests wait and go to the cloud when you're back online."
        : CHOICE_HELP[runOn])

  return (
    <>
      <Row
        note={target === 'on_device' ? 'device' : target === 'in_cloud' ? 'cloud' : target === 'queued' ? 'queued' : 'none'}
        noteClass={target === 'on_device' ? 'text-local' : target === 'queued' || target === 'in_cloud' ? 'text-cloud' : 'text-margin'}
      >
        <h2 id="run-ai-on" className="on-lines eyebrow">
          Run AI on
        </h2>
      </Row>
      <Row>
        <div role="radiogroup" aria-labelledby="run-ai-on" className="on-lines flex flex-wrap gap-x-5">
          {RUN_ON_OPTIONS.map((option) => {
            const selected = runOn === option.id
            const disabled = Boolean(unavailable[option.id]) && !selected
            return (
              <label
                key={option.id}
                title={unavailable[option.id]}
                className={`rounded-sm font-sans text-[0.9rem] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  selected
                    ? 'cursor-pointer font-[640] text-ink underline decoration-margin decoration-2 underline-offset-[5px]'
                    : disabled
                      ? 'cursor-not-allowed font-[500] text-pencil/50'
                      : 'cursor-pointer font-[500] text-pencil hover:text-ink'
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
      </Row>
      <Row>
        <p className={`on-lines font-sans text-[0.8rem] ${problem ? 'text-margin' : 'text-pencil'}`}>{help}</p>
        <p className="on-lines">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="font-sans text-[0.8rem] font-[560] text-pencil hover:text-ink"
          >
            {showDetails ? 'Hide how it decides' : 'How it decides'}
          </button>
        </p>
      </Row>
      {showDetails && <RouterDetails deviceStatus={deviceStatus} runOn={runOn} network={network} />}
    </>
  )
}
