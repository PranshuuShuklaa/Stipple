/**
 * Pure geometry for the Link forge (DESIGN.md signature 10).
 *
 * The target shape is the badge's pill, expanded by a small pad so the dots
 * frame the real badge instead of covering its text. Start and burst points
 * are deterministic from a seed: the same badge always forges the same way.
 */

export interface ForgeRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ForgePoint {
  x: number
  y: number
}

export interface ForgeCanvas {
  width: number
  height: number
}

export type ForgeDotColor = 'label' | 'band'

export interface ForgeDotPlan {
  target: ForgePoint
  start: ForgePoint
  burst: ForgePoint
  color: ForgeDotColor
  row: number
  col: number
}

export interface ForgeGeometry {
  dots: ForgeDotPlan[]
  cols: number
  rows: number
  center: ForgePoint
}

/** DESIGN.md / AGENTS.md: dots are 6 to 12 px circles. */
export const FORGE_DOT_DIAMETER = 6
export const FORGE_DOT_RADIUS = FORGE_DOT_DIAMETER / 2
export const FORGE_PITCH = 8
export const FORGE_PAD = 14
export const FORGE_SEED = 17
export const MAX_FORGE_DOTS = 260
export const MAX_COLLAPSE_SLOTS = 56

const START_MARGIN = 6
const BADGE_SPLIT = 0.48

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Mulberry32: tiny deterministic PRNG, no dependency. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Rounded-rectangle hit test; radius = height / 2 gives the badge pill. */
export function insidePill(x: number, y: number, rect: ForgeRect, radius: number): boolean {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2))
  const nx = clamp(x, rect.x + r, rect.x + rect.width - r)
  const ny = clamp(y, rect.y + r, rect.y + rect.height - r)
  const dx = x - nx
  const dy = y - ny
  return dx * dx + dy * dy <= r * r
}

function insideRect(x: number, y: number, rect: ForgeRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

interface GridPoint extends ForgePoint {
  row: number
  col: number
}

function gridPoints(
  rect: ForgeRect,
  pitch: number,
): { points: GridPoint[]; cols: number; rows: number } {
  const cols = Math.max(1, Math.floor(rect.width / pitch))
  const rows = Math.max(1, Math.floor(rect.height / pitch))
  const startX = rect.x + (rect.width - (cols - 1) * pitch) / 2
  const startY = rect.y + (rect.height - (rows - 1) * pitch) / 2
  const points: GridPoint[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      points.push({ x: startX + col * pitch, y: startY + row * pitch, row, col })
    }
  }

  return { points, cols, rows }
}

function clampToCanvas(point: ForgePoint, canvas: ForgeCanvas): ForgePoint {
  return {
    x: clamp(point.x, START_MARGIN, Math.max(START_MARGIN, canvas.width - START_MARGIN)),
    y: clamp(point.y, START_MARGIN, Math.max(START_MARGIN, canvas.height - START_MARGIN)),
  }
}

/**
 * Builds the badge frame. Points sit on an even grid clipped to the expanded
 * pill, minus the badge's own rectangle, so the real score stays readable.
 */
export function buildForgeGeometry(
  badge: ForgeRect,
  canvas: ForgeCanvas,
  seed: number = FORGE_SEED,
): ForgeGeometry {
  if (
    badge.width <= 0 ||
    badge.height <= 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    return { dots: [], cols: 0, rows: 0, center: { x: 0, y: 0 } }
  }

  const center: ForgePoint = {
    x: badge.x + badge.width / 2,
    y: badge.y + badge.height / 2,
  }

  const pad = Math.max(
    6,
    Math.min(FORGE_PAD, (canvas.width - badge.width) / 2 - 4),
  )
  const frame: ForgeRect = {
    x: badge.x - pad,
    y: badge.y - pad,
    width: badge.width + pad * 2,
    height: badge.height + pad * 2,
  }
  const frameRadius = frame.height / 2
  const inner = {
    x: badge.x - 2,
    y: badge.y - 2,
    width: badge.width + 4,
    height: badge.height + 4,
  }

  const grid = gridPoints(frame, FORGE_PITCH)
  const framePoints = grid.points.filter(
    (point) =>
      insidePill(point.x, point.y, frame, frameRadius) &&
      !insideRect(point.x, point.y, inner),
  )

  const stride = Math.max(1, Math.ceil(framePoints.length / MAX_FORGE_DOTS))
  const kept =
    stride === 1
      ? framePoints
      : framePoints.filter((_, index) => index % stride === 0)

  const random = createRandom(seed)
  const spread = Math.max(badge.width, badge.height)
  const startNear = spread * 0.55 + 50
  const startFar = startNear + Math.min(180, Math.max(80, canvas.width * 0.12))
  const splitX = badge.x + badge.width * BADGE_SPLIT

  const dots = kept.map((target): ForgeDotPlan => {
    const angle = Math.atan2(
      (target.y - center.y) / 0.62,
      target.x - center.x,
    )
    const startAngle = angle + (random() - 0.5) * 0.5
    const startDistance = startNear + random() * (startFar - startNear)
    const start = clampToCanvas(
      {
        x: center.x + Math.cos(startAngle) * startDistance,
        y: center.y + Math.sin(startAngle) * startDistance * 0.62,
      },
      canvas,
    )

    const burstAngle = angle + (random() - 0.5) * 0.6
    const burstDistance = badge.height * (1.2 + random() * 1.6) + 36
    const burst = clampToCanvas(
      {
        x: center.x + Math.cos(burstAngle) * burstDistance,
        y: center.y + Math.sin(burstAngle) * burstDistance * 0.8,
      },
      canvas,
    )

    return {
      target,
      start,
      burst,
      color: target.x <= splitX ? 'label' : 'band',
      row: target.row,
      col: target.col,
    }
  })

  return {
    dots,
    cols: grid.cols,
    rows: grid.rows,
    center,
  }
}

/**
 * One landing point per dot inside the "Copied" pill. Slots repeat when the
 * pill holds fewer dots than the forge; the collapse still reads as one
 * stream because every dot fades out as it arrives.
 */
export function buildCollapseTargets(
  count: number,
  button: ForgeRect,
  seed: number = FORGE_SEED,
): ForgePoint[] {
  if (count <= 0) return []
  if (button.width <= 0 || button.height <= 0) {
    return new Array<ForgePoint>(count).fill({ x: button.x, y: button.y })
  }

  const inset = Math.min(5, button.width / 4, button.height / 4)
  const inner: ForgeRect = {
    x: button.x + inset,
    y: button.y + inset,
    width: Math.max(1, button.width - inset * 2),
    height: Math.max(1, button.height - inset * 2),
  }
  const radius = inner.height / 2

  let pitch = 7
  let slots: ForgePoint[] = []
  while (pitch <= 24) {
    const grid = gridPoints(inner, pitch)
    slots = grid.points.filter((point) => insidePill(point.x, point.y, inner, radius))
    if (slots.length <= MAX_COLLAPSE_SLOTS) break
    pitch += 1
  }

  if (slots.length === 0) {
    slots = [{ x: inner.x + inner.width / 2, y: inner.y + inner.height / 2 }]
  }

  const random = createRandom(seed + 1)
  const targets: ForgePoint[] = []
  for (let index = 0; index < count; index++) {
    const slot = slots[index % slots.length]
    targets.push({
      x: slot.x + (random() - 0.5) * 2,
      y: slot.y + (random() - 0.5) * 2,
    })
  }
  return targets
}
