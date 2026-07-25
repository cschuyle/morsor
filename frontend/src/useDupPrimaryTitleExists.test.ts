import { describe, expect, it } from 'vitest'
import { topMatchesFromSearchResult } from './useDupPrimaryTitleExists'
import type { SearchResultData } from './types'

describe('topMatchesFromSearchResult', () => {
  it('returns up to 5 unique hits in API order', () => {
    const data: SearchResultData = {
      count: 3,
      page: 0,
      size: 5,
      results: [
        { title: 'Alien (1979)', trove: 'IMDB Favs', score: 2.1 },
        { title: 'Aliens (1986)', trove: 'IMDB Favs', score: 1.5 },
        { title: 'Alien (1979)', trove: 'IMDB Favs', score: 9 },
      ],
    }
    const top = topMatchesFromSearchResult(data, 5)
    expect(top).toHaveLength(2)
    expect(top[0].title).toBe('Alien (1979)')
    expect(top[0].score).toBe(2.1)
    expect(top[1].title).toBe('Aliens (1986)')
  })

  it('returns empty for missing results', () => {
    expect(topMatchesFromSearchResult(null)).toEqual([])
    expect(topMatchesFromSearchResult({ count: 0, page: 0, size: 5, results: [] })).toEqual([])
  })
})
