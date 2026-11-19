/**
 * How fast this laptop runs the on-device model. A short, realistic speed check runs once
 * (in the background, when nothing else is using the model) and the result is remembered.
 * The router uses it to decide whether everyday tasks belong on this laptop.
 */
import { useSyncExternalStore } from 'react'
import { describeError } from './client'
import { ask } from './router'
import { ROUTER_DEFAULTS } from './routerConfig'
import { seconds } from '../lib/format'

export interface DeviceSpeed {
  /** Time for the whole speed check, in milliseconds. */
  totalMs: number
  firstChunkMs: number | null
  measuredAt: number
  version: number
}

export type SpeedState =
  | { status: 'unknown' }
  | { status: 'measuring' }
  | { status: 'measured'; result: DeviceSpeed }
  | { status: 'failed'; message: string }

const STORAGE_KEY = 'hybrid-study:device-speed'
/** Bump when the check itself changes, so old results are measured again. */
const VERSION = 1

/** A small version of a real job: read a short paragraph, write one sentence. */
const SPEED_CHECK_PROMPT = [
  'Summarise this paragraph in one sentence.',
  '"""',
  'Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts,',
  'where the green pigment chlorophyll absorbs sunlight. The plant takes in carbon dioxide through small pores in its',
  'leaves and water through its roots. Using the energy from light, it combines them to make glucose, a sugar that stores',
  'energy, and releases oxygen as a by-product. The glucose is used for growth and to build other substances the plant needs.',
  '"""',
].join('\n')

function load(): SpeedState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as DeviceSpeed | null
    if (stored && stored.version === VERSION && typeof stored.totalMs === 'number') return { status: 'measured', result: stored }
  } catch {
    // Unreadable or unavailable storage: measure again.
  }
  return { status: 'unknown' }
}

let state = load()
const listeners = new Set<() => void>()

function set(next: SpeedState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function readDeviceSpeed(): SpeedState {
  return state
}

export function useDeviceSpeed(): SpeedState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** Until the check has run, the device counts as fast enough (so nothing spends data on a guess). */
export function deviceIsFast(current: SpeedState = state): boolean {
  return current.status !== 'measured' || current.result.totalMs <= ROUTER_DEFAULTS.deviceFastMaxMs
}

export async function measureDeviceSpeed(): Promise<void> {
  if (state.status === 'measuring') return
  set({ status: 'measuring' })
  try {
    const result = await ask(SPEED_CHECK_PROMPT, { task: 'speed-check', force: 'on_device', onText: () => {} })
    const speed: DeviceSpeed = { totalMs: result.totalMs, firstChunkMs: result.firstChunkMs, measuredAt: Date.now(), version: VERSION }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(speed))
    } catch {
      // Remembered for this visit only.
    }
    set({ status: 'measured', result: speed })
  } catch (error) {
    set({ status: 'failed', message: describeError(error) })
  }
}

export function speedLabel(current: SpeedState): string {
  switch (current.status) {
    case 'unknown':
      return 'Not measured yet'
    case 'measuring':
      return 'Measuring…'
    case 'failed':
      return "Couldn't measure"
    case 'measured':
      return `${seconds(current.result.totalMs)} speed check, ${deviceIsFast(current) ? 'fast enough' : 'slow'}`
  }
}
