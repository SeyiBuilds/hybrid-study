import { useCallback, useEffect, useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import {
  CLOUD_MODEL,
  describeError,
  describeOnDeviceStatus,
  getOnDeviceStatus,
  startOnDeviceDownload,
  type OnDeviceStatus,
  type Target,
} from './ai/client'
import { ask, type AskResult } from './ai/router'
import { appCheckMode, missingConfigKeys } from './firebase'

const DEFAULT_PROMPT = 'In one short sentence, what is photosynthesis?'

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; text: string }
  | { phase: 'done'; result: AskResult }
  | { phase: 'error'; message: string; text: string }

function formatSeconds(ms: number | null): string {
  if (ms === null) return '-'
  return `${(ms / 1000).toFixed(1)}s`
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' }) {
  const dot = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500' }[tone]
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex items-center gap-2 text-right font-medium">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        {value}
      </span>
    </div>
  )
}

function ResultCard({ title, target, state }: { title: string; target: Target; state: RunState }) {
  const accent = target === 'on_device' ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400'
  const text = state.phase === 'running' || state.phase === 'error' ? state.text : state.phase === 'done' ? state.result.text : ''

  return (
    <section className="flex min-h-48 flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className={`text-sm font-semibold ${accent}`}>{title}</h3>

      <div className="mt-3 flex-1 whitespace-pre-wrap text-[15px] leading-relaxed">
        {state.phase === 'idle' && <p className="text-slate-400">No answer yet.</p>}
        {state.phase === 'running' && !text && <p className="animate-pulse text-slate-400">Thinking…</p>}
        {text}
      </div>

      {state.phase === 'error' && (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
          {state.message}
        </p>
      )}

      {state.phase === 'done' && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium dark:bg-slate-800">
            {state.result.source === InferenceSource.ON_DEVICE ? 'On-device' : 'Cloud'}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            total {formatSeconds(state.result.totalMs)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
            first words {formatSeconds(state.result.firstChunkMs)}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            router: {state.result.decision.reason}
          </span>
        </div>
      )}
    </section>
  )
}

export default function App() {
  const online = useOnline()
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [deviceStatus, setDeviceStatus] = useState<OnDeviceStatus | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<Target, RunState>>({
    on_device: { phase: 'idle' },
    in_cloud: { phase: 'idle' },
  })

  const refreshStatus = useCallback(async () => {
    setDeviceStatus(await getOnDeviceStatus())
  }, [])

  useEffect(() => {
    let cancelled = false
    getOnDeviceStatus().then((status) => {
      if (!cancelled) setDeviceStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // While Chrome is downloading the model, re-check every few seconds.
  useEffect(() => {
    if (deviceStatus !== 'downloading') return
    const timer = window.setInterval(() => void refreshStatus(), 5000)
    return () => window.clearInterval(timer)
  }, [deviceStatus, refreshStatus])

  const handleDownload = async () => {
    setDownloadError(null)
    setDownloadProgress(0)
    try {
      await startOnDeviceDownload((fraction) => {
        setDownloadProgress(fraction)
        if (fraction >= 1) void refreshStatus()
      })
      await refreshStatus()
    } catch (error) {
      setDownloadError(describeError(error))
      setDownloadProgress(null)
    }
  }

  const run = async (target: Target) => {
    setRuns((prev) => ({ ...prev, [target]: { phase: 'running', text: '' } }))
    let latest = ''
    try {
      const result = await ask(prompt, {
        force: target,
        onText: (textSoFar) => {
          latest = textSoFar
          setRuns((prev) => ({ ...prev, [target]: { phase: 'running', text: textSoFar } }))
        },
      })
      setRuns((prev) => ({ ...prev, [target]: { phase: 'done', result } }))
    } catch (error) {
      setRuns((prev) => ({ ...prev, [target]: { phase: 'error', message: describeError(error), text: latest } }))
    } finally {
      if (target === 'on_device') void refreshStatus()
    }
  }

  const deviceTone = deviceStatus === 'available' ? 'ok' : deviceStatus === 'downloading' || deviceStatus === 'downloadable' ? 'warn' : 'bad'
  const canDownload = deviceStatus === 'downloadable' || deviceStatus === 'downloading'
  const busy = (t: Target) => runs[t].phase === 'running'

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <header>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Hybrid Study · connection test</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Ask on your laptop, or ask the cloud</h1>
        <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
          Both buttons call Firebase AI Logic. One pins the request to Gemini Nano in Chrome, the other to {CLOUD_MODEL} in the
          cloud. Each answer shows where it actually ran and how long it took.
        </p>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <StatusRow
            label="Firebase config"
            value={missingConfigKeys.length ? `missing ${missingConfigKeys.join(', ')}` : 'loaded from .env'}
            tone={missingConfigKeys.length ? 'bad' : 'ok'}
          />
          <StatusRow
            label="App Check"
            value={appCheckMode === 'debug' ? 'debug provider (token in console)' : appCheckMode === 'off' ? 'not configured' : 'reCAPTCHA Enterprise'}
            tone={appCheckMode === 'off' ? 'bad' : 'ok'}
          />
          <StatusRow label="Network" value={online ? 'online' : 'offline'} tone={online ? 'ok' : 'warn'} />
          <StatusRow
            label="On-device model"
            value={deviceStatus === null ? 'checking…' : deviceStatus}
            tone={deviceStatus === null ? 'warn' : deviceTone}
          />
        </div>

        {deviceStatus && deviceStatus !== 'available' && (
          <div className="pb-3 pt-1 text-sm text-slate-600 dark:text-slate-400">
            <p>{describeOnDeviceStatus(deviceStatus)}</p>
            {canDownload && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {deviceStatus === 'downloading' ? 'Track download' : 'Download on-device model'}
                </button>
                {downloadProgress !== null && (
                  <div className="flex min-w-48 flex-1 items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(downloadProgress * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">{Math.round(downloadProgress * 100)}%</span>
                  </div>
                )}
                <button type="button" onClick={() => void refreshStatus()} className="text-slate-500 underline-offset-2 hover:underline">
                  Re-check
                </button>
              </div>
            )}
            {downloadError && <p className="mt-2 text-rose-700 dark:text-rose-400">{downloadError}</p>}
          </div>
        )}
      </section>

      <section className="mt-6">
        <label htmlFor="prompt" className="text-sm font-medium">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-[15px] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void run('on_device')}
            disabled={busy('on_device') || !prompt.trim()}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy('on_device') ? 'Running on-device…' : 'Ask on-device'}
          </button>
          <button
            type="button"
            onClick={() => void run('in_cloud')}
            disabled={busy('in_cloud') || !prompt.trim()}
            className="rounded-xl bg-sky-600 px-4 py-2.5 font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy('in_cloud') ? 'Asking the cloud…' : 'Ask in the cloud'}
          </button>
        </div>
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ResultCard title="On-device (Gemini Nano)" target="on_device" state={runs.on_device} />
        <ResultCard title={`Cloud (${CLOUD_MODEL})`} target="in_cloud" state={runs.in_cloud} />
      </div>
    </main>
  )
}
