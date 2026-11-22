/** Which tab of the study sheet is open, and what is going on behind each one. */
import { useState } from 'react'
import { askJobPrefix } from '../ai/asks'
import { useJob, useJobs } from '../ai/jobs'
import { quizJobKey } from '../ai/quizzes'
import { summaryJobKey } from '../ai/summaries'

export type SheetTab = 'summary' | 'ask' | 'quiz' | 'notes'

export const SHEET_TABS: Array<{ id: SheetTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'ask', label: 'Ask' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'notes', label: 'Notes' },
]

const TAB_KEY = 'hybrid-study:sheet-tab'

function readTab(): SheetTab {
  try {
    const stored = localStorage.getItem(TAB_KEY)
    if (SHEET_TABS.some((tab) => tab.id === stored)) return stored as SheetTab
  } catch {
    // Storage can be blocked; start on the summary.
  }
  return 'summary'
}

/** The open tab, remembered on this device so the sheet reopens where the student left it. */
export function useSheetTab(): [SheetTab, (tab: SheetTab) => void] {
  const [tab, setTab] = useState<SheetTab>(readTab)
  const choose = (next: SheetTab) => {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // Not remembered, but still switches.
    }
  }
  return [tab, choose]
}

export type Activity = 'running' | 'queued' | 'error' | null

function activityOf(statuses: Array<string | undefined>): Activity {
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('queued')) return 'queued'
  if (statuses.includes('error')) return 'error'
  return null
}

/** Whether something is working, waiting or failed behind each tab, so it isn't missed on another tab. */
export function useSheetActivity(documentId: string, page: number): Record<SheetTab, Activity> {
  const summary = useJob(summaryJobKey(documentId, page))
  const asks = useJobs(askJobPrefix(documentId, page))
  const quiz = useJob(quizJobKey(documentId, page))
  return {
    summary: activityOf([summary?.status]),
    ask: activityOf(asks.map((job) => job.status)),
    quiz: activityOf([quiz?.status]),
    notes: null,
  }
}
