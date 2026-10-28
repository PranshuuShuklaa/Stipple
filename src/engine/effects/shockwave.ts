import { animate } from 'animejs'

export interface ShockwaveRing {
  x: number
  y: number
  r: number
  amp: number
  animation?: ReturnType<typeof animate>
}

/**
 * Click shockwave effect for Stipple dot engine.
 * Exact constants from REFERENCE.md:
 * - Start at click position
 * - Amplitude: 16 px (default)
 * - Expands to 500 px over 700 ms easeOutQuad
 * - Falloff: dots within 70 px band of the ring are pushed by cos(offset / 70 * PI / 2) * amplitude
 */
export class ShockwaveEffect {
  private rings: ShockwaveRing[] = []
  private scratch: [number, number] = [0, 0]

  public trigger(x: number, y: number, amplitude = 16, maxRadius = 500, duration = 700): void {
    const ring: ShockwaveRing = {
      x,
      y,
      r: 0,
      amp: amplitude,
    }

    const anim = animate(ring, {
      r: maxRadius,
      amp: 0,
      duration,
      ease: 'outQuad',
      onComplete: () => {
        const index = this.rings.indexOf(ring)
        if (index !== -1) {
          this.rings.splice(index, 1)
        }
      },
    })

    ring.animation = anim
    this.rings.push(ring)
  }

  /**
   * Applies displacement from all active shockwave rings to point (x, y).
   * Returns reusable scratch [offsetX, offsetY] array to avoid GC allocations.
   */
  public getDisplacement(x: number, y: number): readonly [number, number] {
    let offX = 0
    let offY = 0

    for (let i = 0; i < this.rings.length; i++) {
      const q = this.rings[i]
      if (q.amp <= 0.05) continue

      const dx = x - q.x
      const dy = y - q.y
      const di = Math.hypot(dx, dy) || 1
      const k = di - q.r

      if (Math.abs(k) < 70) {
        const f = Math.cos((k / 70) * (Math.PI / 2)) * q.amp
        offX += (dx / di) * f
        offY += (dy / di) * f
      }
    }

    this.scratch[0] = offX
    this.scratch[1] = offY
    return this.scratch
  }

  public getActiveCount(): number {
    return this.rings.length
  }

  public reset(): void {
    for (const ring of this.rings) {
      if (ring.animation) {
        ring.animation.revert()
      }
    }
    this.rings = []
  }

  public destroy(): void {
    this.reset()
  }
}
