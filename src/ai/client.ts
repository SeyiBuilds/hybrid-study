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
import { quizSchema } from './quiz'
import { ROUTER_DEFAULTS } from './routerConfig'
import { app } from '../firebase'

export type Target = 'on_device' | 'in_cloud'

/** What the model should return. Configuration is fixed per model, so each format has its own pair. */
export type OutputFormat = 'text' | 'quiz'

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

/** Fail a dead connection quickly instead of waiting for the SDK's 3-minute default. */
const cloudRequestOptions = { timeout: ROUTER_DEFAULTS.cloudTimeoutMs }

const cloudModel = getGenerativeModel(
  ai,
  { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: CLOUD_MODEL } },
  cloudRequestOptions,
)

const quizOnDeviceModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: onDeviceCreateOptions,
    promptOptions: { responseConstraint: quizSchema },
  },
})

const quizCloudModel = getGenerativeModel(
  ai,
  {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: { responseMimeType: 'application/json', responseSchema: quizSchema },
    },
  },
  cloudRequestOptions,
)

const models = {
  text: { on_device: onDeviceModel, in_cloud: cloudModel },
  quiz: { on_device: quizOnDeviceModel, in_cloud: quizCloudModel },
}

/** Minimal shape of Chrome's global `LanguageModel`, used only for availability checks. */
interface ChromeLanguageModel {
  availability(options?: LanguageModelCreateOptions): Promise<Exclude<OnDeviceStatus, 'unsupported'>>
  create?(options?: LanguageModelCreateOptions): Promise<{ destroy(): void }>
}

let warmSession: { destroy(): void } | null = null

/**
 * Loads the on-device model into memory when the app opens, so the first real request
 * doesn't wait for it. Opening an idle session generates nothing; all generation still
 * goes through Firebase AI Logic.
 */
export async function warmUpOnDevice(): Promise<boolean> {
  if (warmSession) return true
  const languageModel = chromeLanguageModel()
  if (!languageModel?.create || (await getOnDeviceStatus()) !== 'available') return false
  try {
    warmSession = await languageModel.create(onDeviceCreateOptions)
    return true
  } catch {
    return false
  }
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
  /** Estimated mobile data used, in bytes. Always 0 on-device. */
  bytes: number
}

const utf8 = new TextEncoder()

/**
 * Rough size of a cloud request on the wire: the prompt in a JSON body, the streamed
 * response (each server-sent event repeats JSON wrapping around its text) and
 * HTTP/TLS overhead. Good enough to show students the order of magnitude.
 */
export function estimateCloudBytes(prompt: string, response: string): number {
  const requestBody = utf8.encode(prompt).length + 400
  const responseBody = utf8.encode(response).length * 1.6 + 900
  const overhead = 1800
  return Math.round(requestBody + responseBody + overhead)
}

/** Rough data cost of sending a prompt to the cloud, before the answer is known. */
export function estimateCloudBytesFor(prompt: string, expectedAnswerChars = 700): number {
  return estimateCloudBytes(prompt, 'x'.repeat(expectedAnswerChars))
}

/**
 * Chrome's on-device model works best with one prompt at a time, and the SDK closes the
 * previous on-device session when a new one starts, so on-device requests run in order.
 */
let onDeviceQueue: Promise<unknown> = Promise.resolve()

function runOnDeviceInOrder<T>(job: () => Promise<T>): Promise<T> {
  const next = onDeviceQueue.then(job, job)
  onDeviceQueue = next.catch(() => undefined)
  return next
}

async function stream(
  prompt: string,
  target: Target,
  onText: (textSoFar: string) => void,
  format: OutputFormat,
): Promise<GenerateResult> {
  if (target === 'on_device') {
    const status = await getOnDeviceStatus()
    if (status !== 'available') throw new OnDeviceNotReadyError(status)
  }

  const model = models[format][target]
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
  const source =
    response.inferenceSource ?? (target === 'on_device' ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD)
  return {
    text,
    source,
    totalMs: performance.now() - started,
    firstChunkMs,
    bytes: source === InferenceSource.IN_CLOUD ? estimateCloudBytes(prompt, text) : 0,
  }
}

/**
 * Streams a single-turn text answer from the chosen target.
 * `onText` receives the full text so far each time a chunk arrives.
 */
export function generateStream(
  prompt: string,
  target: Target,
  onText: (textSoFar: string) => void,
  format: OutputFormat = 'text',
): Promise<GenerateResult> {
  if (target === 'on_device') return runOnDeviceInOrder(() => stream(prompt, target, onText, format))
  return stream(prompt, target, onText, format)
}

/** Turns SDK errors into a message a student (or Seyi during setup) can act on. */
/**
 * True when a cloud request failed because the internet couldn't be reached (no route,
 * no DNS, or no answer before the timeout) rather than because the server said no.
 * The SDK reports these without an HTTP status.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return /timeout/i.test(error.message)
  if (/\[\d{3}\b/.test(error.message)) return false
  return /failed to fetch|networkerror|load failed|network|err_internet|err_name_not_resolved|timeout/i.test(error.message)
}

export function describeError(error: unknown): string {
  if (error instanceof OnDeviceNotReadyError) return error.message
  if (error instanceof Error && error.name === 'DeferredError') return error.message
  if (isNetworkFailure(error)) return "Couldn't reach the cloud. The internet doesn't seem to be getting through."

  if (error instanceof AIError) {
    const message = error.message
    if (error.code === 'api-not-enabled' || /genai config not found/i.test(message)) {
      return 'The cloud model turned this request down. Usually this browser is not verified by App Check yet (in development, add its debug token in Firebase console > App Check > Manage debug tokens). Otherwise, AI Logic is not set up for the project: open AI Services > AI Logic and choose the Gemini Developer API.'
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
