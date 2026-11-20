import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { HIGHLIGHT_COLORS, highlightFill } from '../lib/highlights'
import type { Highlight, HighlightColor } from '../lib/library'

export type ToolbarTarget =
  | { kind: 'selection'; anchor: DOMRect }
  | { kind: 'highlight'; anchor: DOMRect; highlight: Highlight }

/**
 * Floating pen case over the page: highlighter colours, a note, or a question about
 * the selected words. For an existing highlight it changes the colour or removes it.
 */
export function MarkToolbar({
  target,
  onHighlight,
  onNote,
  onExplain,
  onAsk,
  onRemove,
  onClose,
}: {
  target: ToolbarTarget
  onHighlight: (color: HighlightColor) => void
  onNote: () => void
  /** Ask straight away for a plain-words breakdown of the words. */
  onExplain: () => void
  onAsk: () => void
  onRemove: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const { anchor } = target
    const width = element.offsetWidth
    const height = element.offsetHeight
    const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - 8)
    const above = anchor.top - height - 10
    const top = above > 8 ? above : Math.min(anchor.bottom + 10, window.innerHeight - height - 8)
    setPosition({ left, top })
  }, [target])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose])

  const current = target.kind === 'highlight' ? target.highlight.color : null
  // Keep the text selection alive while pressing toolbar buttons.
  const keepSelection = (event: React.MouseEvent) => event.preventDefault()
  const textButton =
    'rounded-full px-3 py-1.5 text-[0.8rem] font-[620] text-sheet/85 transition-colors hover:bg-sheet/15 hover:text-sheet'

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={target.kind === 'selection' ? 'Mark the selected words' : 'Edit highlight'}
      onMouseDown={keepSelection}
      className="fixed z-40 flex items-center gap-1 rounded-full bg-ink p-1 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5)]"
      style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
    >
      <div className="flex items-center gap-1 px-1">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            title={color.label}
            aria-label={color.label}
            aria-pressed={current === color.id}
            onClick={() => onHighlight(color.id)}
            className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
              current === color.id ? 'border-sheet' : 'border-transparent'
            }`}
            style={{ background: highlightFill[color.id] }}
          />
        ))}
      </div>
      <span className="mx-0.5 h-5 w-px bg-sheet/25" aria-hidden />
      <button type="button" className={textButton} onClick={onNote}>
        {target.kind === 'highlight' && target.highlight.note ? 'Edit note' : 'Add note'}
      </button>
      <button type="button" className={textButton} onClick={onExplain}>
        Explain
      </button>
      <button type="button" className={textButton} onClick={onAsk}>
        Ask
      </button>
      {target.kind === 'highlight' && (
        <button type="button" className={`${textButton} hover:text-[#ffb4ab]`} onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  )
}
