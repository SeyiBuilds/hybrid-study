const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday", "3 days ago"... */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day')
  return new Date(timestamp).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Mobile data in the units students see on their data balance. */
export function dataSize(bytes: number, { approximate = true } = {}): string {
  if (bytes === 0) return '0 KB'
  const prefix = approximate ? '~' : ''
  if (bytes < 1024 * 1024) return `${prefix}${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${prefix}${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`
}
