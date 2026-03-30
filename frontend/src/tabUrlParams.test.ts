import { describe, expect, it } from 'vitest'
import { deserializeActiveTabFromUrl, parseFileTypesQueryValues } from './tabUrlParams'
import type { Trove } from './types'

describe('parseFileTypesQueryValues', () => {
  it('splits comma-separated values like /api/search', () => {
    expect(parseFileTypesQueryValues(['MP4', 'PDF'])).toEqual(['MP4', 'PDF'])
    expect(parseFileTypesQueryValues(['MP4,MOV', 'PDF'])).toEqual(['MP4', 'MOV', 'PDF'])
    expect(parseFileTypesQueryValues(['MP4, PDF '])).toEqual(['MP4', 'PDF'])
  })

  it('maps URL to Link', () => {
    expect(parseFileTypesQueryValues(['URL', 'PDF,URL'])).toEqual(['Link', 'PDF', 'Link'])
  })

  it('uppercases extensions to match dropdown / backend', () => {
    expect(parseFileTypesQueryValues(['mp4'])).toEqual(['MP4'])
    expect(parseFileTypesQueryValues(['Mp4,pdf'])).toEqual(['MP4', 'PDF'])
  })

  it('ignores empty segments', () => {
    expect(parseFileTypesQueryValues(['MP4,,PDF', ''])).toEqual(['MP4', 'PDF'])
  })
})

describe('deserializeActiveTabFromUrl fileTypes', () => {
  const troves: Trove[] = []
  const urlTroveId = () => null

  it('parses comma-separated fileTypes in one query value', () => {
    const params = new URLSearchParams()
    params.set('q', 'x')
    params.set('fileTypes', 'MP4,MOV')
    const u = deserializeActiveTabFromUrl(params, troves, urlTroveId)
    expect(u.mode).toBe('search')
    expect(u.fileTypeFilters).toEqual(['MP4', 'MOV'])
  })
})
