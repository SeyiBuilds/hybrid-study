import { useEffect, useState } from 'react'

export type Route =
  | { name: 'library' }
  | { name: 'reader'; id: string; page: number | null }
  | { name: 'diagnostics' }

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  if (path === 'diagnostics') return { name: 'diagnostics' }
  const reader = path.match(/^doc\/([a-f0-9]+)(?:\/(\d+))?$/)
  if (reader) return { name: 'reader', id: reader[1], page: reader[2] ? Number(reader[2]) : null }
  return { name: 'library' }
}

export const routes = {
  library: '#/',
  diagnostics: '#/diagnostics',
  reader: (id: string, page?: number) => (page ? `#/doc/${id}/${page}` : `#/doc/${id}`),
}

/** Tiny hash router: works on static hosting and offline without server rewrites. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(hash: string, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}
