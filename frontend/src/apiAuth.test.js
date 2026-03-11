import { describe, it, expect } from 'vitest'
import { getApiAuthHeaders, getDevApiToken } from './apiAuth'

describe('apiAuth', () => {
  it('does not use the dev token outside Vite dev', () => {
    expect(getDevApiToken({ DEV: false })).toBeNull()
    expect(getApiAuthHeaders({ DEV: false })).toEqual({})
  })

  it('uses the default dev token in Vite dev', () => {
    expect(getDevApiToken({ DEV: true })).toBe('dev-token')
    expect(getApiAuthHeaders({ DEV: true })).toEqual({
      Authorization: 'Bearer dev-token',
    })
  })

  it('uses the overridden dev token in Vite dev', () => {
    expect(getDevApiToken({ DEV: true, VITE_DEV_API_TOKEN: 'custom-token' })).toBe('custom-token')
    expect(getApiAuthHeaders({ DEV: true, VITE_DEV_API_TOKEN: 'custom-token' })).toEqual({
      Authorization: 'Bearer custom-token',
    })
  })
})
