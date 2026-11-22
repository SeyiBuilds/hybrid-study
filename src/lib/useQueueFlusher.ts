import { useEffect } from 'react'
import { flushQueue } from '../ai/queue'
import { useNetwork } from './network'

/** Give a returning connection a moment to settle before sending. */
const SETTLE_MS = 800

/**
 * Sends whatever is waiting in the offline queue as soon as the internet is back: when the
 * browser comes back online, or when the app finds the cloud reachable again after a
 * "connected but no internet" spell (which the browser doesn't announce).
 */
export function useQueueFlusher() {
  const network = useNetwork()
  const connected = network.quality !== 'offline'

  useEffect(() => {
    if (!connected) return
    const timer = window.setTimeout(() => void flushQueue(), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [connected])
}
