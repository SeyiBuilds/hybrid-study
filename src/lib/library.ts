/**
 * Keeps opened PDFs on this device (IndexedDB) so they reopen instantly and offline.
 * Small metadata and the heavy file data live in separate stores, so turning a page
 * only rewrites a few bytes. Nothing here leaves the browser.
 */
import type { PageText } from './pdf'
import type { Exam } from '../ai/examFormat'
import type { QuizLevel, QuizQuestion } from '../ai/quiz'

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
  /** True once the student has edited the AI's text. */
  edited?: boolean
}

export type HighlightColor = 'yellow' | 'green' | 'pink'

/** A rectangle on the page, as fractions (0 to 1) of the page width and height. */
export interface HighlightRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Highlight {
  id: string
  documentId: string
  page: number
  color: HighlightColor
  /** The highlighted words, as selected. */
  text: string
  rects: HighlightRect[]
  note: string
  createdAt: number
  updatedAt: number
}

export interface PageNote {
  /** `${documentId}:${pageNumber}` */
  key: string
  documentId: string
  page: number
  text: string
  updatedAt: number
}

export interface PageQuiz {
  /** `${documentId}:${pageNumber}`: one current quiz per page. */
  key: string
  documentId: string
  page: number
  questions: QuizQuestion[]
  /** The option chosen for each question, or null if unanswered. */
  answers: Array<number | null>
  checkedAt: number | null
  score: number | null
  /** The difficulty the questions were written at (older quizzes: not recorded). */
  level?: QuizLevel
  /** Every marked attempt at these questions. */
  scores: number[]
  source: 'on_device' | 'in_cloud'
  totalMs: number
  bytes: number
  createdAt: number
  updatedAt: number
}

export interface PageAnswer {
  id: string
  documentId: string
  page: number
  question: string
  /** The highlighted words the question was about, if any. */
  quote?: string
  text: string
  source: 'on_device' | 'in_cloud'
  totalMs: number
  bytes: number
  createdAt: number
}

/** Past exam questions for a course, read from a PDF the student added. */
export interface PastQuestions {
  documentId: string
  fileName: string
  pages: number
  text: string
  addedAt: number
}

const DB_NAME = 'hybrid-study'
const DB_VERSION = 5
const META = 'documents'
const CONTENT = 'documentContent'
const SUMMARIES = 'summaries'
const HIGHLIGHTS = 'highlights'
const NOTES = 'notes'
const ANSWERS = 'answers'
const QUIZZES = 'quizzes'
const EXAMS = 'exams'
const PAST = 'pastQuestions'
/** Stores holding per-page study material, each indexed by documentId and docPage. */
const PAGE_STORES = [SUMMARIES, HIGHLIGHTS, NOTES, ANSWERS, QUIZZES]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(CONTENT)) db.createObjectStore(CONTENT, { keyPath: 'id' })
      const tx = request.transaction!
      const ensure = (name: string, keyPath: string) => {
        const store = db.objectStoreNames.contains(name) ? tx.objectStore(name) : db.createObjectStore(name, { keyPath })
        if (!store.indexNames.contains('documentId')) store.createIndex('documentId', 'documentId')
        if (!store.indexNames.contains('docPage')) store.createIndex('docPage', ['documentId', 'page'])
      }
      ensure(SUMMARIES, 'key')
      ensure(HIGHLIGHTS, 'id')
      ensure(NOTES, 'key')
      ensure(ANSWERS, 'id')
      ensure(QUIZZES, 'key')
      if (!db.objectStoreNames.contains(EXAMS)) db.createObjectStore(EXAMS, { keyPath: 'id' }).createIndex('documentId', 'documentId')
      if (!db.objectStoreNames.contains(PAST)) db.createObjectStore(PAST, { keyPath: 'documentId' })
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

/** Removes a document and everything written about it (summaries, highlights, notes, answers). */
export async function deleteDocument(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([META, CONTENT, PAST, ...PAGE_STORES, EXAMS], 'readwrite')
  tx.objectStore(META).delete(id)
  tx.objectStore(CONTENT).delete(id)
  tx.objectStore(PAST).delete(id)
  for (const name of [...PAGE_STORES, EXAMS]) {
    const store = tx.objectStore(name)
    store.index('documentId').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursor | null>).result
      if (!cursor) return
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  }
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

async function put<T>(storeName: string, value: T): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).put(value)
  await done(tx)
  return value
}

async function remove(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(key)
  await done(tx)
}

async function forPage<T>(storeName: string, documentId: string, page: number): Promise<T[]> {
  const db = await openDb()
  const index = db.transaction(storeName).objectStore(storeName).index('docPage')
  return promisify(index.getAll([documentId, page]) as IDBRequest<T[]>)
}

export async function listHighlights(documentId: string, page: number): Promise<Highlight[]> {
  const all = await forPage<Highlight>(HIGHLIGHTS, documentId, page)
  return all.sort((a, b) => (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0) || (a.rects[0]?.x ?? 0) - (b.rects[0]?.x ?? 0))
}

export function saveHighlight(highlight: Highlight): Promise<Highlight> {
  return put(HIGHLIGHTS, highlight)
}

export function deleteHighlight(id: string): Promise<void> {
  return remove(HIGHLIGHTS, id)
}

export async function getNote(documentId: string, page: number): Promise<PageNote | undefined> {
  const db = await openDb()
  return promisify(
    db.transaction(NOTES).objectStore(NOTES).get(summaryKey(documentId, page)) as IDBRequest<PageNote | undefined>,
  )
}

export function saveNote(documentId: string, page: number, text: string): Promise<PageNote> {
  return put(NOTES, { key: summaryKey(documentId, page), documentId, page, text, updatedAt: Date.now() })
}

export async function getPageQuiz(documentId: string, page: number): Promise<PageQuiz | undefined> {
  const db = await openDb()
  return promisify(
    db.transaction(QUIZZES).objectStore(QUIZZES).get(summaryKey(documentId, page)) as IDBRequest<PageQuiz | undefined>,
  )
}

export function savePageQuiz(quiz: Omit<PageQuiz, 'key'>): Promise<PageQuiz> {
  return put(QUIZZES, { ...quiz, key: summaryKey(quiz.documentId, quiz.page) })
}

export async function listAnswers(documentId: string, page: number): Promise<PageAnswer[]> {
  const all = await forPage<PageAnswer>(ANSWERS, documentId, page)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export function saveAnswer(answer: PageAnswer): Promise<PageAnswer> {
  return put(ANSWERS, answer)
}

export function deleteAnswer(id: string): Promise<void> {
  return remove(ANSWERS, id)
}

export function saveExam(exam: Exam): Promise<Exam> {
  return put(EXAMS, exam)
}

export async function getExam(id: string): Promise<Exam | undefined> {
  const db = await openDb()
  return promisify(db.transaction(EXAMS).objectStore(EXAMS).get(id) as IDBRequest<Exam | undefined>)
}

/** Exams on a document, newest first. */
export async function listExams(documentId: string): Promise<Exam[]> {
  const db = await openDb()
  const all = await promisify(
    db.transaction(EXAMS).objectStore(EXAMS).index('documentId').getAll(documentId) as IDBRequest<Exam[]>,
  )
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteExam(id: string): Promise<void> {
  return remove(EXAMS, id)
}

export async function getPastQuestions(documentId: string): Promise<PastQuestions | undefined> {
  const db = await openDb()
  return promisify(db.transaction(PAST).objectStore(PAST).get(documentId) as IDBRequest<PastQuestions | undefined>)
}

export function savePastQuestions(past: PastQuestions): Promise<PastQuestions> {
  return put(PAST, past)
}

export function deletePastQuestions(documentId: string): Promise<void> {
  return remove(PAST, documentId)
}
