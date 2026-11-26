import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * The app shell is saved on the device so Hybrid Study opens offline. When a new version
 * has been deployed, this asks before reloading, so an answer being written or an exam in
 * progress isn't cut off.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-rule bg-sheet px-4 py-3 font-sans text-[0.86rem] text-ink shadow-[0_18px_40px_-20px_rgb(24_40_72/0.6)]"
    >
      <span className="min-w-0 flex-1">
        {needRefresh ? 'A new version of Hybrid Study is ready.' : 'Hybrid Study is saved on this device and now opens offline.'}
      </span>
      {needRefresh ? (
        <span className="flex items-center gap-3">
          <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-full bg-ink px-3.5 py-1 font-[640] text-sheet hover:opacity-90">
            Reload
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)} className="font-[560] text-pencil hover:text-ink">
            Later
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setOfflineReady(false)} className="font-[600] text-pencil hover:text-ink">
          OK
        </button>
      )}
    </div>
  )
}
