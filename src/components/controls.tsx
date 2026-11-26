/**
 * Shared controls, so every choice and tool in the app looks and behaves the same:
 * one segmented switch for choosing between options, and round icon buttons for tools.
 */
import { useId, type ReactNode } from 'react'

const SEGMENT_SIZES = {
  /** On the desk: Run AI on, exam setup. */
  md: { track: 'p-[3px]', item: 'h-7 px-3.5 text-[0.82rem]' },
  /** On the ruled paper: fits inside one line. */
  sm: { track: 'p-[2px]', item: 'h-[1.35rem] px-2.5 text-[0.78rem]' },
}

export function Segmented<T extends string | number | boolean>({
  label,
  labelledBy,
  value,
  options,
  onChange,
  size = 'md',
}: {
  /** Accessible name, when no visible heading names the group. */
  label?: string
  /** Id of a visible heading that names the group. */
  labelledBy?: string
  value: T
  options: Array<{ id: T; label: ReactNode; disabled?: boolean; title?: string }>
  onChange: (value: T) => void
  size?: keyof typeof SEGMENT_SIZES
}) {
  const name = useId()
  const sizes = SEGMENT_SIZES[size]
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={`inline-flex w-fit max-w-full flex-wrap rounded-full border border-rule bg-desk/70 ${sizes.track}`}
    >
      {options.map((option) => {
        const selected = option.id === value
        const disabled = Boolean(option.disabled) && !selected
        return (
          <label
            key={String(option.id)}
            title={option.title}
            className={`inline-flex items-center whitespace-nowrap rounded-full font-sans leading-none transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${sizes.item} ${
              selected
                ? 'cursor-pointer bg-ink font-[640] text-sheet'
                : disabled
                  ? 'cursor-not-allowed font-[520] text-pencil/45'
                  : 'cursor-pointer font-[540] text-pencil hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.id)}
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}

export function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  className = '',
  children,
}: {
  /** Said by screen readers and shown as a tooltip. */
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-pencil transition-colors hover:bg-desk hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${className}`}
    >
      {children}
    </button>
  )
}
