import { describe, it, expect } from 'vitest'
import {
  looksLikeStandaloneHttpUrl,
  normalizeUrlForHref,
  trimUrlTrailingPunctuation,
} from './urlUtils'

describe('normalizeUrlForHref', () => {
  it('encodes spaces and special characters in http(s) paths', () => {
    expect(
      normalizeUrlForHref(
        'https://moocho-test.s3-us-west-2.amazonaws.com/public/little-prince/images/150/little prince cantonese back.png',
      ),
    ).toBe(
      'https://moocho-test.s3-us-west-2.amazonaws.com/public/little-prince/images/150/little%20prince%20cantonese%20back.png',
    )
    expect(
      normalizeUrlForHref(
        'https://moocho-test.s3-us-west-2.amazonaws.com/public/little-prince/images/150/little prince - Croatian PP-7711.gif',
      ),
    ).toBe(
      'https://moocho-test.s3-us-west-2.amazonaws.com/public/little-prince/images/150/little%20prince%20-%20Croatian%20PP-7711.gif',
    )
    expect(
      normalizeUrlForHref(
        'https://moocho-test.s3-us-west-2.amazonaws.com/public/little-prince/images/150/little prince - Hungarian rovasiras szekely runes cover, photo.png',
      ),
    ).toContain('cover,%20photo.png')
  })

  it('leaves already-encoded URLs unchanged', () => {
    const encoded =
      'https://example.com/little%20prince%20-%20Croatian%20PP-7711.gif'
    expect(normalizeUrlForHref(encoded)).toBe(encoded)
  })

  it('adds https for www. URLs and strips trailing punctuation', () => {
    expect(normalizeUrlForHref('www.example.com/foo bar.')).toBe(
      'https://www.example.com/foo%20bar',
    )
  })

  it('returns non-http strings unchanged', () => {
    expect(normalizeUrlForHref('little prince cover.png')).toBe(
      'little prince cover.png',
    )
  })
})

describe('looksLikeStandaloneHttpUrl', () => {
  it('matches full http(s) URLs including those with spaces', () => {
    expect(
      looksLikeStandaloneHttpUrl(
        'https://example.com/little prince - Croatian PP-7711.gif',
      ),
    ).toBe(true)
    expect(looksLikeStandaloneHttpUrl('not a url')).toBe(false)
  })
})

describe('trimUrlTrailingPunctuation', () => {
  it('removes trailing punctuation from URL tokens', () => {
    expect(trimUrlTrailingPunctuation('https://example.com/foo.')).toBe(
      'https://example.com/foo',
    )
  })
})
