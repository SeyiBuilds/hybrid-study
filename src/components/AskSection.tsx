import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { askAboutPage, askIdFromKey, askJobPrefix, buildAskPrompt, type AskMeta } from '../ai/asks'
import { classifyQuestion, wantsDiagram } from '../ai/difficulty'
import { cancelQueued, dismissJob, useJobs } from '../ai/jobs'
import { deleteAnswer, listAnswers, type PageAnswer } from '../lib/library'
import { hasUsableText, type PageText } from '../lib/pageText'
import { useNetwork } from '../lib/network'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { AiText, Lead, Problem, Queued, Row, RunHint, SheetHeading, SourceBadge, Working } from './sheet'
import { penField, pillButton, previewRun, quietButton } from './sheetStyles'

/** One question on the sheet, written in blue pen, with the highlighted words it was about. */
function Entry({ question, quote, children }: { question: string; quote?: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 'var(--line)' }}>
      {quote && (
        <Row>
          <p className="on-lines line-clamp-2 font-read text-[0.9rem] italic text-pencil">“{quote}”</p>
        </Row>
      )}
      <Row>
        <p className="reading on-lines font-[560] text-pen">{question}</p>
      </Row>
      {children}
    </div>
  )
}

export function AskSection({
  documentId,
  title,
  page,
  pages,
  deviceStatus,
  prefill,
}: {
  documentId: string
  title: string
  page: PageText
  /** Every page of the document, for cross-page questions. */
  pages: PageText[]
  deviceStatus: OnDeviceStatus | null
  /** Highlighted words to ask about, sent from the page toolbar. */
  prefill: { quote: string; nonce: number } | null
}) {
  const runOn = useRunOn()
  const network = useNetwork()
  const prefix = askJobPrefix(documentId, page.number)
  const jobs = useJobs<PageAnswer, AskMeta>(prefix)
  const [saved, setSaved] = useState<{ prefix: string; answers: PageAnswer[] } | null>(null)
  const [question, setQuestion] = useState('')
  const [withDiagram, setWithDiagram] = useState(false)
  // The newest highlight sent from the page wins until the student clears it or asks.
  const [usedNonce, setUsedNonce] = useState<number | null>(null)
  const quote = prefill && prefill.nonce !== usedNonce ? prefill.quote : null
  const clearQuote = () => setUsedNonce(prefill?.nonce ?? null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const usable = hasUsableText(page)

  useEffect(() => {
    let cancelled = false
    listAnswers(documentId, page.number).then((answers) => {
      if (!cancelled) setSaved({ prefix, answers })
    })
    return () => {
      cancelled = true
    }
  }, [documentId, page.number, prefix])

  // A question started from a highlight: put the cursor in the box.
  useEffect(() => {
    if (!prefill) return
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [prefill])

  // Saved answers plus finished ones from this session, newest first; running and failed ones on top.
  const answers = useMemo(() => {
    const list = saved?.prefix === prefix ? [...saved.answers] : []
    for (const job of jobs) {
      if (job.status === 'done' && !list.some((answer) => answer.id === job.result.id)) list.push(job.result)
    }
    return list.sort((a, b) => b.createdAt - a.createdAt)
  }, [saved, prefix, jobs])
  const pending = jobs.filter((job) => job.status !== 'done')

  // "Add a diagram" asks for one in words, so the answer, the router and the offline queue all see it.
  const asked = question.trim() && withDiagram && !wantsDiagram(question) ? `${question.trim()} (with a diagram)` : question.trim()
  const input = { documentId, title, page: page.number, pageText: page.text, pages, question: asked, quote: quote ?? undefined }
  const preview = previewRun({
    task: 'ask',
    difficulty: classifyQuestion(input.question).difficulty,
    runOn,
    network,
    deviceStatus,
    prompt: (target) => buildAskPrompt(input, target),
  })
  const canAsk = usable && question.trim().length > 1 && !preview.blocked

  const submit = () => {
    if (!canAsk) return
    void askAboutPage({ ...input, force: forcedTarget(runOn) })
    setQuestion('')
    setWithDiagram(false)
    clearQuote()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const remove = async (id: string) => {
    await deleteAnswer(id)
    dismissJob(`${prefix}${id}`)
    setSaved((current) => (current ? { ...current, answers: current.answers.filter((answer) => answer.id !== id) } : current))
  }

  return (
    <section aria-label="Ask about this page">
      <SheetHeading>Ask about page {page.number}</SheetHeading>

      {!usable ? (
        <Lead>There is no text on this page to ask about.</Lead>
      ) : (
        <>
          {quote ? (
            <Row>
              <p className="on-lines flex items-baseline gap-3">
                <span className="min-w-0 truncate font-read text-[0.9rem] italic text-pencil">About “{quote}”</span>
                <button type="button" onClick={clearQuote} className={quietButton}>
                  Clear
                </button>
              </p>
            </Row>
          ) : (
            <Lead>Ask anything about this page, or select words on the page and press Ask or Explain.</Lead>
          )}
          <Row>
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              aria-label="Your question"
              placeholder={quote ? 'What do you want to know about this?' : 'Type your question here…'}
              className={penField}
              style={{ minHeight: 'calc(var(--line) * 2 + 3px)' }}
            />
          </Row>
          <Row>
            <div className="on-lines flex items-center gap-5">
              <button type="button" onClick={submit} disabled={!canAsk} className={pillButton}>
                Ask
              </button>
              <label className="flex cursor-pointer items-center gap-2 font-sans text-[0.8rem] text-pencil hover:text-ink">
                <input
                  type="checkbox"
                  checked={withDiagram}
                  onChange={(event) => setWithDiagram(event.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--color-ink)]"
                />
                Add a diagram
              </label>
            </div>
          </Row>
          <RunHint preview={preview} />
        </>
      )}

      {pending.map((job) => (
        <Entry key={job.key} question={job.meta.question} quote={job.meta.quote}>
          {job.status === 'queued' ? (
            <Queued
              onDevice={
                deviceStatus === 'available'
                  ? () => {
                      cancelQueued(job.key)
                      void askAboutPage({
                        ...input,
                        question: job.meta.question,
                        quote: job.meta.quote,
                        id: askIdFromKey(job.key),
                        force: 'on_device',
                      })
                    }
                  : undefined
              }
              onCancel={() => cancelQueued(job.key)}
            />
          ) : job.status === 'running' ? (
            <Working target={job.target} startedAt={job.startedAt} />
          ) : (
            <Problem message={job.message}>
              <button type="button" onClick={() => dismissJob(job.key)} className={quietButton}>
                Dismiss
              </button>
            </Problem>
          )}
        </Entry>
      ))}

      {answers.map((answer) => (
        <Entry key={answer.id} question={answer.question} quote={answer.quote}>
          <SourceBadge source={answer.source} totalMs={answer.totalMs} bytes={answer.bytes}>
            <button type="button" onClick={() => void remove(answer.id)} className={quietButton}>
              Remove
            </button>
          </SourceBadge>
          <Row>
            <AiText text={answer.text} />
          </Row>
        </Entry>
      ))}
    </section>
  )
}
