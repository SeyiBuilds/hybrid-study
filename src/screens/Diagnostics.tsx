import { useState } from 'react'
import { InferenceSource } from 'firebase/ai'
import {
  CLOUD_MODEL,
  describeError,
  describeOnDeviceStatus,
  startOnDeviceDownload,
  type OnDeviceStatus,
  type Target,
} from '../ai/client'
import { ask, type AskResult } from '../ai/router'
import { appCheckMode, missingConfigKeys } from '../firebase'

const DEFAULT_PROMPT = 'In one short sentence, what is photosynthesis?'

type RunState =
  | { phase: 'idle' }
  | { phase: 'running'; text: string }
  | { phase: 'done'; result: AskResult }
  | { phase: 'error'; message: string; text: string }

function seconds(ms: number | null): string {
  return ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean | null }) {
  return (
    <div className="relative">
      <span className="margin-note">{ok === null ? '…' : ok ? 'ok' : 'check'}</span>
      <p className="past-margin on-lines flex justify-between gap-4 pr-5 text-[0.9rem]">
        <span className="text-pencil">{label}</span>
        <span className={`truncate font-[580] ${ok === false ? 'text-margin' : ''}`}>{value}</span>
      </p>
    </div>
  )
}

function Answer({ title, tone, state }: { title: string; tone: 'local' | 'cloud'; state: RunState }) {
  const text = state.phase === 'running' || state.phase === 'error' ? state.text : state.phase === 'done' ? state.result.text : ''
  return (
    <section className="ruled relative min-h-[calc(var(--line)*7)] rounded-[3px] pb-[var(--line)] shadow-[0_1px_0_var(--color-rule)]">
      <div className="relative" style={{ paddingTop: 'var(--line)' }}>
        <span className={`margin-note ${tone === 'local' ? 'text-local' : 'text-cloud'}`}>{tone === 'local' ? 'device' : 'cloud'}</span>
        <h3 className="past-margin on-lines eyebrow pr-5">{title}</h3>
      </div>
      <div className="past-margin reading on-lines whitespace-pre-wrap pr-5">
        {state.phase === 'idle' && <span className="text-pencil">No answer yet.</span>}
        {state.phase === 'running' && !text && <span className="text-pencil">Thinking…</span>}
        {text}
      </div>
      {state.phase === 'error' && <p className="past-margin on-lines pr-5 text-[0.85rem] text-margin">{state.message}</p>}
      {state.phase === 'done' && (
        <p className="past-margin on-lines figures pr-5 text-[0.8rem] text-pencil">
          Ran {state.result.source === InferenceSource.ON_DEVICE ? 'on this device' : 'in the cloud'} · first words{' '}
          {seconds(state.result.firstChunkMs)} · total {seconds(state.result.totalMs)} · router: {state.result.decision.reason}
        </p>
      )}
    </section>
  )
}

export function Diagnostics({
  online,
  deviceStatus,
  refresh,
}: {
  online: boolean
  deviceStatus: OnDeviceStatus | null
  refresh: () => Promise<void>
}) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [progress, setProgress] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<Target, RunState>>({ on_device: { phase: 'idle' }, in_cloud: { phase: 'idle' } })

  const download = async () => {
    setDownloadError(null)
    setProgress(0)
    try {
      await startOnDeviceDownload((fraction) => {
        setProgress(fraction)
        if (fraction >= 1) void refresh()
      })
      await refresh()
    } catch (error) {
      setDownloadError(describeError(error))
      setProgress(null)
    }
  }

  const run = async (target: Target) => {
    setRuns((prev) => ({ ...prev, [target]: { phase: 'running', text: '' } }))
    let latest = ''
    try {
      const result = await ask(prompt, {
        task: 'connection-test',
        force: target,
        // Answers appear whole when ready, not typed out word by word.
        onText: (soFar) => {
          latest = soFar
        },
      })
      setRuns((prev) => ({ ...prev, [target]: { phase: 'done', result } }))
    } catch (error) {
      setRuns((prev) => ({ ...prev, [target]: { phase: 'error', message: describeError(error), text: latest } }))
    } finally {
      if (target === 'on_device') void refresh()
    }
  }

  const busy = (target: Target) => runs[target].phase === 'running'
  const canDownload = deviceStatus === 'downloadable' || deviceStatus === 'downloading'
  const button =
    'rounded-full px-5 py-2.5 text-[0.9rem] font-[620] text-sheet transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
      <section className="pt-10 sm:pt-14">
        <p className="eyebrow">Connection details</p>
        <h1 className="display mt-3 text-[clamp(2.2rem,6vw,3.6rem)]">Where answers can run right now</h1>
        <p className="mt-4 max-w-2xl text-pencil">
          Send the same question to the model in this browser and to {CLOUD_MODEL} in the cloud, and compare where each one
          ran and how long it took.
        </p>
      </section>

      <section className="ruled relative mt-8 rounded-[3px] pb-[var(--line)] shadow-[0_1px_0_var(--color-rule)]" style={{ paddingTop: 'var(--line)' }}>
        <Row
          label="Firebase config"
          value={missingConfigKeys.length ? `missing ${missingConfigKeys.join(', ')}` : 'loaded'}
          ok={missingConfigKeys.length === 0}
        />
        <Row
          label="App Check"
          value={appCheckMode === 'debug' ? 'debug token (development)' : appCheckMode === 'off' ? 'not configured' : 'reCAPTCHA Enterprise'}
          ok={appCheckMode !== 'off'}
        />
        <Row label="Network" value={online ? 'online' : 'offline'} ok={online} />
        <Row label="On-device model" value={deviceStatus ?? 'checking'} ok={deviceStatus === null ? null : deviceStatus === 'available'} />
        {deviceStatus && deviceStatus !== 'available' && (
          <div className="past-margin pr-5 text-[0.85rem] text-pencil">
            <p className="on-lines">{describeOnDeviceStatus(deviceStatus)}</p>
            {canDownload && (
              <div className="on-lines flex flex-wrap items-center gap-4">
                <button type="button" onClick={download} className="font-[620] text-ink underline decoration-margin decoration-2 underline-offset-4">
                  {deviceStatus === 'downloading' ? 'Track the download' : 'Download the on-device model'}
                </button>
                {progress !== null && <span className="figures">{Math.round(progress * 100)}%</span>}
              </div>
            )}
            {downloadError && <p className="on-lines text-margin">{downloadError}</p>}
          </div>
        )}
      </section>

      <section className="mt-8">
        <label htmlFor="prompt" className="eyebrow">
          Question
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          className="reading mt-2 w-full resize-y rounded-md border border-rule bg-sheet p-3 outline-none focus:border-ink"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => void run('on_device')} disabled={busy('on_device') || !prompt.trim()} className={`${button} bg-local`}>
            {busy('on_device') ? 'Asking this device…' : 'Ask on this device'}
          </button>
          <button type="button" onClick={() => void run('in_cloud')} disabled={busy('in_cloud') || !prompt.trim()} className={`${button} bg-cloud`}>
            {busy('in_cloud') ? 'Asking the cloud…' : 'Ask the cloud'}
          </button>
        </div>
      </section>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Answer title="Gemini Nano in Chrome" tone="local" state={runs.on_device} />
        <Answer title={CLOUD_MODEL} tone="cloud" state={runs.in_cloud} />
      </div>
    </main>
  )
}
