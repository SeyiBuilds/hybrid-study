import { useCallback, useEffect, useState } from 'react'
import { getOnDeviceStatus, type OnDeviceStatus } from '../ai/client'

/** Live network state plus the on-device model's status, re-checked while it downloads. */
export function useConnectivity() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [deviceStatus, setDeviceStatus] = useState<OnDeviceStatus | null>(null)

  const refresh = useCallback(async () => {
    setDeviceStatus(await getOnDeviceStatus())
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getOnDeviceStatus().then((status) => {
      if (!cancelled) setDeviceStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (deviceStatus !== 'downloading') return
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [deviceStatus, refresh])

  return { online, deviceStatus, refresh }
}
