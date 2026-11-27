/**
 * Model text with formulas: display formulas typeset on their own line, inline
 * formulas typeset in place, `code`-style formulas and x^2 powers tidied up, and
 * **bold** kept. KaTeX is bundled with the app, so formulas also render offline.
 */
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo, type ReactNode } from 'react'
import { diagramUrl } from '../lib/diagram'

const cache = new Map<string, string | null>()

/** KaTeX HTML for a formula, or null when it isn't valid TeX. */
function typeset(tex: string, displayMode: boolean): string | null {
  const key = `${displayMode ? 'D' : 'I'}${tex}`
  if (cache.has(key)) return cache.get(key) ?? null
  let html: string | null
  try {
    html = katex.renderToString(tex, { displayMode, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml' })
  } catch {
    html = null
  }
  if (cache.size > 500) cache.clear()
  cache.set(key, html)
  return html
}

/**
 * A diagram the AI drew, on a white card like a figure in a textbook. It is shown as an
 * image, so nothing in it can run.
 */
export function Diagram({ svg }: { svg: string }) {
  const url = useMemo(() => diagramUrl(svg), [svg])
  if (!url) {
    return <p className="font-sans text-[0.8rem] text-pencil">The diagram the AI drew could not be shown.</p>
  }
  return (
    <figure className="my-2 overflow-hidden rounded-[6px] border border-rule bg-white p-2">
      <img src={url} alt="Diagram drawn by the AI to illustrate the answer" className="mx-auto block h-auto max-h-[24rem] w-full object-contain" />
    </figure>
  )
}

/** A formula on its own line. Falls back to the raw text if it can't be typeset. */
export function MathBlock({ tex }: { tex: string }) {
  const html = typeset(tex, true)
  if (!html) {
    return <p className="math-fallback overflow-x-auto whitespace-pre-wrap py-1 font-mono text-[0.9em]">{tex}</p>
  }
  return <div className="math-block overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
}

function InlineMath({ tex }: { tex: string }) {
  const html = typeset(tex, false)
  if (!html) return <code className="font-mono text-[0.9em]">{tex}</code>
  return <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Looks like a formula rather than a word or name: worth typesetting. */
function looksLikeFormula(text: string): boolean {
  return /[=^_\\]|\d\s*[×x*/]\s*\d/.test(text) && text.length <= 120
}

const POWER = /([A-Za-z0-9)\]])\^(\{[^}]{1,12}\}|[-+]?\d+(?:\.\d+)?|[A-Za-z])/g

/** Plain text with x^2-style powers shown as superscripts. */
function WithPowers({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(POWER)) {
    const index = match.index ?? 0
    nodes.push(text.slice(last, index) + match[1])
    nodes.push(<sup key={index}>{match[2].replace(/^\{|\}$/g, '')}</sup>)
    last = index + match[0].length
  }
  nodes.push(text.slice(last))
  return <>{nodes}</>
}

const INLINE = /\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$|`([^`\n]+)`|\*\*(.+?)\*\*/g

/** One line of model text, with inline formulas and bold. */
export function Rich({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(<WithPowers key={`t${last}`} text={text.slice(last, index).replace(/\*/g, '')} />)
    const [, paren, dollar, code, bold] = match
    if (paren !== undefined) nodes.push(<InlineMath key={index} tex={paren} />)
    else if (dollar !== undefined) nodes.push(<InlineMath key={index} tex={dollar} />)
    else if (code !== undefined) {
      nodes.push(
        looksLikeFormula(code) ? (
          <InlineMath key={index} tex={code} />
        ) : (
          <code key={index} className="font-mono text-[0.9em]">
            {code}
          </code>
        ),
      )
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={index} className="font-[620]">
          <WithPowers text={bold} />
        </strong>,
      )
    }
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(<WithPowers key={`t${last}`} text={text.slice(last).replace(/\*/g, '')} />)
  return <>{nodes}</>
}
