import {
  FORGE_DOT_RADIUS,
  type ForgeDotPlan,
  type ForgePoint,
} from './link-forge-math'

/** A forge dot's live, animated state. */
export interface AnimatedForgeDot extends ForgeDotPlan {
  x: number
  y: number
  alpha: number
  scale: number
  introDelay: number
  collapse: ForgePoint
  fill: string
}

/** Canvas paints CSS rgb() strings; tokens resolve to numeric triplets. */
export function cssColor(rgb: readonly number[]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

/** Draws every dot from its plain JS state: no DOM nodes, no gradients. */
export function paintForge(
  context: CanvasRenderingContext2D,
  dots: readonly AnimatedForgeDot[],
  dpr: number,
): void {
  const canvas = context.canvas
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  for (const dot of dots) {
    if (dot.alpha <= 0.01) continue
    context.globalAlpha = dot.alpha
    context.fillStyle = dot.fill
    context.beginPath()
    context.arc(dot.x, dot.y, FORGE_DOT_RADIUS * dot.scale, 0, Math.PI * 2)
    context.fill()
  }
  context.globalAlpha = 1
}
