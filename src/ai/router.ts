/**
 * Decides, per request, whether generation runs on-device or in the cloud.
 * Every generation call in the app goes through `ask()`.
 *
 * Decision order:
 *   0. The student's own choice ("This laptop" or "Cloud") wins. Cloud while offline waits.
 *   1. No on-device model and offline: queue it for the cloud.
 *   2. No on-device model: cloud.
 *   3. Offline: on-device (a slow answer beats no answer), except hard questions,
 *      which are queued for the cloud and sent automatically when the connection returns.
 *   4. Browser data saver on: on-device.
 *   5. Hard question on a solid connection: cloud.
 *   6. Simple task, device fast enough: on-device.
 *   7. Otherwise: cloud if the connection is usable, else on-device.
 *
 * Device speed comes from a one-off speed check (src/ai/deviceSpeed.ts); until it has run,
 * the device counts as fast enough.
 */
import {
  estimateCloudBytes,
  generateStream,
  getOnDeviceStatus,
  isNetworkFailure,
  type GenerateResult,
  type OnDeviceStatus,
  type OutputFormat,
  type Target,
} from './client'
import { deviceIsFast } from './deviceSpeed'
import type { Difficulty } from './difficulty'
import { DeferredError } from './errors'
import { logRoute } from './routeLog'
import { recordUsage } from '../lib/dataLedger'
import { markCloudReachable, markCloudUnreachable, readNetwork, type NetworkState } from '../lib/network'

export type Task = 'summarise' | 'ask' | 'quiz' | 'exam' | 'marking' | 'connection-test' | 'speed-check'

/** Tasks that measure or test the models rather than help the student; not counted as data saved. */
const SYSTEM_TASKS: Task[] = ['connection-test', 'speed-check']

export type RouteCause =
  | 'student-choice'
  | 'no-device-model'
  | 'offline'
  | 'data-saver'
  | 'hard-task'
  | 'simple-task'
  | 'slow-device'
  | 'weak-connection'

export interface RouteDecision {
  target: Target
  cause: RouteCause
  /** Short human-readable reason, shown under "How it decides". */
  reason: string
  /** The request can't run now; it waits in the offline queue for a connection. */
  deferred?: boolean
}

export interface RouteInput {
  task: Task
  difficulty?: Difficulty
  /** The student's explicit choice, or a forced target from Connection details. */
  force?: Target
  onDeviceStatus: OnDeviceStatus | null
  network: NetworkState
  /** Whether this device runs the model quickly enough for everyday tasks. */
  deviceFast?: boolean
}

/** Pure decision: also used to tell the student where a request will run before they press the button. */
export function decide({
  task,
  difficulty = 'simple',
  force,
  onDeviceStatus,
  network,
  deviceFast = true,
}: RouteInput): RouteDecision {
  const offline = network.quality === 'offline'
  if (force) {
    if (force === 'in_cloud' && offline) {
      return { target: 'in_cloud', cause: 'student-choice', reason: 'you chose the cloud: waiting for a connection', deferred: true }
    }
    return {
      target: force,
      cause: 'student-choice',
      reason: task === 'speed-check' ? 'speed check' : force === 'on_device' ? 'you chose this laptop' : 'you chose the cloud',
    }
  }
  if (onDeviceStatus !== 'available') {
    return offline
      ? { target: 'in_cloud', cause: 'no-device-model', reason: 'offline + on-device unavailable: queued', deferred: true }
      : { target: 'in_cloud', cause: 'no-device-model', reason: 'on-device unavailable' }
  }
  if (offline) {
    return difficulty === 'hard'
      ? { target: 'in_cloud', cause: 'hard-task', reason: 'hard question while offline: queued for the cloud', deferred: true }
      : { target: 'on_device', cause: 'offline', reason: 'offline' }
  }
  if (network.saveData) return { target: 'on_device', cause: 'data-saver', reason: 'data saver on' }
  if (difficulty === 'hard' && network.quality === 'solid') {
    return { target: 'in_cloud', cause: 'hard-task', reason: 'hard question + good connection' }
  }
  if (difficulty === 'simple' && deviceFast) return { target: 'on_device', cause: 'simple-task', reason: 'simple task' }
  if (network.usable) {
    return difficulty === 'hard'
      ? { target: 'in_cloud', cause: 'hard-task', reason: 'hard question + usable connection' }
      : { target: 'in_cloud', cause: 'slow-device', reason: 'slow device + usable connection' }
  }
  return { target: 'on_device', cause: 'weak-connection', reason: 'connection too weak for the cloud' }
}

export interface AskResult extends GenerateResult {
  decision: RouteDecision
}

export async function ask(
  /** The prompt, or a function of the decision when the target changes what is sent. */
  prompt: string | ((decision: RouteDecision) => string),
  options: {
    task: Task
    difficulty?: Difficulty
    force?: Target
    format?: OutputFormat
    onText: (textSoFar: string) => void
    /** Called once the router has picked a target, before generation starts. */
    onDecision?: (decision: RouteDecision) => void
  },
): Promise<AskResult> {
  const route = async () =>
    decide({
      task: options.task,
      difficulty: options.difficulty,
      force: options.force,
      onDeviceStatus: await getOnDeviceStatus(),
      network: readNetwork(),
      deviceFast: deviceIsFast(),
    })
  const promptFor = (chosen: RouteDecision) => (typeof prompt === 'function' ? prompt(chosen) : prompt)

  let decision = await route()
  logRoute({ task: options.task, target: decision.target, reason: decision.reason, deferred: decision.deferred })
  if (decision.deferred) throw new DeferredError(decision.reason)
  options.onDecision?.(decision)
  let text = promptFor(decision)
  let result: GenerateResult
  try {
    result = await generateStream(text, decision.target, options.onText, options.format)
  } catch (error) {
    // The browser said online, but the cloud couldn't be reached. Treat it as offline and
    // decide again: the laptop answers what it can; the rest waits in the offline queue.
    if (decision.target !== 'in_cloud' || !isNetworkFailure(error)) throw error
    markCloudUnreachable()
    const retry = await route()
    const reason = `cloud unreachable: ${retry.reason}`
    logRoute({ task: options.task, target: retry.target, reason, deferred: retry.deferred })
    if (retry.deferred || retry.target !== 'on_device') throw new DeferredError(reason)
    decision = { ...retry, reason }
    options.onDecision?.(decision)
    text = promptFor(decision)
    result = await generateStream(text, 'on_device', options.onText, options.format)
  }
  if (result.source === 'in_cloud') markCloudReachable()
  if (!SYSTEM_TASKS.includes(options.task)) {
    const onDevice = result.source === 'on_device'
    recordUsage({
      onDevice,
      usedBytes: result.bytes,
      // What the same request would have cost in the cloud.
      savedBytes: onDevice ? estimateCloudBytes(text, result.text) : 0,
    })
  }
  return { ...result, decision }
}
