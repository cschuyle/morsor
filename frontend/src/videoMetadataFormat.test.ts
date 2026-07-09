import { describe, it, expect } from 'vitest'
import { formatVideoBytes, formatVideoDurationSeconds, formatVideoExtraFieldValue, formatIsoTimestamp } from './videoMetadataFormat'

describe('formatVideoDurationSeconds', () => {
  it('rounds to the nearest minute and formats hours', () => {
    expect(formatVideoDurationSeconds(4920)).toBe('1h22m')
    expect(formatVideoDurationSeconds(5760.5)).toBe('1h36m')
    expect(formatVideoDurationSeconds(45)).toBe('1m')
    expect(formatVideoDurationSeconds(89)).toBe('1m')
    expect(formatVideoDurationSeconds(90)).toBe('2m')
  })
})

describe('formatVideoBytes', () => {
  it('formats bytes with b, K, M, G suffixes', () => {
    expect(formatVideoBytes(512)).toBe('512 b')
    expect(formatVideoBytes(1536)).toBe('2 K')
    expect(formatVideoBytes(5 * 1024 * 1024)).toBe('5.0 M')
    expect(formatVideoBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 G')
  })
})

describe('formatIsoTimestamp', () => {
  it('formats Zulu ISO timestamps without T or Z', () => {
    expect(formatIsoTimestamp('2026-07-09T13:17:54Z')).toBe('2026-07-09 13:17:54')
    expect(formatIsoTimestamp('2026-07-08T23:24:47Z')).toBe('2026-07-08 23:24:47')
  })

  it('strips fractional seconds', () => {
    expect(formatIsoTimestamp('2026-07-09T13:17:54.123Z')).toBe('2026-07-09 13:17:54')
  })
})

describe('formatVideoExtraFieldValue', () => {
  it('formats rolled-up totals and per-file arrays', () => {
    expect(formatVideoExtraFieldValue('total_duration_seconds', 180, null)).toBe('3m')
    expect(formatVideoExtraFieldValue('total_size_bytes', 2048, null)).toBe('2 K')
    expect(
      formatVideoExtraFieldValue(
        'files',
        [
          {
            source: 'Disc 1/movie.mkv',
            encoding: 'h264',
            duration_seconds: 120,
            size_bytes: 100,
            subtitles: ['eng'],
          },
        ],
        new Map([['eng', 'English']]),
      ),
    ).toBe('movie.mkv (h264 · 2m · 100 b · English)')
    expect(formatVideoExtraFieldValue('scanned_at', '2026-07-09T13:17:54Z', null)).toBe('2026-07-09 13:17:54')
  })
})
