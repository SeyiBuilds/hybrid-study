/** The app's line icons, drawn on one 20-unit grid with the same stroke. */
import type { ReactNode } from 'react'

const draw = (paths: ReactNode) => (
  <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
)

export const icons = {
  previous: draw(<path d="M12 4.5 6.5 10l5.5 5.5" />),
  next: draw(<path d="m8 4.5 5.5 5.5L8 15.5" />),
  zoomOut: draw(<path d="M5 10h10" />),
  zoomIn: draw(<path d="M5 10h10M10 5v10" />),
  enlarge: draw(<path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />),
  shrink: draw(<path d="M7.5 3.5v4h-4M12.5 3.5v4h4M7.5 16.5v-4h-4M12.5 16.5v-4h4" />),
  /** A panel with its left column: hide (arrow pointing in) or show (arrow pointing out). */
  hidePanel: draw(
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M7.5 3.5v13M13 8l-2 2 2 2" />
    </>,
  ),
  showPanel: draw(
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M7.5 3.5v13M11 8l2 2-2 2" />
    </>,
  ),
  timer: draw(
    <>
      <circle cx="10" cy="11" r="6" />
      <path d="M10 8v3l2 1.3M8 2.5h4" />
    </>,
  ),
}
