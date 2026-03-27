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
import './App.css'

function cacheStatusText(apiCacheKey: string): string {
  const { cached, cachedAtMs } = historyEntryCacheInfo(apiCacheKey)
  if (!cached) return 'No'
  return `Yes — ${formatQueryReceivedLocal(cachedAtMs!)}`
}

export default function History() {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>(() => loadQueryHistory())
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => {
    setEntries(loadQueryHistory())
    setTick((n) => n + 1)
  }, [])

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

  return (
    <>
      <div className="history-page">
        <header className="history-header">
          <h1 className="history-title">Query history</h1>
          <p className="history-lead">
            Recent searches, duplicate checks, and uniques runs from this browser. Open a row to replay the same console URL.
            Cache status reflects the in-memory result cache (5-minute TTL).
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
          </div>
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
                  <th scope="col">Open</th>
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
                    <td className="history-cell-open">
                      <Link to={{ pathname: '/', search: `?${e.consoleQuery}` }} className="app-footer-link">
                        Desktop
                      </Link>
                      {' · '}
                      <Link to={{ pathname: '/mobile', search: `?${e.consoleQuery}` }} className="app-footer-link">
                        Mobile
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
