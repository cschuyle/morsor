import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performLogout } from './performLogout'

describe('performLogout', () => {
  beforeEach(() => {
    document.cookie = 'XSRF-TOKEN=test-token; path=/'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'
  })

  it('logs out successfully on the first attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await performLogout()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-XSRF-TOKEN': 'test-token',
      }),
    }))
  })

  it('refreshes CSRF and retries once after a forbidden response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockImplementationOnce(async () => {
        document.cookie = 'XSRF-TOKEN=fresh-token; path=/'
        return { ok: true, status: 200 }
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await performLogout()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/status', { credentials: 'include' })
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/logout', expect.anything())
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({
        'X-XSRF-TOKEN': 'fresh-token',
      }),
    }))
  })

  it('throws when logout still fails after retry', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetchMock)

    await expect(performLogout()).rejects.toThrow('Logout failed with status 403')
  })
})
