import { useEffect } from 'react'
import { flushQueue } from '../ai/queue'

/** Give a returning connection a moment to settle before sending. */
const SETTLE_MS = 800

/** Sends whatever is waiting in the offline queue as soon as the browser is back online. */
export function useQueueFlusher() {
  useEffect(() => {
    let timer = 0
    const flush = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void flushQueue(), SETTLE_MS)
    }
    if (navigator.onLine) flush()
    window.addEventListener('online', flush)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', flush)
    }
  }, [])
}
