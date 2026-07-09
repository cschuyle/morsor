/** Strip trailing punctuation often glued to URLs in prose. */
export function trimUrlTrailingPunctuation(raw: string): string {
  return raw.replace(/[.,;:!?)\]}>'"]+$/g, '')
}

/** True when the whole string is an http(s) URL (including paths with spaces). */
export function looksLikeStandaloneHttpUrl(text: string): boolean {
  return /^https?:\/\/.+/i.test(text.trim())
}

/**
 * Encode a URL for href/src attributes. Preserves scheme and already-encoded sequences;
 * encodes literal spaces and other characters that break HTML attributes or requests.
 */
export function normalizeUrlForHref(raw: string): string {
  const s = trimUrlTrailingPunctuation(String(raw ?? '').trim())
  if (!s) {
    return s
  }
  if (/^www\./i.test(s)) {
    return normalizeUrlForHref(`https://${s}`)
  }
  if (!/^https?:\/\//i.test(s)) {
    return s
  }
  // Avoid double-encoding (%20 → %2520) when the URL is already percent-encoded.
  if (/%[0-9A-Fa-f]{2}/.test(s) && !s.includes(' ')) {
    return s
  }
  return encodeURI(s)
}
