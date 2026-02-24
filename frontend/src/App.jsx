import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import { SearchResultsGrid } from './SearchResultsGrid'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('')
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

  function handleSearch(e) {
    e?.preventDefault()
    if (!trove.trim() || !query.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    const params = new URLSearchParams({ trove: trove.trim(), query: query.trim() })
    fetch(`/search?${params}`)
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
            Trove
            <input
              type="text"
              value={trove}
              onChange={(e) => setTrove(e.target.value)}
              placeholder="e.g. newspaper"
            />
          </label>
          <label>
            Query
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms"
            />
          </label>
          <button type="submit" disabled={searching || !trove.trim() || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchError && <p className="search-error">{searchError}</p>}
        {searchResult != null && <SearchResultsGrid data={searchResult} />}
      </section>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>
    </>
  )
}

export default App
