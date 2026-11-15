import { useEffect, useState, type ReactNode } from 'react'
import { estimateCloudBytesFor, type OnDeviceStatus } from '../ai/client'
import { decide } from '../ai/router'
import { buildSummaryPrompt, parseSummary, summarisePage, summaryKey, useSummaryJob } from '../ai/summaries'
import { dataSize, seconds } from '../lib/format'
import { getPageSummary, type PageSummary } from '../lib/library'
import { hasUsableText, type PageText } from '../lib/pageText'

/** A row of the sheet, with an optional note written in the margin. */
function Row({ note, noteClass = '', children }: { note?: ReactNode; noteClass?: string; children?: ReactNode }) {
  return (
    <div className="relative">
      {note !== undefined && <span className={`margin-note ${noteClass}`}>{note}</span>}
      <div className="past-margin pr-5 sm:pr-8">{children}</div>
    </div>
  )
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

function SummaryText({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = parseSummary(text)
  return (
    <div className="reading">
      {lines.map((line, index) =>
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
      {streaming && <span className="ml-1 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-ink" aria-hidden />}
    </div>
  )
}

/** Where it ran, how long it took and the data it used, stacked in the margin like marks on a script. */
function MarginMarks({ summary }: { summary: PageSummary }) {
  const local = summary.source === 'on_device'
  const marks = [local ? 'device' : 'cloud', seconds(summary.totalMs), dataSize(summary.bytes)]
  return (
    <div className="absolute left-0 top-0" aria-label={`Ran ${local ? 'on this device' : 'in the cloud'}, took ${seconds(summary.totalMs)}, used ${dataSize(summary.bytes)} of data`}>
      {marks.map((mark, index) => (
        <span
          key={mark + index}
          className={`margin-note ${index === 0 ? (local ? 'text-local' : 'text-cloud') : ''}`}
          style={{ top: `calc(var(--line) * ${index})` }}
        >
          {mark}
        </span>
      ))}
    </div>
  )
}

function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, now - since)
}

const pillButton =
  'inline-flex h-[calc(var(--line)-6px)] items-center rounded-full bg-ink px-4 font-sans text-[0.85rem] font-[620] text-sheet transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
const textButton = 'font-sans text-[0.82rem] font-[620] text-ink underline decoration-margin decoration-2 underline-offset-4'

export function SummarySection({
  documentId,
  title,
  page,
  online,
  deviceStatus,
}: {
  documentId: string
  title: string
  page: PageText
  online: boolean
  deviceStatus: OnDeviceStatus | null
}) {
  const key = summaryKey(documentId, page.number)
  const job = useSummaryJob(key)
  const [saved, setSaved] = useState<{ key: string; summary: PageSummary | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    getPageSummary(documentId, page.number).then((summary) => {
      if (!cancelled) setSaved({ key, summary: summary ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [documentId, page.number, key])

  const running = job?.status === 'running' ? job : null
  const elapsed = useElapsed(running ? running.startedAt : null)
  const usable = hasUsableText(page)
  const savedSummary = saved?.key === key ? saved.summary : null
  const summary = job?.status === 'done' ? job.summary : savedSummary
  const loaded = saved?.key === key

  const start = () => void summarisePage({ documentId, title, page: page.number, pageText: page.text })

  const decision = decide({ task: 'summarise', onDeviceStatus: deviceStatus, online })
  const preview = !decision
    ? 'You are offline, and this browser cannot run AI on the device.'
    : decision.target === 'on_device'
      ? 'Runs on this laptop and uses no data.'
      : `Runs in the cloud and uses about ${dataSize(estimateCloudBytesFor(buildSummaryPrompt({ pageText: page.text, title, page: page.number })), { approximate: false })} of data.`

  return (
    <section aria-label="Summary" aria-live="polite">
      <Row note={<span className="figures">p.&nbsp;{page.number}</span>}>
        <p className="on-lines eyebrow">Summary</p>
      </Row>

      {!usable ? (
        <Row>
          <p className="on-lines text-[0.88rem] text-pencil">There is no text on this page to summarise.</p>
        </Row>
      ) : running ? (
        <div className="relative">
          <span className={`margin-note ${running.target === 'on_device' ? 'text-local' : running.target ? 'text-cloud' : ''}`}>
            {running.target === 'on_device' ? 'device' : running.target ? 'cloud' : '…'}
          </span>
          <span className="margin-note figures" style={{ top: 'var(--line)' }}>
            {seconds(elapsed)}
          </span>
          <div className="past-margin pr-5 sm:pr-8">
            {running.text ? (
              <SummaryText text={running.text} streaming />
            ) : (
              <p className="on-lines font-sans text-[0.88rem] text-pencil">
                {running.target === 'on_device'
                  ? 'Writing on this laptop. The first words can take a few seconds.'
                  : running.target
                    ? 'Writing in the cloud…'
                    : 'Choosing where to run…'}
              </p>
            )}
          </div>
        </div>
      ) : job?.status === 'error' ? (
        <>
          <Row note="error" noteClass="text-margin">
            <p className="on-lines font-sans text-[0.88rem] text-margin">{job.message}</p>
          </Row>
          <Row>
            <p className="on-lines">
              <button type="button" onClick={start} className={textButton} disabled={!decision}>
                Try again
              </button>
            </p>
          </Row>
        </>
      ) : summary ? (
        <>
          <div className="relative" style={{ minHeight: 'calc(var(--line) * 3)' }}>
            <MarginMarks summary={summary} />
            <div className="past-margin pr-5 sm:pr-8">
              <SummaryText text={summary.text} streaming={false} />
            </div>
          </div>
          <Row>
            <p className="on-lines flex flex-wrap items-baseline gap-x-4 font-sans text-[0.8rem] text-pencil">
              <button type="button" onClick={start} className={textButton} disabled={!decision}>
                Summarise again
              </button>
              <span>Saved on this laptop</span>
            </p>
          </Row>
        </>
      ) : loaded ? (
        <>
          <Row>
            <p className="on-lines">
              <button type="button" onClick={start} disabled={!decision} className={pillButton}>
                Summarise this page
              </button>
            </p>
          </Row>
          <Row>
            <p className="on-lines font-sans text-[0.8rem] text-pencil">{preview}</p>
          </Row>
        </>
      ) : (
        <Row>
          <p className="on-lines" />
        </Row>
      )}
    </section>
  )
}
