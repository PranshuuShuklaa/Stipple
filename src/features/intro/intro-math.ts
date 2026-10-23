/**
 * Pure math for the Stipple boot intro (REFERENCE.md § "Intro").
 * No DOM, no React — shared by intro-overlay.tsx and the unit tests.
 */

export const LOW_TIER_SAMPLE_POINTS = 600
export const MAX_SAMPLE_POINTS = 2400

/** Renderer sampling grid: gap = max(5, round(fontSize / 42)) */
export function computeGap(fontSize: number): number {
  return Math.max(5, Math.round(fontSize / 42))
}

/** Word size: 70% of the viewport width, capped at 50% of its height. */
export function computeWordFontSize(
  wordWidthAt100px: number,
  W: number,
  H: number
): number {
  return Math.min((100 * (W * 0.7)) / wordWidthAt100px, H * 0.5)
}

export interface GridGeometry {
  P: number
  gx0: number
  gy0: number
  gr: number
}

/**
 * Files-grid geometry on the real demo stage (zero-jump handoff).
 * Matches src/engine/layouts/files.ts exactly: pitch min(W/25, H/13) for
 * 240 files, center offset −8, diameter min(clamp(6, W/90, 12), 0.8·P).
 */
export function computeGridFromStage(
  stageW: number,
  stageH: number,
  stageLeft: number,
  stageTop: number
): GridGeometry {
  const P = Math.min(stageW / 25, stageH / 13)
  const baseS = Math.max(6, Math.min(12, Math.round(stageW / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * P))
  const sCx = stageLeft + stageW / 2
  const sCy = stageTop + stageH / 2 - 8
  return {
    P,
    gx0: sCx - 11.5 * P,
    gy0: sCy - 4.5 * P,
    gr: s / 2,
  }
}

/**
 * Prototype fallback when the demo stage is not available (REFERENCE.md
 * handoff numbers: pitch min(W/26, H·0.5/11), radius clamp(3, W/180, 6)).
 */
export function computePrototypeGrid(W: number, H: number): GridGeometry {
  const P = Math.min(W / 26, (H * 0.5) / 11)
  return {
    P,
    gx0: W / 2 - 11.5 * P,
    gy0: H * 0.66 - 4.5 * P,
    gr: Math.max(3, Math.min(6, W / 180)),
  }
}

/** Files-grid position of dot n from the grid origin and pitch. */
export function gridDotPosition(
  n: number,
  gx0: number,
  gy0: number,
  P: number
): { gx: number; gy: number } {
  return {
    gx: gx0 + (n % 24) * P,
    gy: gy0 + Math.floor(n / 24) * P,
  }
}

/** Quadratic bezier position at t (the fly-to-the-letter path). */
export function bezierPoint(
  t: number,
  sx: number,
  sy: number,
  cpx: number,
  cpy: number,
  tx: number,
  ty: number
): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * sx + 2 * u * t * cpx + t * t * tx,
    y: u * u * sy + 2 * u * t * cpy + t * t * ty,
  }
}

export interface Ring {
  x: number
  y: number
  r: number
  amp: number
}

/**
 * Radial push inside the falloff band around an expanding ring:
 * displacement = cos(offset / band · π/2) · amp, zero outside the band.
 */
export function ringDisplacement(
  x: number,
  y: number,
  ring: Ring,
  falloffBand = 70
): { dx: number; dy: number } {
  const dx = x - ring.x
  const dy = y - ring.y
  const di = Math.hypot(dx, dy) || 1
  const k = di - ring.r
  if (Math.abs(k) >= falloffBand) {
    return { dx: 0, dy: 0 }
  }
  const f = Math.cos((k / falloffBand) * (Math.PI / 2)) * ring.amp
  return { dx: (dx / di) * f, dy: (dy / di) * f }
}

/** '#RRGGBB' → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
