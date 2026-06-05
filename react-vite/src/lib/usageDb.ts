import type { CodexUsageInfo, TokenUsageSummary } from './types'

const DB_NAME = 'codex-switcher-usage'
const DB_VERSION = 1
const USAGE_STORE = 'usageByAccount'
const META_STORE = 'meta'
const TOKEN_KEY = 'tokenUsage'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(USAGE_STORE)) db.createObjectStore(USAGE_STORE)
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function txStore(db: IDBDatabase, name: string, mode: IDBTransactionMode) {
  return db.transaction(name, mode).objectStore(name)
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getCachedUsages(): Promise<CodexUsageInfo[]> {
  try {
    const db = await openDb()
    return await requestToPromise(txStore(db, USAGE_STORE, 'readonly').getAll()) as CodexUsageInfo[]
  } catch {
    return []
  }
}

export async function saveUsage(usage: CodexUsageInfo): Promise<void> {
  try {
    const db = await openDb()
    await requestToPromise(txStore(db, USAGE_STORE, 'readwrite').put(usage, usage.accountName))
  } catch {
    // Cache failures must not affect live usage refresh.
  }
}

export async function saveUsages(usages: CodexUsageInfo[]): Promise<void> {
  await Promise.all(usages.map(saveUsage))
}

export async function getCachedTokenUsage(): Promise<TokenUsageSummary | null> {
  try {
    const db = await openDb()
    return (await requestToPromise(txStore(db, META_STORE, 'readonly').get(TOKEN_KEY))) as TokenUsageSummary | undefined ?? null
  } catch {
    return null
  }
}

export async function saveTokenUsage(summary: TokenUsageSummary): Promise<void> {
  try {
    const db = await openDb()
    await requestToPromise(txStore(db, META_STORE, 'readwrite').put(summary, TOKEN_KEY))
  } catch {
    // Cache failures must not affect token statistics.
  }
}
