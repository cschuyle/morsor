/**
 * Per-trove local folders via the File System Access API (browser storage only).
 * Browsers block {@code file://} links from http(s) pages; connecting a folder once
 * lets us read files and open them with blob URLs instead.
 */

const DB_NAME = 'morsor.troveDirectoryHandles.v1'
const STORE = 'handles'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

export function directoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function listConnectedTroveIds(): Promise<string[]> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAllKeys()
      req.onsuccess = () => {
        const keys = req.result.filter((k): k is string => typeof k === 'string')
        resolve(keys)
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    })
  } catch {
    return []
  }
}

export async function getDirectoryHandle(troveId: string): Promise<FileSystemDirectoryHandle | null> {
  if (!troveId.trim()) {
    return null
  }
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(troveId)
      req.onsuccess = () => {
        const handle = req.result
        resolve(handle instanceof FileSystemDirectoryHandle ? handle : null)
      }
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    })
  } catch {
    return null
  }
}

export async function saveDirectoryHandle(troveId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, troveId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
  })
}

export async function removeDirectoryHandle(troveId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(troveId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'))
  })
}

export async function chooseDirectoryForTrove(troveId: string): Promise<FileSystemDirectoryHandle | null> {
  if (!directoryPickerSupported()) {
    throw new Error('This browser does not support choosing a local folder.')
  }
  const handle = await window.showDirectoryPicker({ mode: 'read' })
  await saveDirectoryHandle(troveId, handle)
  return handle
}

async function ensureReadPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const current = await handle.queryPermission({ mode: 'read' })
  if (current === 'granted') {
    return true
  }
  const requested = await handle.requestPermission({ mode: 'read' })
  return requested === 'granted'
}

function splitRelativePath(relativePath: string): string[] | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) {
    return null
  }
  return parts.length > 0 ? parts : null
}

export async function resolveFileInDirectory(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File | null> {
  const parts = splitRelativePath(relativePath)
  if (!parts) {
    return null
  }
  let dir = root
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i])
  }
  const fileHandle = await dir.getFileHandle(parts[parts.length - 1]!)
  return fileHandle.getFile()
}

export async function openTroveLocalFile(troveId: string, sourcePath: string): Promise<void> {
  const handle = await getDirectoryHandle(troveId)
  if (!handle) {
    throw new Error('No folder connected for this trove. Use Local directories → Choose folder.')
  }
  if (!(await ensureReadPermission(handle))) {
    throw new Error('Folder access was denied.')
  }
  const file = await resolveFileInDirectory(handle, sourcePath)
  if (!file) {
    throw new Error('File not found under the connected folder.')
  }
  const url = URL.createObjectURL(file)
  try {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
  }
}

export async function connectedFolderLabel(troveId: string): Promise<string | null> {
  const handle = await getDirectoryHandle(troveId)
  return handle?.name ?? null
}
