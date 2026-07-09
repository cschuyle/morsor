import { describe, it, expect } from 'vitest'
import {
  normalizeLanguageCodes,
  resolveLanguageCodes,
  resolveLanguagesFromExtra,
} from './languageCodeLookup'

describe('languageCodeLookup', () => {
  it('normalizes array and comma-separated language codes', () => {
    expect(normalizeLanguageCodes(['de', ' en '])).toEqual(['de', 'en'])
    expect(normalizeLanguageCodes('de, en ,es')).toEqual(['de', 'en', 'es'])
  })

  it('resolves known codes and keeps unknown codes', () => {
    const map = new Map([
      ['deu', 'German'],
      ['eng', 'English'],
    ])
    expect(resolveLanguageCodes(['eng', 'deu', 'xyz'], map)).toEqual(['English', 'German', 'xyz'])
  })

  it('resolves base code before region subtag', () => {
    const map = new Map([['eng', 'English']])
    expect(resolveLanguageCodes(['eng-US'], map)).toEqual(['English'])
  })

  it('prefers languages(display) from extra fields', () => {
    expect(
      resolveLanguagesFromExtra(
        { languages: ['de'], 'languages(display)': ['German'] },
        null,
      ),
    ).toBe('German')
  })

  it('falls back to client map when display field is absent', () => {
    const map = new Map([['de', 'German']])
    expect(resolveLanguagesFromExtra({ languages: ['de', 'xyz'] }, map)).toBe('German, xyz')
  })
})
