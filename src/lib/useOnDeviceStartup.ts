import { useEffect } from 'react'
import { warmUpOnDevice, type OnDeviceStatus } from '../ai/client'
import { measureDeviceSpeed, readDeviceSpeed } from '../ai/deviceSpeed'
import { hasRunningJobs } from '../ai/jobs'

const FIRST_CHECK_DELAY_MS = 2500
const RETRY_WHEN_BUSY_MS = 3000

/**
 * Once the on-device model is ready: load it into memory, and, the first time only, run
 * the speed check in the background when no student request is using the model.
 */
export function useOnDeviceStartup(deviceStatus: OnDeviceStatus | null) {
  useEffect(() => {
    if (deviceStatus !== 'available') return
    void warmUpOnDevice()
    if (readDeviceSpeed().status !== 'unknown') return

    let timer = 0
    const tryCheck = () => {
      if (hasRunningJobs()) {
        timer = window.setTimeout(tryCheck, RETRY_WHEN_BUSY_MS)
        return
      }
      void measureDeviceSpeed()
    }
    timer = window.setTimeout(tryCheck, FIRST_CHECK_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [deviceStatus])
}
