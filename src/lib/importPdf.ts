import { documentId, getSummary, saveDocument, touchDocument } from './library'
import { closePdf, extractPages, hasUsableText, openPdf } from './pdf'

export type ImportProgress =
  | { stage: 'reading' }
  | { stage: 'extracting'; done: number; total: number }
  | { stage: 'saving' }

/** Upper limit that keeps extraction and storage comfortable on a modest laptop. */
export const MAX_PDF_BYTES = 60 * 1024 * 1024

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

function titleFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim() || 'Untitled document'
}

/**
 * Reads a PDF file, extracts the text of every page and stores both on this device.
 * Returns the document id. Opening a file that is already in the library just reopens it.
 */
export async function importPdf(file: File, onProgress: (progress: ImportProgress) => void): Promise<string> {
  const looksLikePdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!looksLikePdf) throw new ImportError(`${file.name} is not a PDF. Choose a .pdf file.`)
  if (file.size > MAX_PDF_BYTES) {
    throw new ImportError(`${file.name} is larger than 60 MB. Split it into smaller parts and open those.`)
  }

  onProgress({ stage: 'reading' })
  const data = await file.arrayBuffer()
  const id = await documentId(data)

  const existing = await getSummary(id)
  if (existing) {
    await touchDocument(id, existing.lastPage)
    return id
  }

  let pdf
  try {
    pdf = await openPdf(data)
  } catch (error) {
    const name = (error as { name?: string }).name
    if (name === 'PasswordException') throw new ImportError(`${file.name} is password-protected. Remove the password and try again.`)
    throw new ImportError(`${file.name} could not be read as a PDF. It may be damaged.`)
  }

  try {
    const pages = await extractPages(pdf, (done, total) => onProgress({ stage: 'extracting', done, total }))
    const title = titleFromFileName(file.name)
    onProgress({ stage: 'saving' })
    const now = Date.now()
    await saveDocument(
      {
        id,
        title,
        fileName: file.name,
        bytes: file.size,
        pageCount: pdf.numPages,
        textPages: pages.filter(hasUsableText).length,
        addedAt: now,
        openedAt: now,
        lastPage: 1,
      },
      { id, data, pages },
    )
    return id
  } finally {
    void closePdf(pdf)
  }
}
