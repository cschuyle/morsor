import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  loadQueryHistory,
  clearQueryHistory,
  historyEntryCacheInfo,
  type QueryHistoryEntry,
} from './queryHistory'
import { formatQueryDurationSeconds, formatQueryReceivedLocal } from './queryResultTiming'
import { APP_VERSION } from './version'
import {
  deleteSavedQuery,
  fetchSavedQueries,
  saveQueryToAccount,
  type SavedQueryDto,
} from './savedQueriesApi'
import './App.css'

function cacheStatusText(apiCacheKey: string): string {
  const { cached, cachedAtMs } = historyEntryCacheInfo(apiCacheKey)
  if (!cached) return 'No'
  return `Yes — ${formatQueryReceivedLocal(cachedAtMs!)}`
}

function defaultSaveLabel(summary: string): string {
  const t = (summary ?? '').trim()
  if (t.length <= 96) return t || 'Saved query'
  return `${t.slice(0, 93)}…`
}

export default function History() {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(() => loadQueryHistory())
  const [tick, setTick] = useState(0)
  const [savedQueries, setSavedQueries] = useState<SavedQueryDto[]>([])
  const [savedLoading, setSavedLoading] = useState(true)
  const [savedError, setSavedError] = useState<string | null>(null)
  const [saveActionError, setSaveActionError] = useState<string | null>(null)
  const [savingHistoryId, setSavingHistoryId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setEntries(loadQueryHistory())
    setTick((n) => n + 1)
  }, [])

  const reloadSaved = useCallback(async () => {
    setSavedError(null)
    setSavedLoading(true)
    try {
      const list = await fetchSavedQueries()
      setSavedQueries(list)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load saved queries'
      setSavedError(msg)
    } finally {
      setSavedLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadSaved()
  }, [reloadSaved])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'morsor.queryHistory.v1') refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const rows = useMemo(() => {
    void tick
    return entries.map((e) => ({
      entry: e,
      cacheLabel: cacheStatusText(e.apiCacheKey),
    }))
  }, [entries, tick])

  async function onSaveFromHistory(e: QueryHistoryEntry) {
    const suggested = defaultSaveLabel(e.summary)
    const raw = window.prompt('Name this saved query (optional)', suggested)
    if (raw === null) return
    setSaveActionError(null)
    setSavingHistoryId(e.id)
    try {
      await saveQueryToAccount({
        consoleQuery: e.consoleQuery,
        mode: e.mode,
        summary: e.summary,
        label: raw.trim(),
      })
      await reloadSaved()
    } catch (err) {
      setSaveActionError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingHistoryId(null)
    }
  }

  async function onRemoveSaved(id: number) {
    if (!window.confirm('Remove this saved query from your account?')) return
    setSaveActionError(null)
    try {
      await deleteSavedQuery(id)
      await reloadSaved()
    } catch (err) {
      setSaveActionError(err instanceof Error ? err.message : 'Remove failed')
    }
  }

  return (
    <>
      <div className="history-page">
        <header className="history-header">
          <h1 className="history-title">Query history</h1>
          <p className="history-lead">
            Recent runs in this browser. <strong>Re-run query</strong> opens the console with the same URL; if the row is still in the in-memory cache (5-minute TTL), results show without a new network request. Use <strong>Save to account</strong> to store a query on the server for this login—it appears below under <em>Saved to your account</em>.
          </p>
          <div className="history-actions">
            <button type="button" className="history-refresh-btn" onClick={refresh}>
              Refresh
            </button>
            {entries.length > 0 && (
              <button
                type="button"
                className="history-clear-btn"
                onClick={() => {
                  clearQueryHistory()
                  refresh()
                }}
              >
                Clear history
              </button>
            )}
            <button type="button" className="history-refresh-btn" onClick={() => reloadSaved()}>
              Refresh saved
            </button>
          </div>
          {saveActionError && <p className="history-inline-error">{saveActionError}</p>}
        </header>

        {entries.length === 0 ? (
          <p className="history-empty">No queries recorded yet. Run a search or compare from the query console.</p>
        ) : (
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">When (local)</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Details</th>
                  <th scope="col">Results</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Cached</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry: e, cacheLabel }) => (
                  <tr key={e.id}>
                    <td className="history-cell-time">{formatQueryReceivedLocal(e.ranAtMs)}</td>
                    <td className="history-cell-summary">{e.summary}</td>
                    <td className="history-cell-detail">
                      <code className="history-detail-code">{e.detail}</code>
                    </td>
                    <td className="history-cell-num">{e.resultCount.toLocaleString()}</td>
                    <td className="history-cell-num">{formatQueryDurationSeconds(e.durationMs)}</td>
                    <td className="history-cell-cache">{cacheLabel}</td>
                    <td className="history-cell-actions">
                      <Link
                        to={{ pathname: '/', search: `?${e.consoleQuery}` }}
                        className="history-rerun-link"
                      >
                        Re-run query
                      </Link>
                      <span className="history-actions-sep" aria-hidden="true">
                        {' · '}
                      </span>
                      <Link to={{ pathname: '/mobile', search: `?${e.consoleQuery}` }} className="app-footer-link">
                        Mobile
                      </Link>
                      <span className="history-actions-sep" aria-hidden="true">
                        {' · '}
                      </span>
                      <button
                        type="button"
                        className="history-save-btn"
                        disabled={savingHistoryId === e.id}
                        onClick={() => onSaveFromHistory(e)}
                      >
                        {savingHistoryId === e.id ? 'Saving…' : 'Save to account'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <section className="history-saved-section" aria-labelledby="history-saved-heading">
          <h2 id="history-saved-heading" className="history-saved-heading">
            Saved to your account
          </h2>
          <p className="history-saved-lead">
            These queries are stored in the database for your current login and persist across browsers and sessions.
          </p>
          {savedLoading && <p className="history-saved-status">Loading…</p>}
          {!savedLoading && savedError && <p className="history-inline-error">{savedError}</p>}
          {!savedLoading && !savedError && savedQueries.length === 0 && (
            <p className="history-empty">No saved queries yet. Use <strong>Save to account</strong> on a row above.</p>
          )}
          {!savedLoading && !savedError && savedQueries.length > 0 && (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th scope="col">Saved (server)</th>
                    <th scope="col">Label</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedQueries.map((s) => (
                    <tr key={s.id}>
                      <td className="history-cell-time">
                        {(() => {
                          const ms = Date.parse(s.createdAt)
                          return Number.isFinite(ms)
                            ? formatQueryReceivedLocal(ms)
                            : s.createdAt
                        })()}
                      </td>
                      <td className="history-cell-summary">{s.label || '—'}</td>
                      <td className="history-cell-detail">
                        {s.summary ? <code className="history-detail-code">{s.summary}</code> : '—'}
                      </td>
                      <td className="history-cell-actions">
                        <Link
                          to={{ pathname: '/', search: `?${s.consoleQuery}` }}
                          className="history-rerun-link"
                        >
                          Re-run query
                        </Link>
                        <span className="history-actions-sep" aria-hidden="true">
                          {' · '}
                        </span>
                        <Link
                          to={{ pathname: '/mobile', search: `?${s.consoleQuery}` }}
                          className="app-footer-link"
                        >
                          Mobile
                        </Link>
                        <span className="history-actions-sep" aria-hidden="true">
                          {' · '}
                        </span>
                        <button
                          type="button"
                          className="history-remove-saved-btn"
                          onClick={() => onRemoveSaved(s.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <span className="app-footer-text">
          GitHub:{' '}
          <a target="_blank" rel="noopener noreferrer" href="https://github.com/cschuyle/morsor">
            https://github.com/cschuyle/morsor
          </a>
          {' · '}
          Version {APP_VERSION}
        </span>
        <Link to="/" className="app-footer-link">
          Query console
        </Link>
        {' · '}
        <Link to="/about" className="app-footer-link">
          About
        </Link>
      </footer>
    </>
  )
}
