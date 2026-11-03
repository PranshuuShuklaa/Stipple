import type { Scan } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'

export function calculatePulseLayout(scan: Scan, viewport: Viewport, theme: ThemeColors): LayoutTarget {
  const W = viewport.width
  const H = viewport.height
  const days = scan.pulse?.days.length ? scan.pulse.days : Array.from({ length: 364 }, (_, index) => ({ date: String(index), commits: 0 }))
  const max = Math.max(1, ...days.map((day) => day.commits))
  const cell = Math.min((W * 0.82) / 52, (H * 0.72) / 7)
  const startX = (W - cell * 52) / 2
  const startY = (H - cell * 7) / 2
  const x = new Float32Array(days.length)
  const y = new Float32Array(days.length)
  const size = new Float32Array(days.length)
  const alpha = new Float32Array(days.length)
  const r = new Uint8ClampedArray(days.length)
  const g = new Uint8ClampedArray(days.length)
  const b = new Uint8ClampedArray(days.length)
  const [cr, cg, cb] = theme.c1
  for (let index = 0; index < days.length; index++) {
    const column = Math.floor(index / 7)
    const row = index % 7
    const value = days[index]?.commits ?? 0
    x[index] = startX + column * cell + cell / 2
    y[index] = startY + row * cell + cell / 2
    size[index] = Math.max(4, cell * (value === 0 ? 0.45 : 0.6 + Math.min(0.4, value / max * 0.4)))
    alpha[index] = value === 0 ? 0.15 : 0.35 + Math.min(0.65, value / max * 0.65)
    r[index] = cr; g[index] = cg; b[index] = cb
  }
  return { x, y, size, alpha, r, g, b, dotCount: days.length, cols: 52, rows: 7 }
}
