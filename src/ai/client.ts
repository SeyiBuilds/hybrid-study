/**
 * The only module that talks to Firebase AI Logic.
 *
 * Two GenerativeModel instances are created up front, each pinned to one
 * inference mode, so the caller (the router) decides per request where an
 * answer runs and the UI always knows which one it was.
 */
import {
  AIError,
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type LanguageModelCreateOptions,
} from 'firebase/ai'
import { app } from '../firebase'

export type Target = 'on_device' | 'in_cloud'

/** Status of Chrome's built-in model, plus 'unsupported' when the Prompt API is missing entirely. */
export type OnDeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'

/** Cloud model used for in-cloud requests (the SDK's hybrid default, pinned here so it is visible). */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite'

/**
 * English text in, English text out. Chrome warns when languages are omitted,
 * and leaving out image input means the multimodal Chrome flag is not needed.
 */
const onDeviceCreateOptions: LanguageModelCreateOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
}

const ai = getAI(app, { backend: new GoogleAIBackend() })

const onDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: { createOptions: onDeviceCreateOptions },
})

const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: { model: CLOUD_MODEL },
})

/** Minimal shape of Chrome's global `LanguageModel`, used only for availability checks. */
interface ChromeLanguageModel {
  availability(options?: LanguageModelCreateOptions): Promise<Exclude<OnDeviceStatus, 'unsupported'>>
}

function chromeLanguageModel(): ChromeLanguageModel | undefined {
  return (globalThis as { LanguageModel?: ChromeLanguageModel }).LanguageModel
}

/**
 * Checks whether the on-device model can answer right now.
 * The Firebase SDK does not expose this, so this reads Chrome's Prompt API directly.
 */
export async function getOnDeviceStatus(): Promise<OnDeviceStatus> {
  const languageModel = chromeLanguageModel()
  if (!languageModel) return 'unsupported'
  try {
    return await languageModel.availability(onDeviceCreateOptions)
  } catch {
    return 'unavailable'
  }
}

/**
 * Starts (or attaches to) the on-device model download.
 * Chrome requires this to run from a user gesture such as a click.
 * Resolves once the download has been requested; progress arrives through the callback (0 to 1).
 */
export function startOnDeviceDownload(onProgress: (fraction: number) => void): Promise<void> {
  return onDeviceModel.initializeDeviceModel(onProgress)
}

/** Thrown when an on-device request is made before the model is ready. */
export class OnDeviceNotReadyError extends Error {
  readonly status: OnDeviceStatus

  constructor(status: OnDeviceStatus) {
    super(describeOnDeviceStatus(status))
    this.name = 'OnDeviceNotReadyError'
    this.status = status
  }
}

export function describeOnDeviceStatus(status: OnDeviceStatus): string {
  switch (status) {
    case 'available':
      return 'On-device model is ready.'
    case 'downloading':
      return 'The on-device model is still downloading. Keep Chrome open; it can take a while.'
    case 'downloadable':
      return 'The on-device model has not been downloaded yet. Start the download first.'
    case 'unavailable':
      return 'This device or Chrome profile cannot run the on-device model.'
    case 'unsupported':
      return 'On-device AI is not available in this browser. It needs desktop Chrome with the Prompt API.'
  }
}

export interface GenerateResult {
  text: string
  /** Where the answer actually ran, as reported by Firebase AI Logic. */
  source: InferenceSource
  /** Total time from request to last chunk, in milliseconds. */
  totalMs: number
  /** Time until the first chunk of text arrived, in milliseconds. */
  firstChunkMs: number | null
}

/**
 * Streams a single-turn text answer from the chosen target.
 * `onText` receives the full text so far each time a chunk arrives.
 */
export async function generateStream(
  prompt: string,
  target: Target,
  onText: (textSoFar: string) => void,
): Promise<GenerateResult> {
  if (target === 'on_device') {
    const status = await getOnDeviceStatus()
    if (status !== 'available') throw new OnDeviceNotReadyError(status)
  }

  const model = target === 'on_device' ? onDeviceModel : cloudModel
  const started = performance.now()
  let firstChunkMs: number | null = null
  let text = ''

  const result = await model.generateContentStream(prompt)
  for await (const chunk of result.stream) {
    const piece = chunk.text()
    if (!piece) continue
    if (firstChunkMs === null) firstChunkMs = performance.now() - started
    text += piece
    onText(text)
  }

  const response = await result.response
  return {
    text,
    source:
      response.inferenceSource ??
      (target === 'on_device' ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD),
    totalMs: performance.now() - started,
    firstChunkMs,
  }
}

/** Turns SDK errors into a message a student (or Seyi during setup) can act on. */
export function describeError(error: unknown): string {
  if (error instanceof OnDeviceNotReadyError) return error.message

  if (error instanceof AIError) {
    const message = error.message
    if (error.code === 'api-not-enabled' || /genai config not found/i.test(message)) {
      return 'Firebase AI Logic is not set up for this project yet. In Firebase console, open AI Services > AI Logic, click Get started and choose the Gemini Developer API.'
    }
    if (/app.?check/i.test(message) || /\[(401|403)\b/.test(message)) {
      return 'The cloud request was rejected (App Check or permissions). In development, copy the App Check debug token from the browser console into Firebase console > App Check > Apps > Manage debug tokens, then reload.'
    }
    if (error.code === 'fetch-error' && !navigator.onLine) {
      return 'You are offline, so the cloud model cannot be reached.'
    }
    return message
  }

  if (error instanceof Error) return error.message
  return String(error)
}
