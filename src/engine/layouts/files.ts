import type { Scan } from '@/lib/types/scan'

export interface LayoutTarget {
  x: Float32Array
  y: Float32Array
  size: Float32Array
  alpha: Float32Array
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
  dotCount: number
  cols: number
  rows: number
}

export interface Viewport {
  width: number
  height: number
}

export interface ThemeColors {
  fg: [number, number, number] // [r, g, b]
  panel: [number, number, number]
  c1: [number, number, number]
  c2: [number, number, number]
  c3: [number, number, number]
  c4: [number, number, number]
  c5: [number, number, number]
}

/**
 * Calculates dot positions and properties for the Files grid layout.
 * Conforms strictly to REFERENCE.md:
 * - 24 columns by 10 rows for 240 files
 * - Diameter s = clamp(6, round(W / 90), 12), capped at 0.8 * P
 * - Center cx = W / 2, cy = H / 2 - 8
 * - Pitch P = min(W / (COLS + 1), H / (ROWS + 3))
 * - Centered coordinates with s / 2 offset
 * - Opacity 0.85, color is fg
 */
export function calculateFilesLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors
): LayoutTarget {
  const n = scan.files.length
  const W = viewport.width
  const H = viewport.height

  const cols = n === 240 ? 24 : n < 240 ? Math.min(n, 24) : Math.max(24, Math.ceil(Math.sqrt(n * 2.4)))
  const rows = Math.ceil(n / cols)

  const P = Math.min(W / (cols + 1), H / (rows + 3))
  const baseS = Math.max(6, Math.min(12, Math.round(W / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * P))

  const cx = W / 2
  const cy = H / 2 - 8
  const halfS = s / 2

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)

  const [fgR, fgG, fgB] = theme.fg

  const colOffset = (cols - 1) / 2
  const rowOffset = (rows - 1) / 2

  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)

    x[i] = cx + (col - colOffset) * P - halfS
    y[i] = cy + (row - rowOffset) * P - halfS
    size[i] = s
    alpha[i] = 0.85
    r[i] = fgR
    g[i] = fgG
    b[i] = fgB
  }

  return {
    x,
    y,
    size,
    alpha,
    r,
    g,
    b,
    dotCount: n,
    cols,
    rows,
  }
}
