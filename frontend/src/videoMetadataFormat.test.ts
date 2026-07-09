import { describe, it, expect } from 'vitest'
import {
  formatVideoBytes,
  formatVideoDurationSeconds,
  formatVideoExtraFieldValue,
  formatIsoTimestamp,
  formatVideoFileSummaryLine,
  formatVideoResolution,
  videoFileSummarySuffix,
  videoMetadataFilesFromExtra,
  videoMetadataFilesFromRow,
  expandableFilesFromRow,
  urlFileBasename,
} from './videoMetadataFormat'

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
  it('formats bytes with bytes, K, MB, GB, TB suffixes', () => {
    expect(formatVideoBytes(512)).toBe('512 bytes')
    expect(formatVideoBytes(1536)).toBe('2 K')
    expect(formatVideoBytes(5 * 1024 * 1024)).toBe('5.0MB')
    expect(formatVideoBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5GB')
    expect(formatVideoBytes(3 * 1024 * 1024 * 1024 * 1024)).toBe('3.0TB')
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

describe('videoFileSummarySuffix', () => {
  it('returns the comma-prefixed tail after the filename', () => {
    expect(
      videoFileSummarySuffix({
        source: 'movie.mkv',
        duration_seconds: 120,
        size_bytes: 100,
      }),
    ).toBe(', 2m, 100 bytes')
  })
})

describe('formatVideoFileSummaryLine', () => {
  it('uses the filename and comma-separated duration, resolution, and size', () => {
    expect(
      formatVideoFileSummaryLine({
        source: '/movies/Disc 1/feature.mkv',
        duration_seconds: 9900,
        resolution: { width: 1920, height: 1080 },
        size_bytes: 5 * 1024 * 1024,
      }),
    ).toBe('feature.mkv, 2h45m, 1920x1080, 5.0MB')
  })
})

describe('formatVideoResolution', () => {
  it('formats width and height', () => {
    expect(formatVideoResolution({ width: 1280, height: 720 })).toBe('1280x720')
  })
})

describe('expandableFilesFromRow', () => {
  it('returns URL strings from row.files for troves like Little Prince', () => {
    const files = expandableFilesFromRow(
      {
        files: [
          'https://example.com/public/little-prince-ebooks/Spanish-08-El-Principito.pdf',
        ],
      },
      null,
    )
    expect(files).toEqual([
      { kind: 'url', url: 'https://example.com/public/little-prince-ebooks/Spanish-08-El-Principito.pdf' },
    ])
  })

  it('prefers video metadata objects over row.files URL strings', () => {
    const files = expandableFilesFromRow(
      { files: ['https://example.com/ignored.pdf'] },
      {
        files: [{ source: 'Disc 1/movie.mkv', duration_seconds: 120 }],
      },
    )
    expect(files).toHaveLength(1)
    expect(files[0].kind).toBe('metadata')
    if (files[0].kind === 'metadata') {
      expect(files[0].file.source).toBe('Disc 1/movie.mkv')
    }
  })

  it('falls back to raw source JSON for URL file arrays', () => {
    expect(expandableFilesFromRow(null, null)).toEqual([])

    const fromRaw = expandableFilesFromRow(
      {
        rawSourceItem: {
          littlePrinceItem: {
            title: 'Example',
            files: ['https://example.com/book.pdf'],
          },
        },
      },
      null,
    )
    expect(fromRaw).toEqual([{ kind: 'url', url: 'https://example.com/book.pdf' }])
  })
})

describe('urlFileBasename', () => {
  it('extracts filename from URL paths', () => {
    expect(urlFileBasename('https://example.com/path/my book.pdf?download=1')).toBe('my book.pdf')
  })
})

describe('videoMetadataFilesFromRow', () => {
  it('falls back to raw source JSON when extraFields lacks files', () => {
    const files = videoMetadataFilesFromRow(null, {
      video: {
        title: 'Example',
        files: [
          { source: 'Disc 1/movie.mkv', duration_seconds: 120 },
        ],
      },
    })
    expect(files).toHaveLength(1)
    expect(files[0].source).toBe('Disc 1/movie.mkv')
  })
})

describe('videoMetadataFilesFromExtra', () => {
  it('returns only object entries with a source field', () => {
    const files = videoMetadataFilesFromExtra({
      files: [
        { source: 'a.mkv', duration_seconds: 60 },
        'https://example.com/b.pdf',
      ],
    })
    expect(files).toHaveLength(1)
    expect(files[0].source).toBe('a.mkv')
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
    ).toBe('movie.mkv (h264 · 2m · 100 bytes · English)')
    expect(formatVideoExtraFieldValue('scanned_at', '2026-07-09T13:17:54Z', null)).toBe('2026-07-09 13:17:54')
  })
})
