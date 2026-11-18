/**
 * Decides, per request, whether generation runs on-device or in the cloud.
 * Every generation call in the app goes through `ask()`.
 *
 * Decision order:
 *   0. The student's own choice ("This laptop" or "Cloud") wins.
 *   1. No on-device model and offline: nothing can answer yet.
 *   2. No on-device model: cloud.
 *   3. Offline: on-device (a slow answer beats no answer).
 *   4. Browser data saver on: on-device.
 *   5. Hard question on a solid connection: cloud.
 *   6. Simple task, device fast enough: on-device.
 *   7. Otherwise: cloud if the connection is usable, else on-device.
 *
 * Device speed is measured in the next router step; until then the device counts as fast enough.
 */
import {
  generateStream,
  getOnDeviceStatus,
  type GenerateResult,
  type OnDeviceStatus,
  type OutputFormat,
  type Target,
} from './client'
import type { Difficulty } from './difficulty'
import { logRoute } from './routeLog'
import { readNetwork, type NetworkState } from '../lib/network'

export type Task = 'summarise' | 'ask' | 'quiz' | 'connection-test'

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

/** Thrown when no model can answer right now (offline and no on-device model). */
export class NoRouteError extends Error {
  constructor() {
    super('You are offline, and this browser cannot run AI on the device. Reconnect to use the cloud.')
    this.name = 'NoRouteError'
  }
}

/** Pure decision: also used to tell the student where a request will run before they press the button. */
export function decide({
  difficulty = 'simple',
  force,
  onDeviceStatus,
  network,
  deviceFast = true,
}: RouteInput): RouteDecision | null {
  if (force) {
    return {
      target: force,
      cause: 'student-choice',
      reason: force === 'on_device' ? 'you chose this laptop' : 'you chose the cloud',
    }
  }
  const offline = network.quality === 'offline'
  if (onDeviceStatus !== 'available') {
    return offline ? null : { target: 'in_cloud', cause: 'no-device-model', reason: 'on-device unavailable' }
  }
  if (offline) return { target: 'on_device', cause: 'offline', reason: 'offline' }
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
  const decision = decide({
    task: options.task,
    difficulty: options.difficulty,
    force: options.force,
    onDeviceStatus: await getOnDeviceStatus(),
    network: readNetwork(),
  })
  if (!decision) throw new NoRouteError()
  logRoute({ task: options.task, target: decision.target, reason: decision.reason })
  options.onDecision?.(decision)
  const text = typeof prompt === 'function' ? prompt(decision) : prompt
  const result = await generateStream(text, decision.target, options.onText, options.format)
  return { ...result, decision }
}
