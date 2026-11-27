/**
 * Diagrams the AI draws as SVG. Only drawing elements and attributes are kept, and the
 * result is shown through an <img>, where SVG can never run scripts or load anything,
 * so a diagram is just a picture whatever the model wrote.
 */

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse',
  'text', 'tspan', 'defs', 'marker', 'title', 'desc',
])

const ATTRIBUTES = new Set([
  'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'opacity', 'transform', 'font-size', 'font-family', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'id', 'marker-start', 'marker-end', 'marker-mid', 'refX', 'refY',
  'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'dx', 'dy', 'xmlns', 'preserveAspectRatio',
])

/** Values that may only point inside the diagram itself, such as url(#arrow). */
const LOCAL_URL = /^url\(#[\w-]+\)$/

function clean(node: Element) {
  for (const child of [...node.children]) {
    if (!ELEMENTS.has(child.localName)) {
      child.remove()
      continue
    }
    for (const attribute of [...child.attributes]) {
      const value = attribute.value.trim()
      const allowed =
        ATTRIBUTES.has(attribute.name) && !/javascript:|data:|https?:/i.test(value) && (!value.startsWith('url(') || LOCAL_URL.test(value))
      if (!allowed) child.removeAttribute(attribute.name)
    }
    clean(child)
  }
}

/**
 * A safe image URL for an SVG diagram from model output, or null if it isn't a usable
 * drawing. Text defaults to a plain sans-serif so labels look the same everywhere.
 */
export function diagramUrl(svg: string): string | null {
  const start = svg.indexOf('<svg')
  const end = svg.lastIndexOf('</svg>')
  if (start === -1 || end === -1) return null
  const doc = new DOMParser().parseFromString(svg.slice(start, end + 6), 'image/svg+xml')
  const root = doc.documentElement
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return null
  for (const attribute of [...root.attributes]) {
    if (!ATTRIBUTES.has(attribute.name)) root.removeAttribute(attribute.name)
  }
  clean(root)
  if (!root.querySelector('path, line, polyline, polygon, rect, circle, ellipse, text')) return null
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!root.getAttribute('viewBox')) {
    const width = Number.parseFloat(root.getAttribute('width') ?? '') || 400
    const height = Number.parseFloat(root.getAttribute('height') ?? '') || 250
    root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  }
  if (!root.getAttribute('font-family')) root.setAttribute('font-family', 'Arial, Helvetica, sans-serif')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`
}
