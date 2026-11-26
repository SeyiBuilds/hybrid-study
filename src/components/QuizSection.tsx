import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { cancelQueued, useJob } from '../ai/jobs'
import { hasEnoughForQuiz, QUIZ_LEVELS, QUIZ_SIZES, type QuizQuestion } from '../ai/quiz'
import { buildQuizPrompt, generateQuiz, quizJobKey } from '../ai/quizzes'
import { getPageQuiz, savePageQuiz, type PageQuiz } from '../lib/library'
import type { PageText } from '../lib/pageText'
import { useNetwork } from '../lib/network'
import { useQuizSettings, type QuizSettings } from '../lib/readerPrefs'
import { forcedTarget, useRunOn } from '../lib/runOn'
import { Rich } from './RichText'
import { Lead, Problem, Queued, Row, RunHint, SheetHeading, SourceBadge, Working } from './sheet'
import { pillButton, previewRun, quietButton, textButton } from './sheetStyles'

const LETTERS = ['A', 'B', 'C', 'D']
const MARK_STAGGER_MS = 140
/** About what one question with options and an explanation comes to, for the data estimate. */
const EXPECTED_CHARS_PER_QUESTION = 440

/** How many questions and how hard, chosen before writing a quiz. */
function QuizSettingsRow({ settings, onChange }: { settings: QuizSettings; onChange: (settings: QuizSettings) => void }) {
  const chip = (selected: boolean) =>
    `rounded-full px-2.5 py-[3px] font-[620] leading-none transition-colors ${
      selected ? 'bg-ink text-sheet' : 'text-pencil hover:bg-desk hover:text-ink'
    }`
  return (
    <Row>
      <div className="on-lines flex flex-wrap items-center gap-x-5 font-sans text-[0.8rem]">
        <span className="flex items-center gap-1" role="group" aria-label="Number of questions">
          <span className="mr-1 text-pencil">Questions</span>
          {QUIZ_SIZES.map((count) => (
            <button key={count} type="button" aria-pressed={settings.count === count} onClick={() => onChange({ ...settings, count })} className={`figures ${chip(settings.count === count)}`}>
              {count}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1" role="group" aria-label="Difficulty">
          <span className="mr-1 text-pencil">Level</span>
          {QUIZ_LEVELS.map((level) => (
            <button key={level.id} type="button" aria-pressed={settings.level === level.id} onClick={() => onChange({ ...settings, level: level.id })} className={chip(settings.level === level.id)}>
              {level.label}
            </button>
          ))}
        </span>
      </div>
    </Row>
  )
}

function drawStyle(animate: boolean, delayMs: number): { className: string; style?: CSSProperties } {
  return animate ? { className: 'pen-draw', style: { '--delay': `${delayMs}ms` } as CSSProperties } : { className: '' }
}

/** A marker's tick or cross, in red pen. */
function PenMark({ correct, animate, delayMs }: { correct: boolean; animate: boolean; delayMs: number }) {
  const draw = drawStyle(animate, delayMs)
  const paths = correct
    ? ['M3 12.5c2.1 2.2 3.8 4.6 5.4 7.3C11.8 13.3 16 8 21.2 3.6']
    : ['M5 4.8c4.2 4.8 9 9.7 14.2 14.6', 'M19.4 4.4C14.2 9.2 9.5 14.2 4.6 19.8']
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${correct ? 'text-local' : 'text-margin'}`} fill="none" aria-hidden>
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          pathLength={1}
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          className={draw.className}
          style={draw.style}
        />
      ))}
    </svg>
  )
}

function Question({
  question,
  index,
  name,
  answer,
  marked,
  animate,
  onAnswer,
}: {
  question: QuizQuestion
  index: number
  name: string
  answer: number | null
  marked: boolean
  animate: boolean
  onAnswer: (option: number) => void
}) {
  const right = answer === question.correct
  const labelId = `${name}-label`

  return (
    <div style={{ marginTop: 'var(--line)' }}>
      <div className="relative">
        <span
          className={`margin-note figures flex h-[var(--line)] items-center justify-end gap-1 ${
            marked ? (right ? 'font-[680] text-local' : 'font-[680] text-margin') : ''
          }`}
        >
          {marked && <PenMark correct={right} animate={animate} delayMs={index * MARK_STAGGER_MS} />}
          {index + 1}
        </span>
        <p id={labelId} className="past-margin reading on-lines pr-5 font-[560] sm:pr-8">
          <Rich text={question.question} />
          {marked && <span className="sr-only">{right ? ' You got this right.' : ' You got this wrong.'}</span>}
        </p>
      </div>

      <div role="radiogroup" aria-labelledby={labelId} className="past-margin reading pr-5 sm:pr-8">
        {question.options.map((option, optionIndex) => {
          const chosen = answer === optionIndex
          const isCorrect = optionIndex === question.correct
          let text = 'text-ink'
          let badge = 'border-transparent text-pencil'
          if (marked) {
            if (isCorrect) {
              text = 'font-[600] text-local underline decoration-local decoration-2 underline-offset-[5px]'
              badge = 'border-local bg-local/10 text-local'
            } else if (chosen) {
              text = 'text-margin line-through decoration-margin/70 decoration-1'
              badge = 'border-margin bg-margin/10 text-margin'
            } else {
              text = 'text-pencil'
            }
          } else if (chosen) {
            text = 'text-pen'
            badge = 'border-pen text-pen'
          }
          return (
            <label
              key={optionIndex}
              className={`on-lines flex gap-2.5 rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ink ${
                marked ? '' : 'group cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={chosen}
                disabled={marked}
                onChange={() => onAnswer(optionIndex)}
                className="sr-only"
              />
              <span
                className={`mt-[calc((var(--line)-1.3rem)/2-1px)] grid h-[1.3rem] w-[1.3rem] shrink-0 place-items-center rounded-full border-[1.5px] font-sans text-[0.72rem] font-[640] leading-none ${badge} ${
                  marked ? '' : 'group-hover:border-rule'
                }`}
                aria-hidden
              >
                {LETTERS[optionIndex]}
              </span>
              <span className={`min-w-0 ${text}`}>
                <Rich text={option} />
                {marked && isCorrect && <span className="sr-only"> (correct answer)</span>}
                {marked && chosen && !isCorrect && <span className="sr-only"> (your answer)</span>}
              </span>
            </label>
          )
        })}
        {marked && question.explanation && (
          <p className="on-lines font-sans text-[0.82rem] text-pencil">
            <Rich text={question.explanation} />
          </p>
        )}
      </div>
    </div>
  )
}

/** The result, circled in red in the margin the way a marker writes it on a script. */
function Score({
  quiz,
  animate,
  onRetry,
}: {
  quiz: PageQuiz
  animate: boolean
  onRetry: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const total = quiz.questions.length
  const earlier = quiz.scores.slice(0, -1)
  const draw = drawStyle(animate, total * MARK_STAGGER_MS)
  const passed = (quiz.score ?? 0) * 2 >= total

  useEffect(() => {
    if (!animate) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }, [animate])

  return (
    <div ref={ref} className="relative" style={{ minHeight: 'calc(var(--line) * 2)' }} role="status">
      <div
        className={`absolute grid h-[3.1rem] w-[3.1rem] -rotate-6 place-items-center ${passed ? 'text-local' : 'text-margin'}`}
        style={{ left: 'calc((var(--margin) - 3.1rem) / 2)', top: 'calc(var(--line) - 1.55rem)' }}
        aria-hidden
      >
        <svg viewBox="0 0 50 50" className="absolute inset-0 h-full w-full" fill="none">
          <path
            d="M27 3.6C38.8 3.2 46.8 12.4 46.4 25c-.4 12.2-9.4 21.4-21.6 21.2C12.8 46 3.8 37 3.8 25 3.8 13.6 12 4.8 23.4 4"
            pathLength={1}
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            className={draw.className}
            style={draw.style}
          />
        </svg>
        <span className="display figures text-[1.12rem]">
          {quiz.score}/{total}
        </span>
      </div>
      <div className="past-margin pr-5 sm:pr-8">
        <p className="on-lines font-sans text-[1rem] font-[640]">
          {quiz.score} out of {total}
        </p>
        <p className="on-lines flex flex-wrap items-baseline gap-x-4">
          <button type="button" onClick={onRetry} className={textButton}>
            Try these again
          </button>
          {earlier.length > 0 && (
            <span className="figures font-sans text-[0.8rem] text-pencil">Best so far: {Math.max(...quiz.scores)}</span>
          )}
        </p>
      </div>
    </div>
  )
}

function latest(...quizzes: Array<PageQuiz | null | undefined>): PageQuiz | null {
  return quizzes.reduce<PageQuiz | null>((best, quiz) => (quiz && (!best || quiz.updatedAt >= best.updatedAt) ? quiz : best), null)
}

function withChanges(quiz: PageQuiz, changes: Partial<PageQuiz>): PageQuiz {
  return { ...quiz, ...changes, updatedAt: Date.now() }
}

function markedQuiz(quiz: PageQuiz): PageQuiz {
  const score = quiz.questions.filter((question, index) => quiz.answers[index] === question.correct).length
  return withChanges(quiz, { checkedAt: Date.now(), score, scores: [...quiz.scores, score] })
}

export function QuizSection({
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
  const job = useJob<PageQuiz>(quizJobKey(documentId, page.number))
  const runOn = useRunOn()
  const network = useNetwork()
  const [saved, setSaved] = useState<PageQuiz | null | undefined>(undefined)
  const [local, setLocal] = useState<PageQuiz | null>(null)
  const [justMarked, setJustMarked] = useState(false)
  const [settings, setSettings] = useQuizSettings()

  useEffect(() => {
    let cancelled = false
    getPageQuiz(documentId, page.number).then((quiz) => {
      if (!cancelled) setSaved(quiz ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [documentId, page.number])

  const quiz = latest(saved, job?.status === 'done' ? job.result : null, local)
  const enough = hasEnoughForQuiz(page)
  const preview = previewRun({
    task: 'quiz',
    runOn,
    network,
    deviceStatus,
    prompt: buildQuizPrompt({ pageText: page.text, title, page: page.number, ...settings }),
    expectedAnswerChars: EXPECTED_CHARS_PER_QUESTION * settings.count,
  })

  const start = () => {
    setJustMarked(false)
    void generateQuiz({ documentId, title, page: page.number, pageText: page.text, force: forcedTarget(runOn), ...settings })
  }

  const store = (next: PageQuiz) => {
    setLocal(next)
    void savePageQuiz(next)
  }

  const answer = (questionIndex: number, option: number) => {
    if (!quiz) return
    store(withChanges(quiz, { answers: quiz.answers.map((value, index) => (index === questionIndex ? option : value)) }))
  }

  const mark = () => {
    if (!quiz) return
    setJustMarked(true)
    store(markedQuiz(quiz))
  }

  const retry = () => {
    if (!quiz) return
    setJustMarked(false)
    store(withChanges(quiz, { answers: quiz.questions.map(() => null), checkedAt: null, score: null }))
  }

  const answered = quiz ? quiz.answers.filter((value) => value !== null).length : 0
  const marked = quiz?.checkedAt != null

  let body
  if (!enough) {
    body = <Lead>There is not enough text on this page for a quiz.</Lead>
  } else if (job?.status === 'queued') {
    body = (
      <Queued
        onDevice={
          deviceStatus === 'available'
            ? () => {
                cancelQueued(quizJobKey(documentId, page.number))
                void generateQuiz({ documentId, title, page: page.number, pageText: page.text, force: 'on_device', ...settings })
              }
            : undefined
        }
        onCancel={() => cancelQueued(quizJobKey(documentId, page.number))}
      />
    )
  } else if (job?.status === 'running') {
    body = (
      <Working
        target={job.target}
        startedAt={job.startedAt}
        deviceMessage={`Writing ${settings.count} questions on this laptop. This can take a while.`}
      />
    )
  } else {
    body = (
      <>
        {job?.status === 'error' && (
          <Problem message={job.message}>
            <button type="button" onClick={start} disabled={preview.blocked} className={textButton}>
              Try again
            </button>
          </Problem>
        )}

        {quiz ? (
          <div className="reveal">
            {marked && <Score quiz={quiz} animate={justMarked} onRetry={retry} />}
            {marked && <QuizSettingsRow settings={settings} onChange={setSettings} />}
            <SourceBadge source={quiz.source} totalMs={quiz.totalMs} bytes={quiz.bytes}>
              <button type="button" onClick={start} disabled={preview.blocked} className={`${quietButton} disabled:opacity-40`}>
                New questions
              </button>
            </SourceBadge>

            {quiz.questions.map((question, index) => (
              <Question
                key={`${quiz.createdAt}-${index}`}
                question={question}
                index={index}
                name={`quiz-${quiz.createdAt}-${index}`}
                answer={quiz.answers[index]}
                marked={marked}
                animate={justMarked}
                onAnswer={(option) => answer(index, option)}
              />
            ))}

            <div style={{ marginTop: 'var(--line)' }}>
              {marked ? (
                <Row>
                  <p className="on-lines font-sans text-[0.8rem] text-pencil">
                    Written by AI. If an answer looks wrong, check the page.
                  </p>
                </Row>
              ) : (
                <Row>
                  <p className="on-lines flex flex-wrap items-center gap-x-4">
                    <button type="button" onClick={mark} disabled={answered < quiz.questions.length} className={pillButton}>
                      Mark my answers
                    </button>
                    <span className="figures font-sans text-[0.8rem] text-pencil">
                      {answered} of {quiz.questions.length} answered
                    </span>
                  </p>
                </Row>
              )}
            </div>
          </div>
        ) : (
          saved !== undefined &&
          job?.status !== 'error' && (
            <>
              <Lead>Multiple-choice questions on this page. Choose your answers, then mark them.</Lead>
              <QuizSettingsRow settings={settings} onChange={setSettings} />
              <Row>
                <p className="on-lines">
                  <button type="button" onClick={start} disabled={preview.blocked} className={pillButton}>
                    Quiz me on this page
                  </button>
                </p>
              </Row>
              <RunHint preview={preview} />
            </>
          )
        )}
      </>
    )
  }

  return (
    <section aria-label="Quiz">
      <SheetHeading>Quiz on page {page.number}</SheetHeading>
      {body}
    </section>
  )
}
