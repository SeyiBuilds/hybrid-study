import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { askAboutPage, askJobPrefix, type AskMeta } from '../ai/asks'
import { dismissJob, useJobs } from '../ai/jobs'
import { askPrompt } from '../ai/prompts'
import { deleteAnswer, listAnswers, type PageAnswer } from '../lib/library'
import { hasUsableText, type PageText } from '../lib/pageText'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { AiText, MarginMarks, Row, Working } from './sheet'
import { penField, pillButton, previewRun, quietButton } from './sheetStyles'

function Question({ question, quote }: { question: string; quote?: string }) {
  return (
    <>
      {quote && (
        <Row>
          <p className="on-lines line-clamp-2 font-read text-[0.9rem] italic text-pencil">“{quote}”</p>
        </Row>
      )}
      <Row note="you" noteClass="text-pen">
        <p className="reading on-lines text-pen">{question}</p>
      </Row>
    </>
  )
}

export function AskSection({
  documentId,
  title,
  page,
  online,
  deviceStatus,
  prefill,
}: {
  documentId: string
  title: string
  page: PageText
  online: boolean
  deviceStatus: OnDeviceStatus | null
  /** Highlighted words to ask about, sent from the page toolbar. */
  prefill: { quote: string; nonce: number } | null
}) {
  const runOn = useRunOn()
  const prefix = askJobPrefix(documentId, page.number)
  const jobs = useJobs<PageAnswer, AskMeta>(prefix)
  const [saved, setSaved] = useState<{ prefix: string; answers: PageAnswer[] } | null>(null)
  const [question, setQuestion] = useState('')
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

  const prompt = askPrompt({ pageText: page.text, title, page: page.number, question: question || 'x', quote: quote ?? undefined })
  const preview = previewRun({ task: 'ask', runOn, online, deviceStatus, prompt })
  const canAsk = usable && question.trim().length > 1 && !preview.blocked

  const submit = () => {
    if (!canAsk) return
    void askAboutPage({
      documentId,
      title,
      page: page.number,
      pageText: page.text,
      question: question.trim(),
      quote: quote ?? undefined,
      force: forcedTarget(runOn),
    })
    setQuestion('')
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
      <Row note="ask">
        <h2 className="on-lines eyebrow">Ask about this page</h2>
      </Row>

      {!usable ? (
        <Row>
          <p className="on-lines font-sans text-[0.88rem] text-pencil">There is no text on this page to ask about.</p>
        </Row>
      ) : (
        <>
          {quote && (
            <Row>
              <p className="on-lines flex items-baseline gap-3">
                <span className="min-w-0 truncate font-read text-[0.9rem] italic text-pencil">About “{quote}”</span>
                <button type="button" onClick={clearQuote} className={quietButton}>
                  Clear
                </button>
              </p>
            </Row>
          )}
          <Row note="you" noteClass="text-pen">
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              aria-label="Your question"
              placeholder={quote ? 'What do you want to know about this?' : 'Type a question about this page…'}
              className={penField}
            />
          </Row>
          <Row>
            <p className="on-lines flex flex-wrap items-center gap-x-4">
              <button type="button" onClick={submit} disabled={!canAsk} className={pillButton}>
                Ask
              </button>
              <span className={`font-sans text-[0.8rem] ${preview.blocked ? 'text-margin' : 'text-pencil'}`}>{preview.text}</span>
            </p>
          </Row>
        </>
      )}

      {pending.map((job) => (
        <div key={job.key} style={{ marginTop: 'var(--line)' }}>
          <Question question={job.meta.question} quote={job.meta.quote} />
          {job.status === 'running' ? (
            <Working target={job.target} startedAt={job.startedAt} />
          ) : (
            <>
              <Row note="error" noteClass="text-margin">
                <p className="on-lines font-sans text-[0.88rem] text-margin">{job.message}</p>
              </Row>
              <Row>
                <p className="on-lines">
                  <button type="button" onClick={() => dismissJob(job.key)} className={quietButton}>
                    Dismiss
                  </button>
                </p>
              </Row>
            </>
          )}
        </div>
      ))}

      {answers.map((answer) => (
        <div key={answer.id} style={{ marginTop: 'var(--line)' }}>
          <Question question={answer.question} quote={answer.quote} />
          <div className="relative" style={{ minHeight: 'calc(var(--line) * 3)' }}>
            <MarginMarks source={answer.source} totalMs={answer.totalMs} bytes={answer.bytes} />
            <div className="past-margin pr-5 sm:pr-8">
              <AiText text={answer.text} />
            </div>
          </div>
          <Row>
            <p className="on-lines">
              <button type="button" onClick={() => void remove(answer.id)} className={quietButton}>
                Remove
              </button>
            </p>
          </Row>
        </div>
      ))}
    </section>
  )
}
