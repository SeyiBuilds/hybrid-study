/** What the browser can tell us about the connection, as one live value. */
import { useSyncExternalStore } from 'react'
import { ROUTER_DEFAULTS, type RouterConfig } from '../ai/routerConfig'

export type NetworkQuality = 'offline' | 'slow' | 'solid'

export interface NetworkState {
  quality: NetworkQuality
  /** Whether a cloud request is worth attempting at all. */
  usable: boolean
  /** The browser or operating system's own data saver. */
  saveData: boolean
  effectiveType: string | null
  downlinkMbps: number | null
  rttMs: number | null
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

function connection(): NetworkInformationLike | undefined {
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection
}

/** Browsers report 0 when they have no estimate. */
function known(value: number | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

export function describeNetwork(
  input: { online: boolean; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean },
  config: RouterConfig = ROUTER_DEFAULTS,
): NetworkState {
  const effectiveType = input.effectiveType ?? null
  const downlinkMbps = known(input.downlink)
  const rttMs = known(input.rtt)
  const saveData = input.saveData === true
  if (!input.online) return { quality: 'offline', usable: false, saveData, effectiveType, downlinkMbps, rttMs }

  const slowType = effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g'
  const slow =
    slowType ||
    (downlinkMbps !== null && downlinkMbps < config.solidDownlinkMbps) ||
    (rttMs !== null && rttMs > config.solidRttMs)
  const usable =
    effectiveType !== 'slow-2g' &&
    (downlinkMbps === null || downlinkMbps >= config.usableDownlinkMbps) &&
    (rttMs === null || rttMs <= config.usableRttMs)

  return { quality: slow ? 'slow' : 'solid', usable, saveData, effectiveType, downlinkMbps, rttMs }
}

function measure(): NetworkState {
  const info = connection()
  return describeNetwork({
    online: navigator.onLine,
    effectiveType: info?.effectiveType,
    downlink: info?.downlink,
    rtt: info?.rtt,
    saveData: info?.saveData,
  })
}

let current = measure()
const listeners = new Set<() => void>()

function refresh() {
  const next = measure()
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  listeners.forEach((listener) => listener())
}

window.addEventListener('online', refresh)
window.addEventListener('offline', refresh)
connection()?.addEventListener('change', refresh)

/** The connection right now, for decisions made outside React. */
export function readNetwork(): NetworkState {
  refresh()
  return current
}

export function useNetwork(): NetworkState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

/** "Good (4g, 10 Mbps, 50 ms)", for the router details. */
export function networkLabel(network: NetworkState): string {
  if (network.quality === 'offline') return 'Offline'
  const name = network.quality === 'solid' ? 'Good' : network.usable ? 'Slow' : 'Very weak'
  const details = [
    network.effectiveType,
    network.downlinkMbps !== null ? `${network.downlinkMbps} Mbps` : null,
    network.rttMs !== null ? `${network.rttMs} ms` : null,
  ].filter(Boolean)
  return details.length > 0 ? `${name} (${details.join(', ')})` : name
}
