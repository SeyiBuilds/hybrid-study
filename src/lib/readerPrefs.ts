/** Reader view settings remembered on this device: page zoom and whether the page list is open. */
import { useState } from 'react'

/** Zoom steps, relative to the page fitting the width of the reading area. */
export const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5]

function usePersisted<T>(key: string, fallback: T, valid: (value: unknown) => boolean): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored)
        if (valid(parsed)) return parsed as T
      }
    } catch {
      // Storage blocked or unreadable: use the default.
    }
    return fallback
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Not remembered, but still applied.
    }
  }
  return [value, set]
}

export function useZoom(): [number, (zoom: number) => void] {
  return usePersisted('hybrid-study:zoom', 1, (value) => ZOOM_STEPS.includes(value as number))
}

export function usePagesPane(): [boolean, (open: boolean) => void] {
  return usePersisted('hybrid-study:pages-pane', true, (value) => typeof value === 'boolean')
}

export interface QuizSettings {
  count: number
  level: 'easy' | 'medium' | 'hard' | 'mixed'
}

const LEVELS = ['easy', 'medium', 'hard', 'mixed']

/** The size and difficulty of page quizzes, remembered between pages. */
export function useQuizSettings(): [QuizSettings, (settings: QuizSettings) => void] {
  return usePersisted<QuizSettings>('hybrid-study:quiz-settings', { count: 5, level: 'mixed' }, (value) => {
    const settings = value as QuizSettings | null
    return !!settings && [5, 10, 15].includes(settings.count) && LEVELS.includes(settings.level)
  })
}

export interface ExamPrefs {
  count: number
  written: boolean
  level: 'easy' | 'medium' | 'hard' | 'mixed'
  minutes: number
}

/** The last exam setup, so the next exam starts from the same choices. */
export function useExamPrefs(): [ExamPrefs, (prefs: ExamPrefs) => void] {
  return usePersisted<ExamPrefs>('hybrid-study:exam-prefs', { count: 40, written: true, level: 'mixed', minutes: 60 }, (value) => {
    const prefs = value as ExamPrefs | null
    return !!prefs && [20, 40, 60].includes(prefs.count) && typeof prefs.written === 'boolean' && LEVELS.includes(prefs.level) && prefs.minutes > 0
  })
}
