import { describe, it, expect } from 'vitest'

function splitRelativePath(relativePath: string): string[] | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((p) => p === '.' || p === '..')) {
    return null
  }
  return parts.length > 0 ? parts : null
}

describe('splitRelativePath', () => {
  it('splits nested source paths', () => {
    expect(splitRelativePath('Arthur Christmas (2011)/Arthur Christmas-A1_t01 1.mp4')).toEqual([
      'Arthur Christmas (2011)',
      'Arthur Christmas-A1_t01 1.mp4',
    ])
  })

  it('rejects parent segments', () => {
    expect(splitRelativePath('../secret.mkv')).toBeNull()
  })
})
