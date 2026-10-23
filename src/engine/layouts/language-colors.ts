import type { Scan } from '@/lib/types/scan'

/**
 * Language → palette index (c1..c5), shared by the Files (per-file dot
 * color) and Languages (stacked bar) layouts so a language never changes
 * color between views. The top-5 languages by bytes from the scan take
 * c1..c5 in scan order; any unmatched or unknown language reads as c5.
 */
export function createLanguageIndexer(
  scan: Scan,
): (language: string | null | undefined) => number {
  const byLower = new Map<string, number>()
  for (let index = 0; index < scan.languages.length; index++) {
    byLower.set(scan.languages[index].name.toLowerCase(), Math.min(index, 4))
  }
  return (language) => {
    if (language != null) {
      const found = byLower.get(language.toLowerCase())
      if (found !== undefined) return found
    }
    return 4
  }
}
