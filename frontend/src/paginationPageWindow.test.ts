import { describe, it, expect } from 'vitest'
import { countPaginationNumericButtons, paginationPageWindow } from './paginationPageWindow'

describe('paginationPageWindow', () => {
  it('never exceeds 5 numeric buttons (regression: 6 when 1 + middle window + last)', () => {
    const totalPages = 100
    const max = 5
    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      expect(countPaginationNumericButtons(pageNum, totalPages, max)).toBeLessThanOrEqual(max)
    }
  })

  it('middle window alone is at most max when no bookend shortcuts', () => {
    const { pageNumbers } = paginationPageWindow(2, 20, 5)
    expect(pageNumbers.length).toBeLessThanOrEqual(5)
  })
})
