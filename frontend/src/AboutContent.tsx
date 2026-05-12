/**
 * Shared About page content. Used by both desktop (About) and mobile (MobileAbout).
 * Layout and styling are handled by the parent; this component is content-only.
 */
import { useState } from 'react'
import { Trove } from './types'

export default function AboutContent({ uploadTimestamp, troves }: { uploadTimestamp?: string | null; troves?: Trove[] }) {
  const [sortColumn, setSortColumn] = useState<'name' | 'timestamp'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function formatTimestamp(ts: string): string {
    try {
      // Parse ISO 8601 format or other common formats
      const date = new Date(ts)
      if (isNaN(date.getTime())) {
        return ts
      }
      // Format as "2006-05-16 19:57"
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    } catch {
      return ts
    }
  }

  function handleColumnSort(column: 'name' | 'timestamp') {
    if (sortColumn === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDir('asc')
    }
  }

  function getSortedTroves(): Trove[] {
    if (!troves || troves.length === 0) return []
    const sorted = [...troves].sort((a, b) => {
      let aVal: string
      let bVal: string
      if (sortColumn === 'name') {
        aVal = a.name || ''
        bVal = b.name || ''
      } else {
        aVal = a.updateTimestamp || ''
        bVal = b.updateTimestamp || ''
      }
      const cmp = aVal.localeCompare(bVal)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }

  function SortIndicator({ column }: { column: 'name' | 'timestamp' }) {
    if (sortColumn !== column) return <span className="sort-indicator-none"> ⇅</span>
    return <span className="sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  return (
    <>
      <h1>Morsor</h1>
      <p>A list of lists navigator</p>
      {uploadTimestamp && (
        <p className="upload-timestamp">
          Data last updated: {formatTimestamp(uploadTimestamp)}
        </p>
      )}
      <h2>Why?</h2>
      <p>
        The REAL goal: Vibe-code the whole thing. This is an experiment: 99.999% vibe-coding a nontrivial app from scratch.
      </p>
      <p>But, as for what the app <i>does</i>:</p>
      <p>
        I&apos;m a list-maker. I have a few dozen lists which I want to be able to easily browse, search
        and do some analysis on. List items could be books, movies, products, etc. They can have media and web links
        associated with them, and can be linked to items in other lists. For example:

        <ul>
          <li>Books are written in one or more languages,
        and there's a list of languages. Languages in turn have relationships to geographies, and other languages.
          </li>

          <li>Movies are often available on streaming services, and there&apos;s a list of streaming services.
          </li>
        </ul>

        You get the picture. It&apos;s not just lists. It's about relationships, so it's more like a graph. And that's what Morsor&apos;s for.

      </p>
      <h2>Features</h2>
      <ul>
        <li>Search all troves (that&apos;s what I call a list), or a subset of troves.</li>
        <li>Display media (documents, images, videos, audio) and links (URLs) for retrieved trove items.</li>
        <li>
          Find duplicate items (or, near-duplicates) across troves.
          <ul>
            <li>
              Example: I&apos;ve got a couple troves: a list of movie favorites, and a list of
              movies which are available on Kanopy. Find stuff I like which is available on Kanopy.
            </li>
          </ul>
        </li>
        <li>
          Conversely, find unique items within a trove, with respect to other troves.
          <ul>
            <li>
              Example: Same troves as the previous example. Find movies which I like but which
              I can&apos;t get on Kanopy. Then I can rent or buy those movies instead of getting
              them for free on Kanopy.
            </li>
          </ul>
        </li>
      </ul>
      <h2>Where do I get the data?</h2>
      <p>That&apos;s another story. Short answer: scripts and manual slogging.</p>
      <h2>What&apos;s with the name?</h2>
      <ul>
        <li>This is a re-write of a previous app I built, called Moocho.me.</li>
        <li>I like Walruses.</li>
        <li>I speak Spanish.</li>
        <li>Morsa is Walrus in Spanish.</li>
        <li>Moocho and Morsa both start with M.</li>
        <li>I used Cursor for this.</li>
        <li>Morsa + Cursor = Morsor.</li>
        <li>I like Lord of the Rings. If you do too you know what Mordor is.</li>
        <li>There is a distance of 1 between Mordor and Morsor in two pretty basic measurements, which is not super relevant but I think it's neato:</li>
        <ul>
          <li>Levenshtein</li>
          <li>Between keys on most keyboards</li>
        </ul>
      </ul>
      <h2>Troves</h2>
      {troves && troves.length > 0 ? (
        <table className="about-troves-table">
          <thead>
            <tr>
              <th className="sortable-header" onClick={() => handleColumnSort('name')}>
                Trove <SortIndicator column="name" />
              </th>
              <th className="sortable-header" onClick={() => handleColumnSort('timestamp')}>
                Last Updated <SortIndicator column="timestamp" />
              </th>
            </tr>
          </thead>
          <tbody>
            {getSortedTroves().map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.updateTimestamp ? formatTimestamp(t.updateTimestamp) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No troves available.</p>
      )}
    </>
  )
}
