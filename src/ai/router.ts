/**
 * Decides, per request, whether generation runs on-device or in the cloud.
 * Every generation call in the app goes through `ask()`.
 *
 * Current rules (network, task difficulty, device speed, Data Saver and
 * Remote Config thresholds come in the router steps of the build order):
 *   1. A forced target wins (the Connection details screen uses this).
 *   2. Offline and no on-device model: nothing can answer yet.
 *   3. On-device model ready: run on-device (free, private, works offline).
 *   4. Otherwise: run in the cloud.
 */
import {
  generateStream,
  getOnDeviceStatus,
  type GenerateResult,
  type OnDeviceStatus,
  type OutputFormat,
  type Target,
} from './client'

export type Task = 'summarise' | 'ask' | 'quiz' | 'connection-test'

export interface RouteDecision {
  target: Target
  /** Short human-readable reason, shown in the margin notes and Connection details. */
  reason: string
}

export interface RouteInput {
  task: Task
  /** Forces a target, e.g. from the Connection details screen. */
  force?: Target
  onDeviceStatus: OnDeviceStatus | null
  online: boolean
}

/** Thrown when no model can answer right now (offline and no on-device model). */
export class NoRouteError extends Error {
  constructor() {
    super('You are offline, and this browser cannot run AI on the device. Reconnect to use the cloud.')
    this.name = 'NoRouteError'
  }
}

/** Pure decision: also used to tell the student where a request will run before they press the button. */
export function decide({ force, onDeviceStatus, online }: RouteInput): RouteDecision | null {
  if (force) return { target: force, reason: force === 'on_device' ? 'you chose this laptop' : 'you chose the cloud' }
  const deviceReady = onDeviceStatus === 'available'
  if (!online && !deviceReady) return null
  if (deviceReady) return { target: 'on_device', reason: online ? 'on-device ready' : 'offline' }
  return { target: 'in_cloud', reason: 'on-device unavailable' }
}

export interface AskResult extends GenerateResult {
  decision: RouteDecision
}

export async function ask(
  prompt: string,
  options: {
    task: Task
    force?: Target
    format?: OutputFormat
    onText: (textSoFar: string) => void
    /** Called once the router has picked a target, before generation starts. */
    onDecision?: (decision: RouteDecision) => void
  },
): Promise<AskResult> {
  const decision = decide({
    task: options.task,
    force: options.force,
    onDeviceStatus: await getOnDeviceStatus(),
    online: navigator.onLine,
  })
  if (!decision) throw new NoRouteError()
  options.onDecision?.(decision)
  const result = await generateStream(prompt, decision.target, options.onText, options.format)
  return { ...result, decision }
}
