import type { ReactNode } from 'react'
import type { OnDeviceStatus } from '../ai/client'
import { useQueue } from '../ai/queue'
import { useDataLedger } from '../lib/dataLedger'
import { useNetwork } from '../lib/network'
import { dataSize } from '../lib/format'
import { routes } from '../lib/useHashRoute'

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--color-ink)" />
      <path d="M8 10.5c2.6-1.4 5.3-1.4 8 0v12c-2.7-1.4-5.4-1.4-8 0z" fill="var(--color-sheet)" />
      <path d="M16 10.5c2.6-1.4 5.3-1.4 8 0v12c-2.7-1.4-5.4-1.4-8 0z" fill="var(--color-sheet)" opacity=".72" />
      <path d="M11 8v17" stroke="var(--color-margin)" strokeWidth="1.2" />
    </svg>
  )
}

function aiLabel(status: OnDeviceStatus | null): { text: string; tone: 'local' | 'pending' | 'cloud' } {
  switch (status) {
    case 'available':
      return { text: 'On-device AI ready', tone: 'local' }
    case 'downloading':
      return { text: 'On-device AI downloading', tone: 'pending' }
    case 'downloadable':
      return { text: 'On-device AI not downloaded', tone: 'pending' }
    case 'unavailable':
    case 'unsupported':
      return { text: 'Cloud AI only', tone: 'cloud' }
    default:
      return { text: 'Checking AI…', tone: 'pending' }
  }
}

const toneColor = {
  local: 'bg-local',
  cloud: 'bg-cloud',
  pending: 'bg-pencil/50',
}

export function StatusPill({ deviceStatus }: { deviceStatus: OnDeviceStatus | null }) {
  const ai = aiLabel(deviceStatus)
  const network = useNetwork()
  const online = network.quality !== 'offline'
  return (
    <a
      href={routes.diagnostics}
      title="Connection details"
      className="group flex items-center gap-3 rounded-full px-3 py-1.5 text-[0.8rem] font-medium text-pencil transition-colors hover:bg-sheet hover:text-ink"
    >
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-ink/60' : 'bg-margin'}`} aria-hidden />
        <span className={online ? '' : 'text-margin'} title={network.noInternet ? 'Connected, but the internet is not getting through' : undefined}>
          {online ? 'Online' : network.noInternet ? 'No internet' : 'Offline'}
        </span>
      </span>
      <span className="hidden h-3 w-px bg-rule sm:block" aria-hidden />
      <span className="hidden items-center gap-1.5 sm:flex">
        <span className={`h-1.5 w-1.5 rounded-full ${toneColor[ai.tone]}`} aria-hidden />
        {ai.text}
      </span>
    </a>
  )
}

/** How many requests are waiting in the offline queue for a connection. */
function QueueCount() {
  const queue = useQueue()
  if (queue.length === 0) return null
  return (
    <span
      title="These go to the cloud by themselves when you're back online"
      className="figures flex shrink-0 items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] text-pencil"
      role="status"
    >
      <span className="font-[680] text-cloud">{queue.length}</span>
      <span>waiting for a connection</span>
    </span>
  )
}

/** The running total of data saved by answering on this laptop instead of the cloud. */
function DataSaved() {
  const ledger = useDataLedger()
  if (ledger.onDeviceAnswers === 0) return null
  return (
    <a
      href={`${routes.diagnostics}`}
      title={`Saved by answering ${ledger.onDeviceAnswers} ${ledger.onDeviceAnswers === 1 ? 'request' : 'requests'} on this laptop instead of the cloud`}
      className="figures flex shrink-0 items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] text-pencil transition-colors hover:bg-sheet hover:text-ink"
    >
      <span className="font-[680] text-local">{dataSize(ledger.savedBytes)}</span>
      <span>saved</span>
    </a>
  )
}

export function TopBar({ deviceStatus, children }: { deviceStatus: OnDeviceStatus | null; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-desk/90 backdrop-blur supports-[backdrop-filter]:bg-desk/75">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
        <a href={routes.library} className="flex items-center gap-2.5" aria-label="Hybrid Study library">
          <Mark />
          <span className="display hidden text-[1.15rem] sm:inline">Hybrid Study</span>
        </a>
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
        <QueueCount />
        <DataSaved />
        <StatusPill deviceStatus={deviceStatus} />
      </div>
    </header>
  )
}
