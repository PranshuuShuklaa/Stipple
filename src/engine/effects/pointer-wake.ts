/**
 * Pointer wake effect for Stipple dot engine.
 * Exact constants from REFERENCE.md:
 * - radius: 90 px
 * - push force inside radius: (1 - distance / 90) * 5
 * - spring back: 0.06
 * - damping: 0.86
 */
export class PointerWakeEffect {
  private px: Float32Array = new Float32Array(0)
  private py: Float32Array = new Float32Array(0)
  private vx: Float32Array = new Float32Array(0)
  private vy: Float32Array = new Float32Array(0)
  private capacity = 0

  public allocate(count: number): void {
    if (this.capacity !== count) {
      this.capacity = count
      this.px = new Float32Array(count)
      this.py = new Float32Array(count)
      this.vx = new Float32Array(count)
      this.vy = new Float32Array(count)
    } else {
      this.reset()
    }
  }

  public reset(): void {
    this.px.fill(0)
    this.py.fill(0)
    this.vx.fill(0)
    this.vy.fill(0)
  }

  /**
   * Updates spring-damping physics for all dots relative to pointer position.
   */
  public update(
    x: Float32Array,
    y: Float32Array,
    size: Float32Array,
    count: number,
    pointerX: number,
    pointerY: number
  ): void {
    const hasPointer = pointerX > -9000 && pointerY > -9000
    const limit = Math.min(count, this.capacity)

    for (let i = 0; i < limit; i++) {
      if (hasPointer) {
        const radius = size[i] / 2
        const dotCx = x[i] + radius
        const dotCy = y[i] + radius
        const dx = dotCx - pointerX
        const dy = dotCy - pointerY
        const distSq = dx * dx + dy * dy

        if (distSq < 8100 && distSq > 0.0001) {
          // 90^2 = 8100
          const dist = Math.sqrt(distSq)
          const f = (1 - dist / 90) * 5
          this.vx[i] += (dx / dist) * f
          this.vy[i] += (dy / dist) * f
        }
      }

      // Spring-damper integration
      this.vx[i] -= this.px[i] * 0.06
      this.vy[i] -= this.py[i] * 0.06
      this.vx[i] *= 0.86
      this.vy[i] *= 0.86
      this.px[i] += this.vx[i]
      this.py[i] += this.vy[i]
    }
  }

  public getOffsetX(index: number): number {
    return index < this.capacity ? this.px[index] : 0
  }

  public getOffsetY(index: number): number {
    return index < this.capacity ? this.py[index] : 0
  }
}
