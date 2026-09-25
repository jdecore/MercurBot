/**
 * IndexedDB wrapper for persistent preferences.
 * localStorage is fragile (Clear Site Data, quota limits).
 * IndexedDB survives most browser data clears and has larger quotas.
 */

const DB_NAME = 'mercurbot'
const DB_VERSION = 1
const STORE_NAME = 'preferences'

let dbPromise: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return Promise.resolve(dbPromise)

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    req.onsuccess = () => {
      dbPromise = req.result
      resolve(req.result)
    }

    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    /* ignore — fallback to localStorage in caller */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {
    /* ignore */
  }
}

/**
 * Migrate a localStorage key to IndexedDB.
 * Reads from localStorage, writes to IDB, removes from localStorage.
 */
export async function migrateToIDB<T>(key: string): Promise<T | null> {
  try {
    // Check if already in IDB
    const existing = await idbGet<T>(key)
    if (existing !== null) return existing

    // Read from localStorage
    const raw = localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as T

    // Write to IDB
    await idbSet(key, parsed)

    // Remove from localStorage (clean up)
    localStorage.removeItem(key)

    return parsed
  } catch {
    return null
  }
}
