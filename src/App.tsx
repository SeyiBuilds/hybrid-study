import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { useConnectivity } from './lib/useConnectivity'
import { useOnDeviceStartup } from './lib/useOnDeviceStartup'
import { routes, useHashRoute } from './lib/useHashRoute'
import { Diagnostics } from './screens/Diagnostics'
import { Library } from './screens/Library'
import { Reader } from './screens/Reader'

const APP_TITLE = 'Hybrid Study: AI study help that keeps working offline'

export default function App() {
  const route = useHashRoute()
  const { online, deviceStatus, refresh } = useConnectivity()
  useOnDeviceStartup(deviceStatus)
  const [docTitle, setDocTitle] = useState<string | null>(null)

  useEffect(() => {
    document.title = route.name === 'reader' && docTitle ? `${docTitle} · Hybrid Study` : APP_TITLE
  }, [route.name, docTitle])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.name])

  return (
    <>
      <TopBar online={online} deviceStatus={deviceStatus}>
        {route.name !== 'library' && (
          <>
            <a href={routes.library} className="shrink-0 text-[0.85rem] font-[600] text-pencil hover:text-ink">
              ← Library
            </a>
            {route.name === 'reader' && docTitle && (
              <>
                <span className="h-4 w-px shrink-0 bg-rule" aria-hidden />
                <span className="truncate text-[0.9rem] font-[600]">{docTitle}</span>
              </>
            )}
          </>
        )}
      </TopBar>

      {route.name === 'library' && <Library />}
      {route.name === 'reader' && (
        <Reader id={route.id} page={route.page} onTitle={setDocTitle} connectivity={{ deviceStatus }} />
      )}
      {route.name === 'diagnostics' && <Diagnostics online={online} deviceStatus={deviceStatus} refresh={refresh} />}
    </>
  )
}
