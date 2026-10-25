/**
 * Gravity bounce for the Konami code (DESIGN.md signature 13).
 * Dots fall under constant gravity, bounce off the bottom of the stage,
 * then spring back to their layout positions. Plain physics on typed
 * arrays: no animation object and no loop of its own.
 */

export const GRAVITY_BOUNCE = {
  accelerationPxS2: 2400,
  restitution: 0.48,
  minBounceSpeed: 90,
  returnAtMs: 1450,
  returnMs: 620,
  bottomInsetPx: 4,
  maxStaggerMs: 140,
} as const

export class GravityBounceEffect {
  private active = false
  private returning = false
  private elapsed = 0
  private count = 0
  private vy = new Float32Array(0)
  private offset = new Float32Array(0)
  private delay = new Float32Array(0)
  private returnFrom = new Float32Array(0)

  public allocate(count: number): void {
    this.count = Math.max(0, count)
    this.vy = new Float32Array(this.count)
    this.offset = new Float32Array(this.count)
    this.delay = new Float32Array(this.count)
    this.returnFrom = new Float32Array(this.count)
    this.active = false
    this.returning = false
    this.elapsed = 0
  }

  public trigger(): void {
    if (this.count === 0) return
    this.active = true
    this.returning = false
    this.elapsed = 0
    this.vy.fill(0)
    this.offset.fill(0)
    this.returnFrom.fill(0)
    for (let i = 0; i < this.count; i++) {
      const fraction = (i * 0.61803398875) % 1
      this.delay[i] = fraction * GRAVITY_BOUNCE.maxStaggerMs
    }
  }

  public isActive(): boolean {
    return this.active
  }

  public getOffset(index: number): number {
    return this.active && index >= 0 && index < this.count ? this.offset[index] : 0
  }

  public reset(): void {
    this.active = false
    this.returning = false
    this.elapsed = 0
    this.vy.fill(0)
    this.offset.fill(0)
    this.returnFrom.fill(0)
  }

  public update(
    dtMs: number,
    x: Float32Array,
    y: Float32Array,
    size: Float32Array,
    count: number,
    stageHeight: number,
  ): void {
    if (!this.active) return

    const stepMs = Math.max(0, dtMs)
    this.elapsed += stepMs
    const dt = Math.min(0.05, stepMs / 1000)
    const totalMs = GRAVITY_BOUNCE.returnAtMs + GRAVITY_BOUNCE.returnMs

    if (!this.returning && this.elapsed >= GRAVITY_BOUNCE.returnAtMs) {
      this.returning = true
      this.returnFrom.set(this.offset)
    }

    if (this.returning && this.elapsed >= totalMs) {
      this.reset()
      return
    }

    const limit = Math.min(this.count, count)

    if (this.returning) {
      const q = Math.min(
        1,
        Math.max(0, (this.elapsed - GRAVITY_BOUNCE.returnAtMs) / GRAVITY_BOUNCE.returnMs),
      )
      // Damped spring: starts at the bounce offset, overshoots, settles at 0.
      const remaining = Math.exp(-6 * q) * Math.cos(10 * q)
      for (let i = 0; i < limit; i++) {
        this.offset[i] = this.returnFrom[i] * remaining
      }
      return
    }

    const g = GRAVITY_BOUNCE.accelerationPxS2
    const floorInset = GRAVITY_BOUNCE.bottomInsetPx
    const restitution = GRAVITY_BOUNCE.restitution
    const minBounce = GRAVITY_BOUNCE.minBounceSpeed

    for (let i = 0; i < limit; i++) {
      if (this.elapsed < this.delay[i]) continue

      const radius = size[i] / 2
      const maxFall = Math.max(0, stageHeight - radius - floorInset - (y[i] + radius))
      if (maxFall <= 0) {
        this.offset[i] = 0
        this.vy[i] = 0
        continue
      }

      this.vy[i] += g * dt
      const next = this.offset[i] + this.vy[i] * dt
      if (this.vy[i] > 0 && next >= maxFall) {
        this.offset[i] = maxFall
        this.vy[i] =
          this.vy[i] > minBounce ? -this.vy[i] * restitution : 0
      } else {
        this.offset[i] = Math.max(0, next)
      }
    }
  }
}
