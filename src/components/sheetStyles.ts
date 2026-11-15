/** Shared class names and helpers for the ruled study sheet. */
import { estimateCloudBytesFor, type OnDeviceStatus } from '../ai/client'
import { decide, type Task } from '../ai/router'
import { dataSize } from '../lib/format'
import { forcedTarget, type RunOn } from '../lib/runOn'

export const pillButton =
  'inline-flex h-[calc(var(--line)-6px)] items-center rounded-full bg-ink px-4 font-sans text-[0.85rem] font-[620] text-sheet transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
export const textButton =
  'font-sans text-[0.82rem] font-[620] text-ink underline decoration-margin decoration-2 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40'
export const quietButton = 'font-sans text-[0.8rem] font-[560] text-pencil hover:text-ink'

/** Text areas the student writes in: blue biro on the ruled lines. */
export const penField =
  'reading on-lines block w-full resize-none border-0 bg-transparent p-0 text-pen outline-none [field-sizing:content] placeholder:text-pencil/70 focus:ring-0'

export interface RunPreview {
  text: string
  blocked: boolean
}

/** Tells the student, before they press the button, where a request will run and what it costs. */
export function previewRun({
  task,
  runOn,
  online,
  deviceStatus,
  prompt,
}: {
  task: Task
  runOn: RunOn
  online: boolean
  deviceStatus: OnDeviceStatus | null
  prompt: string
}): RunPreview {
  const decision = decide({ task, force: forcedTarget(runOn), onDeviceStatus: deviceStatus, online })
  if (!decision) return { text: 'You are offline, and this browser cannot run AI on the device.', blocked: true }
  if (decision.target === 'on_device') {
    if (deviceStatus !== 'available') {
      return { text: "This laptop's AI is not ready. Choose Auto or Cloud above.", blocked: true }
    }
    return { text: 'Runs on this laptop and uses no data.', blocked: false }
  }
  if (!online) return { text: 'You are offline. Choose Auto or This laptop above.', blocked: true }
  return {
    text: `Runs in the cloud and uses about ${dataSize(estimateCloudBytesFor(prompt), { approximate: false })} of data.`,
    blocked: false,
  }
}
