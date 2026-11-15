/**
 * Decides, per request, whether generation runs on-device or in the cloud.
 * Every generation call in the app goes through `ask()`.
 *
 * Day 1 version: honours an explicit target (used by the connection test page)
 * and otherwise prefers on-device when it is ready. Network, task difficulty,
 * device speed, Data Saver and Remote Config thresholds are added on Days 5 to 8.
 */
import {
  generateStream,
  getOnDeviceStatus,
  type GenerateResult,
  type OnDeviceStatus,
  type Target,
} from './client'

export interface RouteDecision {
  target: Target
  /** Short human-readable reason, shown in the debug panel and on badges. */
  reason: string
}

export interface RouteInput {
  /** Forces a target, e.g. from the test page. */
  force?: Target
  onDeviceStatus: OnDeviceStatus
  online: boolean
}

export function decide({ force, onDeviceStatus, online }: RouteInput): RouteDecision {
  if (force) return { target: force, reason: `forced ${force === 'on_device' ? 'on-device' : 'cloud'}` }
  if (onDeviceStatus !== 'available') return { target: 'in_cloud', reason: 'on-device unavailable' }
  if (!online) return { target: 'on_device', reason: 'offline' }
  return { target: 'on_device', reason: 'on-device ready' }
}

export interface AskResult extends GenerateResult {
  decision: RouteDecision
}

export async function ask(
  prompt: string,
  options: { force?: Target; onText: (textSoFar: string) => void },
): Promise<AskResult> {
  const decision = decide({
    force: options.force,
    onDeviceStatus: await getOnDeviceStatus(),
    online: navigator.onLine,
  })
  const result = await generateStream(prompt, decision.target, options.onText)
  return { ...result, decision }
}
