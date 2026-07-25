import { describe, expect, it } from 'vitest'
import {
  normalizeDynamicTroveItemTitle,
  resultsIncludeExactNormalizedTitle,
} from './normalizeDynamicTroveItemTitle'

describe('normalizeDynamicTroveItemTitle', () => {
  it('trims, collapses whitespace, and lower-cases', () => {
    expect(normalizeDynamicTroveItemTitle('  Hello   World  ')).toBe('hello world')
  })

  it('keeps punctuation', () => {
    expect(normalizeDynamicTroveItemTitle('Hello, World!')).toBe('hello, world!')
  })
})

describe('resultsIncludeExactNormalizedTitle', () => {
  it('matches on normalized equality only', () => {
    const results = [{ title: 'Alien' }, { title: 'Alien Nation' }]
    expect(resultsIncludeExactNormalizedTitle(results, '  ALIEN  ')).toBe(true)
    expect(resultsIncludeExactNormalizedTitle(results, 'Alien N')).toBe(false)
  })

  it('returns false for empty or blank query', () => {
    expect(resultsIncludeExactNormalizedTitle([{ title: 'x' }], '   ')).toBe(false)
  })
})
