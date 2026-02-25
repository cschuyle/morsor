import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { SearchResultsGrid } from './SearchResultsGrid'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [troves, setTroves] = useState([])
  const [trove, setTrove] = useState('')
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetch('/actuator/health')
      .then((res) => res.json())
      .then((data) => setMessage(data.status === 'UP' ? 'Backend is up' : `Backend: ${data.status}`))
      .catch(() => setMessage('Backend unreachable'))
  }, [])

  useEffect(() => {
    fetch('/api/troves')
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data) => Array.isArray(data) ? data : [])
      .then(setTroves)
      .catch(() => setTroves([]))
  }, [])

  function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    const params = new URLSearchParams({ query: query.trim() })
    if (trove.trim()) params.set('trove', trove.trim())
    fetch(`/api/search?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(setSearchResult)
      .catch((err) => setSearchError(err.message))
      .finally(() => setSearching(false))
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Morsor</h1>
      {message && <p className="backend-message" data-status={message === 'Backend is up' ? 'up' : 'down'}>{message}</p>}

      <section className="card search-section">
        <h2>Search</h2>
        <form onSubmit={handleSearch}>
          <label>
            Trove (optional)
            <select
              value={trove}
              onChange={(e) => setTrove(e.target.value)}
              className="search-trove-select"
            >
              <option value="">All troves</option>
              {troves.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label>
            Query
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Greek, Prince, Albanian"
            />
          </label>
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchError && <p className="search-error">{searchError}</p>}
        {searchResult != null && (() => {
          const results = Array.isArray(searchResult.results) ? searchResult.results : []
          const count = typeof searchResult.count === 'number' ? searchResult.count : results.length
          return (
            <>
              <p className="search-count">{count} result{count !== 1 ? 's' : ''}</p>
              <SearchResultsGrid data={results} />
            </>
          )
        })()}
      </section>
    </>
  )
}

export default App
