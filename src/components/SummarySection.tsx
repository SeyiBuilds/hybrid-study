import { useEffect, useState } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { cancelQueued, dismissJob, useJob } from '../ai/jobs'
import { buildSummaryPrompt, summarisePage, summaryJobKey } from '../ai/summaries'
import { getPageSummary, savePageSummary, type PageSummary } from '../lib/library'
import { hasUsableText, type PageText } from '../lib/pageText'
import { useNetwork } from '../lib/network'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { AiText, Lead, Problem, Queued, Row, RunHint, SheetHeading, SourceBadge, Working } from './sheet'
import { penField, pillButton, previewRun, quietButton, textButton } from './sheetStyles'

function toEditable(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:[*•–]|\d{1,2}[.)])\s+/, '- '))
    .join('\n')
}

export function SummarySection({
  documentId,
  title,
  page,
  deviceStatus,
}: {
  documentId: string
  title: string
  page: PageText
  deviceStatus: OnDeviceStatus | null
}) {
  const key = summaryJobKey(documentId, page.number)
  const job = useJob<PageSummary>(key)
  const runOn = useRunOn()
  const network = useNetwork()
  const [saved, setSaved] = useState<{ key: string; summary: PageSummary | null } | null>(null)
  const [draft, setDraft] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getPageSummary(documentId, page.number).then((summary) => {
      if (!cancelled) setSaved({ key, summary: summary ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [documentId, page.number, key])

  const loaded = saved?.key === key
  const summary = job?.status === 'done' ? job.result : loaded ? saved.summary : null
  const usable = hasUsableText(page)
  const preview = previewRun({
    task: 'summarise',
    runOn,
    network,
    deviceStatus,
    prompt: buildSummaryPrompt({ pageText: page.text, title, page: page.number }),
  })

  const start = () => {
    setDraft(null)
    void summarisePage({ documentId, title, page: page.number, pageText: page.text, force: forcedTarget(runOn) })
  }

  const saveEdit = async () => {
    if (!summary || draft === null) return
    const text = draft.trim()
    if (!text) return
    const updated = await savePageSummary({ ...summary, text, edited: true })
    dismissJob(key)
    setSaved({ key, summary: updated })
    setDraft(null)
  }

  let body
  if (!usable) {
    body = <Lead>There is no text on this page to summarise.</Lead>
  } else if (job?.status === 'queued') {
    body = (
      <Queued
        onDevice={
          deviceStatus === 'available'
            ? () => {
                cancelQueued(key)
                void summarisePage({ documentId, title, page: page.number, pageText: page.text, force: 'on_device' })
              }
            : undefined
        }
        onCancel={() => cancelQueued(key)}
      />
    )
  } else if (job?.status === 'running') {
    body = <Working target={job.target} startedAt={job.startedAt} />
  } else if (job?.status === 'error') {
    body = (
      <Problem message={job.message}>
        <button type="button" onClick={start} className={textButton} disabled={preview.blocked}>
          Try again
        </button>
      </Problem>
    )
  } else if (summary && draft !== null) {
    body = (
      <>
        <Row>
          <p className="on-lines font-sans text-[0.8rem] text-pencil">Rewrite it in your own words. One point per line.</p>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Edit the summary"
            autoFocus
            className={penField}
            style={{ minHeight: 'calc(var(--line) * 3 + 3px)' }}
          />
        </Row>
        <Row>
          <p className="on-lines flex items-center gap-4">
            <button type="button" onClick={() => void saveEdit()} className={pillButton}>
              Save summary
            </button>
            <button type="button" onClick={() => setDraft(null)} className={quietButton}>
              Cancel
            </button>
          </p>
        </Row>
      </>
    )
  } else if (summary) {
    body = (
      <>
        <SourceBadge source={summary.source} totalMs={summary.totalMs} bytes={summary.bytes} edited={summary.edited} />
        <Row>
          <AiText text={summary.text} />
        </Row>
        <Row>
          <p className="on-lines flex flex-wrap items-baseline gap-x-4">
            <button type="button" onClick={() => setDraft(toEditable(summary.text))} className={textButton}>
              Edit
            </button>
            <button type="button" onClick={start} className={quietButton} disabled={preview.blocked}>
              Summarise again
            </button>
          </p>
        </Row>
      </>
    )
  } else if (loaded) {
    body = (
      <>
        <Lead>The main points of this page in 3 to 5 bullets, which you can edit.</Lead>
        <Row>
          <p className="on-lines">
            <button type="button" onClick={start} disabled={preview.blocked} className={pillButton}>
              Summarise this page
            </button>
          </p>
        </Row>
        <RunHint preview={preview} />
      </>
    )
  } else {
    body = <div style={{ height: 'var(--line)' }} />
  }

  return (
    <section aria-label="Summary" aria-live="polite">
      <SheetHeading>Summary of page {page.number}</SheetHeading>
      {body}
    </section>
  )
}
