/** At most `maxPageButtons` numeric page buttons, including optional leading 1 / trailing last page with ellipses. */
export function paginationPageWindow(
  pageNum: number,
  totalPages: number,
  maxPageButtons: number,
): { start: number; end: number; pageNumbers: number[] } {
  if (totalPages <= 0) {
    return { start: 0, end: 0, pageNumbers: [] }
  }
  if (totalPages <= maxPageButtons) {
    const pageNumbers: number[] = []
    for (let i = 0; i < totalPages; i++) {
      pageNumbers.push(i)
    }
    return { start: 0, end: totalPages, pageNumbers }
  }
  let w = maxPageButtons
  let start = 0
  let end = totalPages
  while (w >= 1) {
    start = Math.max(0, pageNum - Math.floor(w / 2))
    end = Math.min(totalPages, start + w)
    if (end - start < w) {
      start = Math.max(0, end - w)
    }
    const showFirst = start > 0
    const showLast = end < totalPages
    if (w + (showFirst ? 1 : 0) + (showLast ? 1 : 0) <= maxPageButtons) {
      const pageNumbers: number[] = []
      for (let i = start; i < end; i++) {
        pageNumbers.push(i)
      }
      return { start, end, pageNumbers }
    }
    w -= 1
  }
  start = Math.min(Math.max(0, pageNum), totalPages - 1)
  end = start + 1
  return { start, end, pageNumbers: [start] }
}

/** Count how many numeric page buttons the UI renders for a window (matches App.tsx markup). */
export function countPaginationNumericButtons(
  pageNum: number,
  totalPages: number,
  maxPageButtons: number,
): number {
  const { start, end, pageNumbers } = paginationPageWindow(pageNum, totalPages, maxPageButtons)
  let n = pageNumbers.length
  if (start > 0) {
    n += 1
  }
  if (end < totalPages) {
    n += 1
  }
  return n
}
