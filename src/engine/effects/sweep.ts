/**
 * Scan sweep state for the loading screen (DESIGN.md "Scan sweep").
 * The screen drives the line fraction; the mode drives what the canvas
 * shows: gray dots ahead of the line with real colors behind it, a thin
 * vertical line while the scan runs, and an indeterminate alpha shimmer
 * over the waiting gray dots (both while stages stream and while the
 * direct-request fallback runs). Error and done set the mode to off, so
 * the line, shimmer and color reveal all stop. Reduced motion draws
 * neither line nor shimmer — colors simply arrive with the scan.
 */

export type SweepMode = 'off' | 'waiting' | 'shimmer' | 'reveal'

export const SWEEP_SHIMMER_PERIOD_MS = 2400

const LINE_WIDTH_PX = 2
const LINE_ALPHA = 0.5
const TAIL_WIDTH_PX = 22
const TAIL_ALPHA = 0.1
const GRAY_ALPHA = 0.72
const SHIMMER_AMPLITUDE = 0.35

export class SweepEffect {
  private mode: SweepMode = 'off'
  private lineFrac = 0
  private reducedMotion = false

  public setMode(mode: SweepMode): void {
    this.mode = mode
  }

  public getMode(): SweepMode {
    return this.mode
  }

  /** Clamped fraction of the stage width the line has reached. */
  public setLine(fraction: number): void {
    this.lineFrac = Math.min(1, Math.max(0, fraction))
  }

  public getLine(): number {
    return this.lineFrac
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
  }

  public isReducedMotion(): boolean {
    return this.reducedMotion
  }

  public holdsColors(): boolean {
    return !this.reducedMotion && this.mode !== 'off'
  }

  /** Only dots left of the line carry real colors while revealing. */
  public isRevealed(dotCenterX: number, width: number): boolean {
    if (!this.holdsColors() || this.mode !== 'reveal') return false
    return width > 0 && dotCenterX <= this.lineFrac * width
  }

  public isLineVisible(): boolean {
    if (this.reducedMotion) return false
    return (
      (this.mode === 'waiting' || this.mode === 'shimmer' || this.mode === 'reveal') &&
      this.lineFrac > 0
    )
  }

  /** True while the unrevealed gray dots carry the waiting shimmer. */
  public isShimmering(): boolean {
    return !this.reducedMotion && (this.mode === 'waiting' || this.mode === 'shimmer')
  }

  /** Indeterminate alpha modulation for the waiting shimmer run. */
  public shimmerFactor(xFrac: number, nowMs: number): number {
    if (!this.isShimmering()) return 1
    const phase = ((xFrac - (nowMs % SWEEP_SHIMMER_PERIOD_MS) / SWEEP_SHIMMER_PERIOD_MS) % 1 + 1) % 1
    const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
    return 1 - SHIMMER_AMPLITUDE + SHIMMER_AMPLITUDE * wave
  }

  public drawLine(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: [number, number, number],
  ): void {
    if (this.reducedMotion || !this.isLineVisible() || width <= 0) return
    const x = this.lineFrac * width
    ctx.fillStyle = `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${TAIL_ALPHA})`
    ctx.fillRect(Math.max(0, x - TAIL_WIDTH_PX), 0, Math.min(TAIL_WIDTH_PX, x), height)
    ctx.fillStyle = `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, ${LINE_ALPHA})`
    ctx.fillRect(x - LINE_WIDTH_PX / 2, 0, LINE_WIDTH_PX, height)
  }

  /** The muted gray a not-yet-revealed dot renders with. */
  public grayFill(alpha: number, gray: [number, number, number]): string {
    return `rgba(${gray[0]}, ${gray[1]}, ${gray[2]}, ${alpha * GRAY_ALPHA})`
  }
}
