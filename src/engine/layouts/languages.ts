import type { Scan } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'

/**
 * Calculates dot positions and properties for the Languages stacked bar layout.
 * Conforms strictly to REFERENCE.md:
 * - Sort dots by language, rank r
 * - Pb = min(W / 22, H / 15)
 * - Column floor(r / 12), row r % 12
 * - x = cx + (column - 9.5) * Pb - s / 2
 * - y = cy + (row - 5.5) * Pb - s / 2
 * - Center cx = W / 2, cy = H / 2 - 8
 * - Diameter s = min(clamp(6, round(W / 90), 12), 0.8 * Pb), never larger than 12 px
 * - Color is the language color (c1..c5), opacity 1.0
 */
export function calculateLanguagesLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors
): LayoutTarget {
  const n = scan.files.length
  const W = viewport.width
  const H = viewport.height

  const cx = W / 2
  const cy = H / 2 - 8
  const Pb = Math.min(W / 22, H / 15)

  const baseS = Math.max(6, Math.min(12, Math.round(W / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * Pb))
  const halfS = s / 2

  // Map scan.languages to indices 0..4 (c1..c5)
  const langColorMap = new Map<string, number>()
  for (let i = 0; i < scan.languages.length; i++) {
    const idx = Math.min(i, 4)
    langColorMap.set(scan.languages[i].name.toLowerCase(), idx)
  }

  // Determine language index for each file (default to 4 for other/unmatched)
  const fileLangIndices = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const lang = scan.files[i]?.language
    if (lang && langColorMap.has(lang.toLowerCase())) {
      fileLangIndices[i] = langColorMap.get(lang.toLowerCase())!
    } else {
      fileLangIndices[i] = 4
    }
  }

  // Stable sort files by language index, tie-breaking by file index
  const indices = Array.from({ length: n }, (_, i) => i)
  indices.sort((a, b) => fileLangIndices[a] - fileLangIndices[b] || a - b)

  const ranks = new Int32Array(n)
  for (let r = 0; r < n; r++) {
    ranks[indices[r]] = r
  }

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  const rArr = new Uint8ClampedArray(n)
  const gArr = new Uint8ClampedArray(n)
  const bArr = new Uint8ClampedArray(n)

  const themeColors = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5]

  const maxCols = Math.max(20, Math.ceil(n / 12))
  const rows = 12

  for (let i = 0; i < n; i++) {
    const rank = ranks[i]
    const col = Math.floor(rank / 12)
    const row = rank % 12

    x[i] = cx + (col - 9.5) * Pb - halfS
    y[i] = cy + (row - 5.5) * Pb - halfS
    size[i] = s
    alpha[i] = 1.0

    const langIdx = fileLangIndices[i]
    const [cr, cg, cb] = themeColors[langIdx] ?? theme.c5
    rArr[i] = cr
    gArr[i] = cg
    bArr[i] = cb
  }

  return {
    x,
    y,
    size,
    alpha,
    r: rArr,
    g: gArr,
    b: bArr,
    dotCount: n,
    cols: maxCols,
    rows,
  }
}
