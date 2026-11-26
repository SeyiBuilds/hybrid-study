import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { describeError, estimateCloudBytesFor, type OnDeviceStatus, type Target } from '../ai/client'
import { deviceIsFast } from '../ai/deviceSpeed'
import { DeferredError } from '../ai/errors'
import { gradeFor, writtenCountFor, type Exam, type ExamQuestion } from '../ai/examFormat'
import {
  ExamCancelled,
  explainExamQuestion,
  explainJobKey,
  markExam,
  objectiveScore,
  retakeExam,
  writeExam,
  type WriteProgress,
} from '../ai/exams'
import { useJob } from '../ai/jobs'
import { QUIZ_LEVELS, type QuizLevel } from '../ai/quiz'
import { decide } from '../ai/router'
import { Rich } from '../components/RichText'
import { AiText, Dot, Problem, Row, Working } from '../components/sheet'
import { penField, pillButton, quietButton, textButton, type DotKind } from '../components/sheetStyles'
import { dataSize, seconds, timeAgo } from '../lib/format'
import { readPdfText } from '../lib/importPdf'
import {
  deletePastQuestions,
  getContent,
  getDocumentSummary,
  getExam,
  getPastQuestions,
  listExams,
  saveExam,
  savePastQuestions,
  type DocumentContent,
  type DocumentSummary,
  type PastQuestions,
} from '../lib/library'
import { useNetwork } from '../lib/network'
import { useExamPrefs } from '../lib/readerPrefs'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { navigate, routes } from '../lib/useHashRoute'

interface Loaded {
  summary: DocumentSummary
  content: DocumentContent
}

const COUNTS = [20, 40, 60]
const MINUTES = [15, 30, 45, 60, 90, 120]
const paper: CSSProperties = { '--margin': '3.25rem', paddingTop: 'var(--line)', paddingBottom: 'calc(var(--line) * 2)' } as CSSProperties

function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-36 shrink-0 font-sans text-[0.86rem] font-[660] text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex w-fit flex-wrap rounded-[18px] border border-rule bg-desk/60 p-[3px]">
        {options.map((option) => {
          const selected = option.id === value
          return (
            <label
              key={String(option.id)}
              className={`cursor-pointer rounded-full px-3.5 py-[6px] font-sans text-[0.84rem] leading-none transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                selected ? 'bg-ink font-[640] text-sheet' : 'font-[520] text-pencil hover:text-ink'
              }`}
            >
              <input type="radio" className="sr-only" checked={selected} onChange={() => onChange(option.id)} />
              {option.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`
}

/** A drawn tick or cross, green for right and red for missed. */
function Mark({ right }: { right: boolean }) {
  const paths = right
    ? ['M3 12.5c2.1 2.2 3.8 4.6 5.4 7.3C11.8 13.3 16 8 21.2 3.6']
    : ['M5 4.8c4.2 4.8 9 9.7 14.2 14.6', 'M19.4 4.4C14.2 9.2 9.5 14.2 4.6 19.8']
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${right ? 'text-local' : 'text-margin'}`} fill="none" aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      ))}
    </svg>
  )
}

function levelLabel(level: QuizLevel): string {
  return QUIZ_LEVELS.find((item) => item.id === level)?.label ?? level
}

// ─── Setup ───────────────────────────────────────────────────────────────────

function PastQuestionsField({
  documentId,
  past,
  onChange,
  usePast,
  onUsePast,
}: {
  documentId: string
  past: PastQuestions | null
  onChange: (past: PastQuestions | null) => void
  usePast: boolean
  onUsePast: (use: boolean) => void
}) {
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const add = async (file: File) => {
    setReading(true)
    setError(null)
    try {
      const { text, pages } = await readPdfText(file)
      const saved = await savePastQuestions({ documentId, fileName: file.name, pages, text, addedAt: Date.now() })
      onChange(saved)
      onUsePast(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be read.')
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-36 shrink-0 pt-1 font-sans text-[0.86rem] font-[660] text-ink">Past questions</span>
      <div className="min-w-0 flex-1 font-sans text-[0.86rem]">
        {past ? (
          <>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={usePast} onChange={(event) => onUsePast(event.target.checked)} className="mt-[3px] accent-[var(--color-ink)]" />
              <span>
                <span className="font-[600] text-ink">Set questions like {past.fileName}</span>
                <span className="block text-pencil">
                  Same style and difficulty, new questions. {past.pages} {past.pages === 1 ? 'page' : 'pages'}, kept on this laptop.
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={() => void deletePastQuestions(documentId).then(() => onChange(null))}
              className={`${quietButton} mt-1 pl-[1.6rem]`}
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={reading}
              className="rounded-full border border-rule px-3.5 py-[6px] font-[600] text-ink hover:bg-desk disabled:opacity-50"
            >
              {reading ? 'Reading…' : 'Add a past questions PDF'}
            </button>
            <p className="mt-1.5 text-pencil">Optional. New questions will follow its style and difficulty without copying it.</p>
          </>
        )}
        {error && <p className="mt-1.5 text-margin">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void add(file)
          }}
        />
      </div>
    </div>
  )
}

function WritingPanel({ writing, onCancel }: { writing: { progress: WriteProgress; startedAt: number }; onCancel: () => void }) {
  const now = useNow(500)
  const { done, total, target } = writing.progress
  const kind: DotKind = target === 'on_device' ? 'device' : target ? 'cloud' : 'idle'
  return (
    <section className="mt-8 rounded-[6px] border border-rule bg-sheet p-5 sm:p-7" role="status">
      <h2 className="font-sans text-[1.05rem] font-[680]">Writing your exam</h2>
      <p className="figures mt-3 flex items-center gap-2 font-sans text-[0.84rem] text-pencil">
        <Dot kind={kind} pulse />
        <span className={`font-[640] ${kind === 'device' ? 'text-local' : kind === 'cloud' ? 'text-cloud' : 'text-ink'}`}>
          {kind === 'device' ? 'This laptop' : kind === 'cloud' ? 'Cloud' : 'Choosing where to run'}
        </span>
        <span aria-hidden>·</span>
        <span>{seconds(now - writing.startedAt)}</span>
      </p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-ruling">
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
      <p className="figures mt-2 font-sans text-[0.84rem] text-ink">
        {done} of {total} questions written
      </p>
      <p className="mt-3 font-sans text-[0.84rem] text-pencil">
        You won&apos;t see the questions until you start the timer.
        {target === 'on_device' && ' Writing a long exam on this laptop can take several minutes.'}
      </p>
      <button type="button" onClick={onCancel} className={`${quietButton} mt-4`}>
        Cancel
      </button>
    </section>
  )
}

function History({ documentId, exams }: { documentId: string; exams: Exam[] }) {
  if (exams.length === 0) return null
  return (
    <section className="mt-10" aria-label="Your exams on these notes">
      <h2 className="eyebrow">Your exams on these notes</h2>
      <ul className="mt-3 divide-y divide-rule rounded-[6px] border border-rule bg-sheet">
        {exams.map((exam) => {
          const percent = exam.markedAt && exam.outOf ? Math.round(((exam.score ?? 0) / exam.outOf) * 100) : null
          const status =
            percent !== null
              ? `${gradeFor(percent)} · ${percent}%`
              : exam.submittedAt
                ? 'Waiting to be marked'
                : exam.startedAt
                  ? 'In progress'
                  : 'Not started'
          return (
            <li key={exam.id}>
              <a
                href={routes.exam(documentId, exam.id)}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 font-sans text-[0.86rem] hover:bg-desk/50"
              >
                <span>
                  <span className="font-[620] text-ink">
                    {exam.questions.length} questions · {exam.settings.minutes} min · {levelLabel(exam.settings.level)}
                  </span>
                  <span className="ml-2 text-pencil">{timeAgo(exam.createdAt)}</span>
                </span>
                <span
                  className={`figures font-[660] ${percent === null ? 'text-pencil' : percent >= 50 ? 'text-local' : 'text-margin'}`}
                >
                  {status}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ExamSetup({ doc, deviceStatus }: { doc: Loaded; deviceStatus: OnDeviceStatus | null }) {
  const [prefs, setPrefs] = useExamPrefs()
  const total = doc.content.pages.length
  const [range, setRange] = useState({ from: 1, to: total })
  const [past, setPast] = useState<PastQuestions | null>(null)
  const [usePast, setUsePast] = useState(true)
  const [history, setHistory] = useState<Exam[]>([])
  const [writing, setWriting] = useState<{ progress: WriteProgress; startedAt: number } | null>(null)
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null)
  const cancelled = useRef(false)
  const runOn = useRunOn()
  const network = useNetwork()

  useEffect(() => {
    let stale = false
    void getPastQuestions(doc.summary.id).then((found) => !stale && setPast(found ?? null))
    void listExams(doc.summary.id).then((list) => !stale && setHistory(list))
    return () => {
      stale = true
      cancelled.current = true
    }
  }, [doc.summary.id])

  const writtenCount = writtenCountFor(prefs)
  const from = Math.min(Math.max(1, range.from), total)
  const to = Math.min(Math.max(from, range.to), total)
  const decision = decide({
    task: 'exam',
    difficulty: 'hard',
    force: forcedTarget(runOn),
    onDeviceStatus: deviceStatus,
    network,
    deviceFast: deviceIsFast(),
  })
  const noteChars = doc.content.pages
    .filter((page) => page.number >= from && page.number <= to)
    .reduce((sum, page) => sum + page.text.length, 0)
  const cloudBytes = estimateCloudBytesFor('x'.repeat(Math.min(noteChars, 24000 * Math.ceil(prefs.count / 10)) + 2000), prefs.count * 380)
  const where: { kind: DotKind; text: string } = decision.deferred
    ? { kind: 'queued', text: "You're offline. Exams are written in the cloud because a long exam takes many minutes on a laptop. Connect to start." }
    : decision.target === 'on_device'
      ? { kind: 'device', text: `Questions are written on this laptop and use no data. ${prefs.count} questions can take several minutes.` }
      : { kind: 'cloud', text: `Questions are written in the cloud and use about ${dataSize(cloudBytes, { approximate: false })} of data.` }

  const start = async (force?: Target) => {
    cancelled.current = false
    setError(null)
    setWriting({ progress: { done: 0, total: prefs.count, target: null }, startedAt: Date.now() })
    try {
      const exam = await writeExam({
        documentId: doc.summary.id,
        title: doc.summary.title,
        pages: doc.content.pages,
        settings: { ...prefs, fromPage: from, toPage: to, usePast: usePast && !!past },
        past: past?.text,
        force: force ?? forcedTarget(runOn),
        onProgress: (progress) => setWriting((current) => (current ? { ...current, progress } : current)),
        isCancelled: () => cancelled.current,
      })
      navigate(routes.exam(doc.summary.id, exam.id))
    } catch (caught) {
      if (caught instanceof ExamCancelled) return
      const offline = caught instanceof DeferredError
      setError({
        message: offline
          ? "You're offline, so the exam can't be written in the cloud right now."
          : describeError(caught),
        offline,
      })
    } finally {
      setWriting(null)
    }
  }

  const pageInput = (value: number, onValue: (n: number) => void, label: string) => (
    <input
      type="number"
      min={1}
      max={total}
      value={value}
      aria-label={label}
      onChange={(event) => onValue(Number(event.target.value) || 1)}
      className="figures w-16 rounded-md border border-rule bg-desk/45 px-2 py-1 text-center font-[620] text-ink"
    />
  )

  return (
    <main className="mx-auto max-w-[860px] px-4 pb-16 pt-8 sm:px-6">
      <p className="eyebrow">Exam mode</p>
      <h1 className="display mt-2 text-[clamp(2.3rem,6vw,3.5rem)]">Sit a timed exam</h1>
      <p className="mt-3 max-w-[38rem] text-[1rem] leading-relaxed text-pencil">
        On <span className="font-[620] text-ink">{doc.summary.title}</span>. Your notes close and a timer starts. When time is up, or you
        submit, your paper is marked with a grade, corrections and tips.
      </p>

      {writing ? (
        <WritingPanel writing={writing} onCancel={() => (cancelled.current = true)} />
      ) : (
        <section className="mt-8 space-y-5 rounded-[6px] border border-rule bg-sheet p-5 shadow-[0_18px_40px_-28px_rgb(24_40_72/0.5)] sm:p-7">
          <Choice
            label="Questions"
            value={prefs.count}
            options={COUNTS.map((count) => ({ id: count, label: String(count) }))}
            onChange={(count) => setPrefs({ ...prefs, count, minutes: Math.max(prefs.minutes, count === 60 ? 90 : count === 40 ? 60 : 30) })}
          />
          <Choice
            label="Question types"
            value={prefs.written}
            options={[
              { id: false, label: 'Multiple choice only' },
              { id: true, label: `Multiple choice + ${writtenCountFor({ count: prefs.count, written: true })} written` },
            ]}
            onChange={(written) => setPrefs({ ...prefs, written })}
          />
          <Choice label="Difficulty" value={prefs.level} options={QUIZ_LEVELS} onChange={(level) => setPrefs({ ...prefs, level })} />
          <Choice
            label="Time allowed"
            value={prefs.minutes}
            options={MINUTES.map((minutes) => ({ id: minutes, label: minutes < 60 ? `${minutes} min` : `${minutes / 60} h`.replace('1.5 h', '1½ h') }))}
            onChange={(minutes) => setPrefs({ ...prefs, minutes })}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-36 shrink-0 font-sans text-[0.86rem] font-[660] text-ink">Pages</span>
            <div className="flex items-center gap-2 font-sans text-[0.86rem] text-pencil">
              From {pageInput(range.from, (n) => setRange({ ...range, from: n }), 'From page')} to{' '}
              {pageInput(range.to, (n) => setRange({ ...range, to: n }), 'To page')} of {total}
            </div>
          </div>
          <PastQuestionsField documentId={doc.summary.id} past={past} onChange={setPast} usePast={usePast} onUsePast={setUsePast} />

          <div className="border-t border-rule pt-5">
            <p className="flex gap-2.5 font-sans text-[0.84rem] leading-[1.45] text-pencil" data-run-hint>
              <span className="flex h-[1.45em] shrink-0 items-center">
                <Dot kind={where.kind} />
              </span>
              <span>{where.text}</span>
            </p>
            <p className="mt-2 font-sans text-[0.84rem] text-pencil">
              {prefs.count - writtenCount} multiple-choice questions{writtenCount ? ` and ${writtenCount} written questions` : ''}, {prefs.minutes} minutes.
            </p>
            {error && (
              <div className="mt-3 font-sans text-[0.86rem] text-margin" role="alert">
                {error.message}{' '}
                {error.offline && deviceStatus === 'available' && (
                  <button type="button" onClick={() => void start('on_device')} className={textButton}>
                    Write it on this laptop instead
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => void start()}
              disabled={decision.deferred && deviceStatus !== 'available'}
              className="mt-5 inline-flex h-11 items-center rounded-full bg-ink px-6 font-sans text-[0.95rem] font-[660] text-sheet transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Write my exam
            </button>
          </div>
        </section>
      )}

      <History documentId={doc.summary.id} exams={history} />
    </main>
  )
}

// ─── Taking the exam ─────────────────────────────────────────────────────────

function sectionOf(question: ExamQuestion): string {
  return question.kind === 'mcq' ? 'Section A · Multiple choice · 1 mark' : `Section B · Written · ${question.marks} marks`
}

function isAnswered(value: number | string | null): boolean {
  return value !== null && value !== ''
}

function Ready({ exam, onStart }: { exam: Exam; onStart: () => void }) {
  const objective = exam.questions.filter((question) => question.kind === 'mcq').length
  const written = exam.questions.length - objective
  const writtenMarks = exam.questions.reduce((sum, question) => sum + (question.kind === 'written' ? question.marks : 0), 0)
  return (
    <main className="mx-auto max-w-[680px] px-4 pb-16 pt-10 sm:px-6">
      <p className="eyebrow">Exam mode</p>
      <h1 className="display mt-2 text-[clamp(2.3rem,6vw,3.4rem)]">Your exam is ready</h1>
      <div className="ruled mt-8 rounded-[6px] border border-rule" style={paper}>
        <Row>
          <p className="on-lines font-sans text-[1rem] font-[680]">{exam.title}</p>
          <p className="on-lines figures font-sans text-[0.9rem] text-ink">
            {exam.questions.length} questions · {exam.settings.minutes} minutes · {levelLabel(exam.settings.level)}
          </p>
          <p className="on-lines font-sans text-[0.88rem] text-pencil">Section A: {objective} multiple-choice questions, 1 mark each.</p>
          {written > 0 && (
            <p className="on-lines font-sans text-[0.88rem] text-pencil">
              Section B: {written} written questions, {writtenMarks} marks in all. Show your working.
            </p>
          )}
          <p className="on-lines font-sans text-[0.88rem] text-pencil">
            Your notes stay closed while the timer runs. When time is up your paper is handed in by itself.
          </p>
        </Row>
      </div>
      <div className="mt-6 flex items-center gap-5">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex h-11 items-center rounded-full bg-ink px-6 font-sans text-[0.95rem] font-[660] text-sheet hover:opacity-90"
        >
          Start the timer
        </button>
        <a href={routes.exam(exam.documentId)} className={quietButton}>
          Not now
        </a>
      </div>
    </main>
  )
}

function Taking({ exam, onAnswer, onSubmit }: { exam: Exam; onAnswer: (index: number, value: number | string) => void; onSubmit: () => void }) {
  const [index, setIndex] = useState(() => Math.max(0, exam.answers.findIndex((answer) => !isAnswered(answer))))
  const [confirming, setConfirming] = useState(false)
  const now = useNow(1000)
  const remaining = (exam.endsAt ?? now) - now
  const handedIn = useRef(false)
  const question = exam.questions[index]
  const answer = exam.answers[index]
  const unanswered = exam.answers.filter((value) => !isAnswered(value)).length
  const lowTime = remaining < 5 * 60 * 1000

  useEffect(() => {
    if (remaining <= 0 && !handedIn.current) {
      handedIn.current = true
      onSubmit()
    }
  }, [remaining, onSubmit])

  const go = (next: number) => {
    setIndex(Math.min(Math.max(0, next), exam.questions.length - 1))
    window.scrollTo({ top: 0 })
  }

  const firstWritten = exam.questions.findIndex((item) => item.kind === 'written')

  return (
    <main className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-6">
      <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-desk/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="figures font-sans text-[0.9rem] font-[640] text-ink">
          Question {index + 1} of {exam.questions.length}
        </p>
        <p className="figures font-sans text-[0.84rem] text-pencil">{exam.questions.length - unanswered} answered</p>
        <p
          className={`figures ml-auto rounded-full px-3 py-1 font-sans text-[1rem] font-[700] ${lowTime ? 'bg-margin/12 text-margin' : 'text-ink'}`}
          aria-label={`Time left: ${clock(remaining)}`}
          role="timer"
        >
          {clock(remaining)}
        </p>
        <button type="button" onClick={() => setConfirming(true)} className={pillButton.replace('h-[calc(var(--line)-6px)]', 'h-9')}>
          Hand in
        </button>
      </div>

      {confirming && (
        <div className="mt-4 rounded-[6px] border border-rule bg-sheet p-4 font-sans text-[0.9rem]" role="alertdialog" aria-label="Hand in your paper?">
          <p className="font-[660] text-ink">Hand in your paper?</p>
          <p className="mt-1 text-pencil">
            {unanswered
              ? `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} still unanswered. `
              : 'Every question is answered. '}
            You can&apos;t change your answers after this.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <button type="button" onClick={onSubmit} className="rounded-full bg-ink px-4 py-1.5 font-[640] text-sheet hover:opacity-90">
              Hand in now
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={quietButton}>
              Keep writing
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
        <div>
          <article className="ruled rounded-[6px] border border-rule" style={paper} aria-label={`Question ${index + 1}`}>
            <Row>
              <p className="on-lines font-sans text-[0.74rem] font-[640] uppercase tracking-[0.07em] text-pencil">{sectionOf(question)}</p>
            </Row>
            <div className="relative">
              <span className="margin-note figures font-[700] text-ink">{index + 1}</span>
              <p id="exam-question" className="past-margin reading on-lines pr-5 font-[560] sm:pr-7">
                <Rich text={question.question} />
              </p>
            </div>
            {question.kind === 'mcq' ? (
              <div role="radiogroup" aria-labelledby="exam-question" className="past-margin reading pr-5 sm:pr-7" style={{ marginTop: 'calc(var(--line) / 2)' }}>
                {question.options.map((option, optionIndex) => {
                  const chosen = answer === optionIndex
                  return (
                    <label
                      key={optionIndex}
                      className={`on-lines group flex cursor-pointer gap-3 rounded-[4px] px-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink ${
                        chosen ? 'bg-pen/10' : 'hover:bg-desk/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`exam-${exam.id}-${index}`}
                        checked={chosen}
                        onChange={() => onAnswer(index, optionIndex)}
                        className="sr-only"
                      />
                      <span
                        className={`mt-[calc((var(--line)-1.4rem)/2-1px)] grid h-[1.4rem] w-[1.4rem] shrink-0 place-items-center rounded-full border-[1.5px] font-sans text-[0.74rem] font-[660] leading-none ${
                          chosen ? 'border-pen bg-pen text-sheet' : 'border-rule text-pencil group-hover:border-pencil'
                        }`}
                        aria-hidden
                      >
                        {'ABCD'[optionIndex]}
                      </span>
                      <span className={`min-w-0 ${chosen ? 'text-pen' : 'text-ink'}`}>
                        <Rich text={option} />
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <Row>
                <textarea
                  value={typeof answer === 'string' ? answer : ''}
                  onChange={(event) => onAnswer(index, event.target.value)}
                  aria-labelledby="exam-question"
                  placeholder="Write your answer here. Show your working for calculations."
                  className={penField}
                  style={{ minHeight: 'calc(var(--line) * 9 + 3px)', marginTop: 'calc(var(--line) / 2)' }}
                />
              </Row>
            )}
          </article>
          <div className="mt-4 flex items-center justify-between">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className={`${quietButton} disabled:opacity-30`}>
              ← Previous
            </button>
            {index < exam.questions.length - 1 ? (
              <button type="button" onClick={() => go(index + 1)} className="rounded-full bg-ink px-5 py-2 font-sans text-[0.88rem] font-[640] text-sheet hover:opacity-90">
                Next →
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="rounded-full bg-ink px-5 py-2 font-sans text-[0.88rem] font-[640] text-sheet hover:opacity-90">
                Hand in
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Questions" className="mt-8 lg:mt-0">
          {[
            { label: 'Section A · Multiple choice', start: 0, end: firstWritten === -1 ? exam.questions.length : firstWritten },
            ...(firstWritten === -1 ? [] : [{ label: 'Section B · Written', start: firstWritten, end: exam.questions.length }]),
          ].map((section) => (
            <div key={section.label} className="mb-5">
              <p className="eyebrow mb-2">{section.label}</p>
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.2rem,1fr))] gap-1.5">
                {exam.questions.slice(section.start, section.end).map((_, offset) => {
                  const n = section.start + offset
                  const done = isAnswered(exam.answers[n])
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() => go(n)}
                        aria-current={n === index ? 'step' : undefined}
                        aria-label={`Question ${n + 1}${done ? ', answered' : ''}`}
                        className={`figures grid h-9 w-full place-items-center rounded-[5px] border font-sans text-[0.8rem] font-[640] transition-colors ${
                          done ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-pencil hover:text-ink'
                        } ${n === index ? 'ring-2 ring-margin ring-offset-1 ring-offset-desk' : ''}`}
                      >
                        {n + 1}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
          <p className="font-sans text-[0.78rem] text-pencil">Filled squares are answered. You can come back to any question.</p>
        </nav>
      </div>
    </main>
  )
}

// ─── Marking and results ─────────────────────────────────────────────────────

function Marking({ exam, onMarked }: { exam: Exam; onMarked: (exam: Exam) => void }) {
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const runOn = useRunOn()
  const startedFor = useRef<number | null>(null)
  const objective = objectiveScore(exam)

  useEffect(() => {
    if (startedFor.current === attempt) return
    startedFor.current = attempt
    markExam(exam, { force: forcedTarget(runOn), onProgress: (done, total) => setProgress({ done, total }) })
      .then(onMarked)
      .catch((caught: unknown) =>
        setError(
          caught instanceof DeferredError
            ? "You're offline, so the written answers can't be marked yet. Your answers are saved; try again when you're connected."
            : describeError(caught),
        ),
      )
  }, [attempt, exam, onMarked, runOn])

  return (
    <main className="mx-auto max-w-[680px] px-4 pb-16 pt-10 sm:px-6">
      <p className="eyebrow">Exam mode</p>
      <h1 className="display mt-2 text-[clamp(2.3rem,6vw,3.4rem)]">Marking your paper</h1>
      <div className="ruled mt-8 rounded-[6px] border border-rule" style={paper}>
        <Row>
          <p className="on-lines figures font-sans text-[0.9rem] text-ink">
            Multiple choice marked: {objective.score} of {objective.outOf} correct.
          </p>
        </Row>
        {progress.total > 0 && !error && (
          <>
            <Row>
              <p className="on-lines figures font-sans text-[0.9rem] text-pencil">
                Marking written answers: {progress.done} of {progress.total}
              </p>
            </Row>
            <div className="flex items-center" style={{ height: 'var(--line)' }}>
              <div className="past-margin w-full pr-5">
                <div className="pencil-line w-full max-w-[16rem]" />
              </div>
            </div>
          </>
        )}
        {error && (
          <Problem message={error}>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setAttempt((n) => n + 1)
              }}
              className={textButton}
            >
              Try marking again
            </button>
          </Problem>
        )}
      </div>
    </main>
  )
}

function ReviewItem({ exam, index, pages }: { exam: Exam; index: number; pages: Loaded['content']['pages'] }) {
  const question = exam.questions[index]
  const given = exam.answers[index]
  const job = useJob<string>(explainJobKey(exam.id, index))
  const runOn = useRunOn()
  const explanation = exam.explanations[index] ?? (job?.status === 'done' ? job.result : undefined)
  const mark = exam.marks[index]
  const right = question.kind === 'mcq' ? given === question.correct : !!mark && mark.score * 2 >= question.marks
  const tip = question.kind === 'mcq' ? question.tip : mark?.tip

  return (
    <div style={{ marginTop: 'var(--line)' }}>
      <div className="relative">
        <span className={`margin-note figures flex h-[var(--line)] items-center justify-end gap-1 font-[680] ${right ? 'text-local' : 'text-margin'}`}>
          <Mark right={right} />
          {index + 1}
        </span>
        <p className="past-margin reading on-lines pr-5 font-[560] sm:pr-7">
          <Rich text={question.question} />
          <span className="sr-only">{right ? ' You got this right.' : ' You missed this.'}</span>
        </p>
      </div>
      {question.kind === 'mcq' ? (
        <div className="past-margin reading pr-5 sm:pr-7">
          {question.options.map((option, optionIndex) => {
            const isCorrect = optionIndex === question.correct
            const chosen = given === optionIndex
            const text = isCorrect
              ? 'font-[600] text-local underline decoration-local decoration-2 underline-offset-[5px]'
              : chosen
                ? 'text-margin line-through decoration-margin/70'
                : 'text-pencil'
            const badge = isCorrect ? 'border-local bg-local/10 text-local' : chosen ? 'border-margin bg-margin/10 text-margin' : 'border-transparent text-pencil'
            return (
              <p key={optionIndex} className="on-lines flex gap-2.5">
                <span
                  className={`mt-[calc((var(--line)-1.3rem)/2-1px)] grid h-[1.3rem] w-[1.3rem] shrink-0 place-items-center rounded-full border-[1.5px] font-sans text-[0.72rem] font-[640] leading-none ${badge}`}
                  aria-hidden
                >
                  {'ABCD'[optionIndex]}
                </span>
                <span className={`min-w-0 ${text}`}>
                  <Rich text={option} />
                  {isCorrect && <span className="sr-only"> (correct answer)</span>}
                  {chosen && !isCorrect && <span className="sr-only"> (your answer)</span>}
                </span>
              </p>
            )
          })}
          {given === null && <p className="on-lines font-sans text-[0.82rem] text-margin">Not answered.</p>}
          {question.explanation && (
            <p className="on-lines font-sans text-[0.84rem] text-pencil">
              <Rich text={question.explanation} />
            </p>
          )}
        </div>
      ) : (
        <Row>
          <p className={`on-lines figures font-sans text-[0.84rem] font-[680] ${right ? 'text-local' : 'text-margin'}`}>
            {mark ? `${mark.score} of ${question.marks} marks` : 'Not marked'}
          </p>
          <p className="on-lines font-sans text-[0.78rem] font-[640] uppercase tracking-[0.06em] text-pencil">Your answer</p>
          <p className="reading on-lines whitespace-pre-wrap text-pen">{typeof given === 'string' && given.trim() ? given : 'Not answered.'}</p>
          {mark?.feedback && <p className="on-lines font-sans text-[0.86rem] text-ink">{mark.feedback}</p>}
          <p className="on-lines font-sans text-[0.78rem] font-[640] uppercase tracking-[0.06em] text-pencil">Correction</p>
          <p className="reading on-lines whitespace-pre-wrap">
            <Rich text={mark?.correction || question.modelAnswer} />
          </p>
        </Row>
      )}
      {!right && tip && (
        <Row>
          <p className="on-lines font-sans text-[0.86rem] text-ink">
            <span className="font-[680] text-local">Tip: </span>
            <Rich text={tip} />
          </p>
        </Row>
      )}
      {explanation ? (
        <Row>
          <p className="on-lines font-sans text-[0.78rem] font-[640] uppercase tracking-[0.06em] text-pencil">Explained</p>
          <AiText text={explanation} />
        </Row>
      ) : job?.status === 'running' ? (
        <Working target={job.target} startedAt={job.startedAt} />
      ) : job?.status === 'error' ? (
        <Problem message={job.message}>
          <button type="button" onClick={() => void explainExamQuestion(exam, index, pages, forcedTarget(runOn))} className={textButton}>
            Try again
          </button>
        </Problem>
      ) : (
        <Row>
          <p className="on-lines">
            <button type="button" onClick={() => void explainExamQuestion(exam, index, pages, forcedTarget(runOn))} className={textButton}>
              Explain this more
            </button>
          </p>
        </Row>
      )}
    </div>
  )
}

function Results({ exam, doc }: { exam: Exam; doc: Loaded }) {
  const [onlyMissed, setOnlyMissed] = useState(false)
  const percent = exam.outOf ? Math.round(((exam.score ?? 0) / exam.outOf) * 100) : 0
  const grade = gradeFor(percent)
  const passed = percent >= 50
  const objective = objectiveScore(exam)
  const writtenOutOf = exam.questions.reduce((sum, question) => sum + (question.kind === 'written' ? question.marks : 0), 0)
  const writtenScore = exam.marks.reduce((sum, mark) => sum + (mark?.score ?? 0), 0)
  const timeUp = (exam.submittedAt ?? 0) >= (exam.endsAt ?? Infinity)
  const used = Math.min(exam.submittedAt ?? 0, exam.endsAt ?? 0) - (exam.startedAt ?? 0)
  const missed = exam.questions
    .map((question, index) => ({ question, index }))
    .filter(({ question, index }) =>
      question.kind === 'mcq' ? exam.answers[index] !== question.correct : (exam.marks[index]?.score ?? 0) * 2 < question.marks,
    )
  const shown = onlyMissed ? missed : exam.questions.map((question, index) => ({ question, index }))
  const where = exam.source.cloud && exam.source.device ? 'the cloud and this laptop' : exam.source.cloud ? 'the cloud' : 'this laptop'

  const retake = async () => {
    const copy = await retakeExam(exam)
    navigate(routes.exam(exam.documentId, copy.id))
  }

  return (
    <main className="mx-auto max-w-[820px] px-4 pb-16 pt-10 sm:px-6">
      <p className="eyebrow">Exam results</p>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <div className={`relative grid h-[5.2rem] w-[5.2rem] -rotate-6 place-items-center ${passed ? 'text-local' : 'text-margin'}`} aria-hidden>
          <svg viewBox="0 0 50 50" className="absolute inset-0 h-full w-full" fill="none">
            <path
              d="M27 3.6C38.8 3.2 46.8 12.4 46.4 25c-.4 12.2-9.4 21.4-21.6 21.2C12.8 46 3.8 37 3.8 25 3.8 13.6 12 4.8 23.4 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="display text-[2.4rem]">{grade}</span>
        </div>
        <div>
          <h1 className="display text-[clamp(2.1rem,5vw,3rem)]">
            {exam.score} / {exam.outOf} marks <span className={passed ? 'text-local' : 'text-margin'}>· {percent}%</span>
          </h1>
          <p className="figures mt-2 font-sans text-[0.9rem] text-pencil">
            Grade {grade}. Multiple choice {objective.score}/{objective.outOf}
            {writtenOutOf ? ` · Written ${writtenScore}/${writtenOutOf}` : ''} · {timeUp ? 'Time ran out' : `Handed in after ${clock(used)}`} of{' '}
            {exam.settings.minutes} min
          </p>
          <p className="figures mt-1 font-sans text-[0.8rem] text-pencil">
            Questions written in {where} · {exam.source.bytes ? `${dataSize(exam.source.bytes)} of data` : 'no data used'}
          </p>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="radiogroup" aria-label="Show" className="flex rounded-full border border-rule bg-sheet/60 p-[3px] font-sans text-[0.84rem]">
          {[
            { id: false, label: `All ${exam.questions.length}` },
            { id: true, label: `Missed ${missed.length}` },
          ].map((option) => (
            <label
              key={String(option.id)}
              className={`cursor-pointer rounded-full px-3.5 py-[5px] leading-none ${onlyMissed === option.id ? 'bg-ink font-[640] text-sheet' : 'text-pencil hover:text-ink'}`}
            >
              <input type="radio" className="sr-only" checked={onlyMissed === option.id} onChange={() => setOnlyMissed(option.id)} />
              {option.label}
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void retake()} className={quietButton}>
          Retake these questions
        </button>
        <a href={routes.exam(exam.documentId)} className={quietButton}>
          New exam
        </a>
        <a href={routes.reader(exam.documentId)} className={quietButton}>
          Back to the notes
        </a>
      </div>

      <article className="ruled mt-6 rounded-[6px] border border-rule" style={paper} aria-label="Marked paper">
        {shown.length === 0 ? (
          <Row>
            <p className="on-lines font-sans text-[0.9rem] text-local">Nothing missed. Well done.</p>
          </Row>
        ) : (
          shown.map(({ index }) => <ReviewItem key={index} exam={exam} index={index} pages={doc.content.pages} />)
        )}
        <Row>
          <p className="on-lines font-sans text-[0.8rem] text-pencil" style={{ marginTop: 'var(--line)' }}>
            Written and marked by AI. If something looks wrong, check your notes.
          </p>
        </Row>
      </article>
    </main>
  )
}

function ExamRun({ examId, doc }: { examId: string; doc: Loaded }) {
  const [exam, setExam] = useState<Exam | null | 'missing'>(null)
  const saveTimer = useRef<number | null>(null)
  const latest = useRef<Exam | null>(null)

  useEffect(() => {
    let stale = false
    void getExam(examId).then((found) => {
      if (stale) return
      latest.current = found ?? null
      setExam(found ?? 'missing')
    })
    return () => {
      stale = true
      // Don't lose the last few keystrokes when leaving.
      if (saveTimer.current !== null && latest.current) void saveExam(latest.current)
    }
  }, [examId])

  const update = useCallback((next: Exam, { now = false } = {}) => {
    latest.current = next
    setExam(next)
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    if (now) {
      saveTimer.current = null
      void saveExam(next)
    } else {
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null
        void saveExam(next)
      }, 400)
    }
  }, [])

  const onAnswer = useCallback(
    (index: number, value: number | string) => {
      const current = latest.current
      if (!current || current.submittedAt) return
      update({ ...current, answers: current.answers.map((answer, i) => (i === index ? value : answer)) })
    },
    [update],
  )

  const onSubmit = useCallback(() => {
    const current = latest.current
    if (!current || current.submittedAt) return
    update({ ...current, submittedAt: Date.now() }, { now: true })
  }, [update])

  const onMarked = useCallback((marked: Exam) => {
    latest.current = marked
    setExam(marked)
  }, [])

  if (exam === null) return <p className="px-6 py-16 text-center text-pencil">Opening…</p>
  if (exam === 'missing') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="display text-4xl">This exam is not on this laptop.</h1>
        <a href={routes.exam(doc.summary.id)} className="mt-6 inline-block font-[620] underline decoration-margin decoration-2 underline-offset-[5px]">
          Set a new exam
        </a>
      </div>
    )
  }
  if (!exam.startedAt) {
    return (
      <Ready
        exam={exam}
        onStart={() => {
          const now = Date.now()
          update({ ...exam, startedAt: now, endsAt: now + exam.settings.minutes * 60 * 1000 }, { now: true })
        }}
      />
    )
  }
  if (!exam.submittedAt) return <Taking exam={exam} onAnswer={onAnswer} onSubmit={onSubmit} />
  if (!exam.markedAt) return <Marking exam={exam} onMarked={onMarked} />
  return <Results exam={exam} doc={doc} />
}

export function ExamScreen({
  documentId,
  examId,
  deviceStatus,
  onTitle,
}: {
  documentId: string
  examId: string | null
  deviceStatus: OnDeviceStatus | null
  onTitle: (title: string | null) => void
}): ReactNode {
  const [doc, setDoc] = useState<Loaded | 'missing' | null>(null)

  useEffect(() => {
    let stale = false
    void Promise.all([getDocumentSummary(documentId), getContent(documentId)]).then(([summary, content]) => {
      if (stale) return
      if (!summary || !content) {
        setDoc('missing')
        onTitle(null)
        return
      }
      setDoc({ summary, content })
      onTitle(summary.title)
    })
    return () => {
      stale = true
    }
  }, [documentId, onTitle])

  if (doc === null) return <p className="px-6 py-16 text-center text-pencil">Opening…</p>
  if (doc === 'missing') {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="display text-4xl">These notes are not on this laptop.</h1>
        <a href={routes.library} className="mt-6 inline-block font-[620] underline decoration-margin decoration-2 underline-offset-[5px]">
          Back to the library
        </a>
      </div>
    )
  }
  return examId ? <ExamRun key={examId} examId={examId} doc={doc} /> : <ExamSetup doc={doc} deviceStatus={deviceStatus} />
}
