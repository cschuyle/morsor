import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Trove } from './types'
import {
  chooseDirectoryForTrove,
  connectedFolderLabel,
  directoryPickerSupported,
  listConnectedTroveIds,
  removeDirectoryHandle,
} from './troveDirectoryHandles'
import { fetchTroveDirLinks, setTroveDirLink, deleteTroveDirLink, type TroveDirLink } from './troveDirLinksApi'
import './TroveDirLinksPanel.css'

export interface TroveDirLinksPanelProps {
  troves: Trove[]
  /** Called after a folder is connected or disconnected. */
  onConnectionChange?: () => void
  /** When set, only list these trove ids (still sorted by name). */
  troveFilter?: string
}

export function TroveDirLinksPanel({ troves, onConnectionChange, troveFilter = '' }: TroveDirLinksPanelProps) {
  const [open, setOpen] = useState(false)
  const [connectedIds, setConnectedIds] = useState<Set<string>>(() => new Set())
  const [folderLabels, setFolderLabels] = useState<Record<string, string>>({})
  // DB-backed metadata: troves with a folder configured in *some* browser (maybe this one,
  // maybe not). Advisory only — see troveDirLinksApi.ts.
  const [dbRoots, setDbRoots] = useState<TroveDirLink[]>([])
  const [busyTroveId, setBusyTroveId] = useState<string | null>(null)
  const filterLower = troveFilter.trim().toLowerCase()
  const pickerSupported = directoryPickerSupported()

  const refreshConnections = useCallback(async () => {
    const [ids, roots] = await Promise.all([
      listConnectedTroveIds(),
      fetchTroveDirLinks().catch(() => [] as TroveDirLink[]),
    ])
    const idSet = new Set(ids)
    setConnectedIds(idSet)
    setDbRoots(roots)
    const labels: Record<string, string> = {}
    await Promise.all(
      ids.map(async (id) => {
        labels[id] = (await connectedFolderLabel(id)) ?? id
      }),
    )
    setFolderLabels(labels)
  }, [])

  useEffect(() => {
    if (open) {
      void refreshConnections()
    }
  }, [open, refreshConnections])

  const sortedTroves = useMemo(() => {
    const list = [...troves].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    if (!filterLower) {
      return list
    }
    return list.filter((t) => t.name.toLowerCase().includes(filterLower) || t.id.toLowerCase().includes(filterLower))
  }, [troves, filterLower])

  const connectedCount = connectedIds.size
  const dbRootByTroveId = useMemo(() => {
    const map = new Map<string, TroveDirLink>()
    for (const r of dbRoots) map.set(r.troveId, r)
    return map
  }, [dbRoots])

  async function handleChoose(troveId: string) {
    setBusyTroveId(troveId)
    try {
      const handle = await chooseDirectoryForTrove(troveId)
      if (handle) {
        try {
          await setTroveDirLink(troveId, handle.name)
        } catch {
          // Non-fatal: the folder is connected and usable in this browser even if the
          // shared "configured" metadata didn't make it to the server.
        }
      }
      await refreshConnections()
      onConnectionChange?.()
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        window.alert(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusyTroveId(null)
    }
  }

  async function handleDisconnect(troveId: string) {
    setBusyTroveId(troveId)
    try {
      try {
        await removeDirectoryHandle(troveId)
      } catch {
        // No local handle in this browser — fine, we may only be forgetting the server-side
        // "configured elsewhere" record.
      }
      try {
        await deleteTroveDirLink(troveId)
      } catch {
        // Non-fatal: this browser's disconnect already succeeded either way.
      }
      await refreshConnections()
      onConnectionChange?.()
    } finally {
      setBusyTroveId(null)
    }
  }

  if (troves.length === 0) {
    return null
  }

  return (
    <div className="trove-dir-links-panel">
      <button
        type="button"
        className="trove-dir-links-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Local directories</span>
        <span className="trove-dir-links-toggle-meta">
          {connectedCount > 0 ? `${connectedCount} connected` : 'optional'}
        </span>
        <span className="trove-dir-links-toggle-chevron" aria-hidden="true">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="trove-dir-links-body">
          <p className="trove-dir-links-hint">
            Choose the folder on this machine that matches each trove. Filenames in expanded rows open via a browser
            file handle (not file:// links, which browsers block from web pages).
          </p>
          {!pickerSupported && (
            <p className="trove-dir-links-warning">
              Folder picking is not available in this browser. Use Chrome, Edge, or a recent Safari.
            </p>
          )}
          <ul className="trove-dir-links-list">
            {sortedTroves.map((t) => {
              const connected = connectedIds.has(t.id)
              const dbRoot = dbRootByTroveId.get(t.id)
              const busy = busyTroveId === t.id
              return (
                <li key={t.id} className="trove-dir-links-item">
                  <div className="trove-dir-links-row">
                    <span className="trove-dir-links-name" title={t.id}>{t.name}</span>
                    <span className="trove-dir-links-actions">
                      {connected ? (
                        <>
                          <span className="trove-dir-links-status" title={folderLabels[t.id]}>
                            {folderLabels[t.id] ?? 'Connected'}
                          </span>
                          <button
                            type="button"
                            className="trove-dir-links-btn trove-dir-links-btn--secondary"
                            disabled={busy || !pickerSupported}
                            onClick={() => void handleChoose(t.id)}
                          >
                            Change…
                          </button>
                          <button
                            type="button"
                            className="trove-dir-links-btn trove-dir-links-btn--secondary"
                            disabled={busy}
                            onClick={() => void handleDisconnect(t.id)}
                          >
                            Disconnect
                          </button>
                        </>
                      ) : dbRoot ? (
                        <>
                          <span
                            className="trove-dir-links-status trove-dir-links-status--elsewhere"
                            title={`Configured as "${dbRoot.folderLabel}" in another browser or device — not available here yet.`}
                          >
                            Configured elsewhere: {dbRoot.folderLabel}
                          </span>
                          <button
                            type="button"
                            className="trove-dir-links-btn"
                            disabled={busy || !pickerSupported}
                            onClick={() => void handleChoose(t.id)}
                          >
                            Connect here too…
                          </button>
                          <button
                            type="button"
                            className="trove-dir-links-btn trove-dir-links-btn--secondary"
                            disabled={busy}
                            onClick={() => void handleDisconnect(t.id)}
                          >
                            Forget
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="trove-dir-links-btn"
                          disabled={busy || !pickerSupported}
                          onClick={() => void handleChoose(t.id)}
                        >
                          Choose folder…
                        </button>
                      )}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
