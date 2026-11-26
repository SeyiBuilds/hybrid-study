import { useEffect, useState } from 'react'
import { TopBar } from './components/TopBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { icons } from './components/icons'
import { useConnectivity } from './lib/useConnectivity'
import { useOnDeviceStartup } from './lib/useOnDeviceStartup'
import { useQueueFlusher } from './lib/useQueueFlusher'
import { routes, useHashRoute } from './lib/useHashRoute'
import { Diagnostics } from './screens/Diagnostics'
import { ExamScreen } from './screens/Exam'
import { Library } from './screens/Library'
import { Reader } from './screens/Reader'

const APP_TITLE = 'Hybrid Study: AI study help that keeps working offline'

export default function App() {
  const route = useHashRoute()
  const { online, deviceStatus, refresh } = useConnectivity()
  useOnDeviceStartup(deviceStatus)
  useQueueFlusher()
  const [docTitle, setDocTitle] = useState<string | null>(null)

  useEffect(() => {
    document.title =
      route.name === 'reader' && docTitle
        ? `${docTitle} · Hybrid Study`
        : route.name === 'exam' && docTitle
          ? `Exam: ${docTitle} · Hybrid Study`
          : APP_TITLE
  }, [route.name, docTitle])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.name])

  return (
    <>
      <TopBar deviceStatus={deviceStatus}>
        {route.name !== 'library' && (
          <>
            <a href={routes.library} className="shrink-0 text-[0.85rem] font-[600] text-pencil hover:text-ink">
              ← Library
            </a>
            {route.name === 'reader' && docTitle && (
              <>
                <span className="h-4 w-px shrink-0 bg-rule" aria-hidden />
                <span className="truncate text-[0.9rem] font-[600]">{docTitle}</span>
                <a
                  href={routes.exam(route.id)}
                  title="Sit a timed exam on these notes"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 text-[0.8rem] font-[620] text-ink transition-colors hover:bg-sheet"
                >
                  {icons.timer}
                  <span className="hidden sm:inline">Exam mode</span>
                </a>
              </>
            )}
            {route.name === 'exam' && docTitle && (
              <>
                <span className="h-4 w-px shrink-0 bg-rule" aria-hidden />
                <span className="truncate text-[0.9rem] font-[600]">Exam · {docTitle}</span>
              </>
            )}
          </>
        )}
      </TopBar>

      {route.name === 'library' && <Library />}
      {route.name === 'reader' && (
        <Reader id={route.id} page={route.page} onTitle={setDocTitle} connectivity={{ deviceStatus }} />
      )}
      {route.name === 'exam' && (
        <ExamScreen documentId={route.id} examId={route.examId} deviceStatus={deviceStatus} onTitle={setDocTitle} />
      )}
      {route.name === 'diagnostics' && <Diagnostics online={online} deviceStatus={deviceStatus} refresh={refresh} />}
      <UpdatePrompt />
    </>
  )
}
