/**
 * Keeps opened PDFs on this device (IndexedDB) so they reopen instantly and offline.
 * Small metadata and the heavy file data live in separate stores, so turning a page
 * only rewrites a few bytes. Nothing here leaves the browser.
 */
import type { PageText } from './pdf'

export interface DocumentSummary {
  id: string
  title: string
  fileName: string
  bytes: number
  pageCount: number
  /** Pages that have extractable text. */
  textPages: number
  addedAt: number
  openedAt: number
  lastPage: number
}

export interface DocumentContent {
  id: string
  data: ArrayBuffer
  pages: PageText[]
  /** Extraction version the pages were produced with (see EXTRACT_VERSION). */
  version: number
}

export interface PageSummary {
  /** `${documentId}:${pageNumber}` */
  key: string
  documentId: string
  page: number
  text: string
  source: 'on_device' | 'in_cloud'
  totalMs: number
  /** Estimated mobile data used, in bytes (0 on-device). */
  bytes: number
  createdAt: number
}

const DB_NAME = 'hybrid-study'
const DB_VERSION = 2
const META = 'documents'
const CONTENT = 'documentContent'
const SUMMARIES = 'summaries'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(CONTENT)) db.createObjectStore(CONTENT, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(SUMMARIES)) {
        db.createObjectStore(SUMMARIES, { keyPath: 'key' }).createIndex('documentId', 'documentId')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Let a newer version of the app (in another tab, or after an update) upgrade the database.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })
  return dbPromise
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Stable id from the file contents, so opening the same PDF twice reuses one entry. */
export async function documentId(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function saveDocument(summary: DocumentSummary, content: DocumentContent): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([META, CONTENT], 'readwrite')
  tx.objectStore(META).put(summary)
  tx.objectStore(CONTENT).put(content)
  await done(tx)
}

export async function getDocumentSummary(id: string): Promise<DocumentSummary | undefined> {
  const db = await openDb()
  return promisify(db.transaction(META).objectStore(META).get(id) as IDBRequest<DocumentSummary | undefined>)
}

export async function getContent(id: string): Promise<DocumentContent | undefined> {
  const db = await openDb()
  return promisify(db.transaction(CONTENT).objectStore(CONTENT).get(id) as IDBRequest<DocumentContent | undefined>)
}

/** Recent documents, most recently opened first. */
export async function listDocuments(): Promise<DocumentSummary[]> {
  const db = await openDb()
  const all = await promisify(db.transaction(META).objectStore(META).getAll() as IDBRequest<DocumentSummary[]>)
  return all.sort((a, b) => b.openedAt - a.openedAt)
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([META, CONTENT, SUMMARIES], 'readwrite')
  tx.objectStore(META).delete(id)
  tx.objectStore(CONTENT).delete(id)
  const summaries = tx.objectStore(SUMMARIES)
  const keys = await promisify(summaries.index('documentId').getAllKeys(id))
  keys.forEach((key) => summaries.delete(key))
  await done(tx)
}

/** Records the page the reader is on and when the document was last opened. */
export async function touchDocument(id: string, lastPage: number): Promise<void> {
  const summary = await getDocumentSummary(id)
  if (!summary) return
  const db = await openDb()
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put({ ...summary, lastPage, openedAt: Date.now() })
  await done(tx)
}

function summaryKey(documentId: string, page: number): string {
  return `${documentId}:${page}`
}

export async function getPageSummary(documentId: string, page: number): Promise<PageSummary | undefined> {
  const db = await openDb()
  return promisify(
    db.transaction(SUMMARIES).objectStore(SUMMARIES).get(summaryKey(documentId, page)) as IDBRequest<PageSummary | undefined>,
  )
}

export async function savePageSummary(summary: Omit<PageSummary, 'key'>): Promise<PageSummary> {
  const stored = { ...summary, key: summaryKey(summary.documentId, summary.page) }
  const db = await openDb()
  const tx = db.transaction(SUMMARIES, 'readwrite')
  tx.objectStore(SUMMARIES).put(stored)
  await done(tx)
  return stored
}
