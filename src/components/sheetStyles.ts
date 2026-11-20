/** Shared class names and helpers for the ruled study sheet. */
import { estimateCloudBytesFor, type OnDeviceStatus, type Target } from '../ai/client'
import { deviceIsFast } from '../ai/deviceSpeed'
import type { Difficulty } from '../ai/difficulty'
import { decide, type RouteCause, type Task } from '../ai/router'
import { dataSize } from '../lib/format'
import type { NetworkState } from '../lib/network'
import { forcedTarget, type RunOn } from '../lib/runOn'

export const pillButton =
  'inline-flex h-[calc(var(--line)-6px)] items-center rounded-full bg-ink px-4 font-sans text-[0.85rem] font-[620] text-sheet transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
export const textButton =
  'font-sans text-[0.82rem] font-[620] text-ink underline decoration-margin decoration-2 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40'
export const quietButton = 'font-sans text-[0.8rem] font-[560] text-pencil hover:text-ink'

/**
 * Boxes the student writes in, like answer boxes on an exam paper: clearly a place to
 * type, with blue-biro text that still sits on the sheet's line height.
 */
export const penField =
  'reading on-lines block w-full cursor-text resize-none rounded-[4px] border-[1.5px] border-rule bg-desk/45 px-2.5 py-0 text-pen outline-none transition-colors [field-sizing:content] placeholder:text-pencil hover:border-pencil/70 focus:border-ink focus:bg-sheet focus-visible:outline-none'

export interface RunPreview {
  text: string
  blocked: boolean
}

const ON_DEVICE_PREVIEW: Partial<Record<RouteCause, string>> = {
  offline: "You're offline, so this runs on this laptop and uses no data.",
  'data-saver': 'Data saver is on, so this runs on this laptop and uses no data.',
  'weak-connection': 'The connection is too weak for the cloud, so this runs on this laptop and uses no data.',
}

/** Tells the student, before they press the button, where a request will run, why, and what it costs. */
export function previewRun({
  task,
  difficulty,
  runOn,
  network,
  deviceStatus,
  prompt,
  expectedAnswerChars,
}: {
  task: Task
  difficulty?: Difficulty
  runOn: RunOn
  network: NetworkState
  deviceStatus: OnDeviceStatus | null
  /** The prompt, or a function of the target when that changes what is sent. */
  prompt: string | ((target: Target) => string)
  /** Rough answer length, for the data estimate. */
  expectedAnswerChars?: number
}): RunPreview {
  const decision = decide({
    task,
    difficulty,
    force: forcedTarget(runOn),
    onDeviceStatus: deviceStatus,
    network,
    deviceFast: deviceIsFast(),
  })
  if (decision.target === 'on_device') {
    if (deviceStatus !== 'available') {
      return { text: "This laptop's AI is not ready. Choose Auto or Cloud above.", blocked: true }
    }
    return { text: ON_DEVICE_PREVIEW[decision.cause] ?? 'Runs on this laptop and uses no data.', blocked: false }
  }
  if (decision.deferred) {
    return {
      text:
        decision.cause === 'hard-task'
          ? "Hard question and you're offline, so it will wait and go to the cloud when you're back online."
          : decision.cause === 'no-device-model'
            ? "You're offline and this laptop's AI isn't ready, so this will wait for a connection."
            : "You're offline, so this will wait and go to the cloud when you're back online.",
      blocked: false,
    }
  }
  const text = typeof prompt === 'function' ? prompt(decision.target) : prompt
  const size = dataSize(estimateCloudBytesFor(text, expectedAnswerChars), { approximate: false })
  return {
    text:
      decision.cause === 'hard-task'
        ? `Hard question, so this runs in the cloud and uses about ${size} of data.`
        : decision.cause === 'slow-device'
          ? `This laptop is slow at AI, so this runs in the cloud and uses about ${size} of data.`
          : `Runs in the cloud and uses about ${size} of data.`,
    blocked: false,
  }
}
