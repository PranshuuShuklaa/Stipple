/**
 * Signature 9 (DESIGN.md): draggable clusters in the Folders view.
 *
 * The labels are the drag handles (anime.js v4 createDraggable lives in the
 * stage component). This class owns the physics behind them:
 *
 * - a manual anchor per cluster, set by a drag, a throw or an arrow-key nudge
 * - a reflow offset per cluster, springing away from every anchored cluster
 *   that it overlaps, so the other clusters settle around the moved one
 * - plain typed arrays and a caller-supplied dt: the dot engine draws every
 *   frame and the canvas never needs a DOM node per dot
 *
 * Springs follow the DESIGN.md settle token (stiffness 120, damping 14).
 * Reduced motion / the Low tier pass `instant` and the reflow snaps.
 */

export const CLUSTER_SPRING = {
  stiffness: 120,
  damping: 14,
  restOffsetPx: 0.08,
  restVelocityPxS: 0.08,
  /** The visual spiral reaches 0.4P*sqrt(count); reflow uses a tighter core
   * so the untouched reference layout never pushes itself apart. */
  coreRadiusFactor: 0.55,
  separationPaddingPx: 10,
  /** Arrow-key nudge distance (Shift moves four steps). */
  nudgePx: 24,
  obstacleThresholdPx: 0.5,
} as const

const MIN_DT_S = 0.001
const MAX_DT_S = 0.05

export class ClusterDragEffect {
  private slotCount = 0
  private baseX = new Float32Array(0)
  private baseY = new Float32Array(0)
  private radius = new Float32Array(0)

  private anchorX = new Float32Array(0)
  private anchorY = new Float32Array(0)
  private reflowX = new Float32Array(0)
  private reflowY = new Float32Array(0)
  private velocityX = new Float32Array(0)
  private velocityY = new Float32Array(0)

  private targetX = new Float32Array(0)
  private targetY = new Float32Array(0)

  private width = 0
  private height = 0
  private activeSlot = -1

  /**
   * Sets the reference geometry for the current Folders layout. Centers are
   * dot centers in canvas px, radii are the reflow cores in px.
   */
  public setGeometry(
    centers: Float32Array,
    radii: Float32Array,
    width: number,
    height: number,
  ): void {
    const count = Math.min(Math.floor(centers.length / 2), radii.length)
    if (count !== this.slotCount) {
      this.slotCount = count
      this.baseX = new Float32Array(count)
      this.baseY = new Float32Array(count)
      this.radius = new Float32Array(count)
      this.anchorX = new Float32Array(count)
      this.anchorY = new Float32Array(count)
      this.reflowX = new Float32Array(count)
      this.reflowY = new Float32Array(count)
      this.velocityX = new Float32Array(count)
      this.velocityY = new Float32Array(count)
      this.targetX = new Float32Array(count)
      this.targetY = new Float32Array(count)
      this.activeSlot = -1
    }

    for (let i = 0; i < count; i++) {
      this.baseX[i] = centers[i * 2]
      this.baseY[i] = centers[i * 2 + 1]
      this.radius[i] = radii[i]
    }
    this.width = width
    this.height = height
  }

  public getSlotCount(): number {
    return this.slotCount
  }

  public getActiveSlot(): number {
    return this.activeSlot
  }

  public getTotalX(slot: number): number {
    if (slot < 0 || slot >= this.slotCount) return 0
    return this.anchorX[slot] + this.reflowX[slot]
  }

  public getTotalY(slot: number): number {
    if (slot < 0 || slot >= this.slotCount) return 0
    return this.anchorY[slot] + this.reflowY[slot]
  }

  public beginDrag(slot: number): void {
    if (slot < 0 || slot >= this.slotCount) return
    // Adopt whatever reflow position the cluster was resting in, so grabbing
    // it never makes it jump back to its base.
    this.anchorX[slot] = this.getTotalX(slot)
    this.anchorY[slot] = this.getTotalY(slot)
    this.reflowX[slot] = 0
    this.reflowY[slot] = 0
    this.velocityX[slot] = 0
    this.velocityY[slot] = 0
    this.activeSlot = slot
  }

  /** Feeds the live draggable x/y while the user grabs or throws a cluster. */
  public setDrag(slot: number, x: number, y: number): void {
    if (slot < 0 || slot >= this.slotCount) return
    this.anchorX[slot] = x
    this.anchorY[slot] = y
    this.reflowX[slot] = 0
    this.reflowY[slot] = 0
    this.velocityX[slot] = 0
    this.velocityY[slot] = 0
  }

  /** The throw animation is still running; keep the slot active until settle. */
  public releaseDrag(slot: number): void {
    if (slot !== this.activeSlot) return
  }

  public settleDrag(slot: number): void {
    if (slot !== this.activeSlot) return
    this.activeSlot = -1
    this.reflowX[slot] = 0
    this.reflowY[slot] = 0
    this.velocityX[slot] = 0
    this.velocityY[slot] = 0
  }

  /** Keyboard alternative: move an anchored cluster by whole steps. */
  public nudge(slot: number, dx: number, dy: number): void {
    if (slot < 0 || slot >= this.slotCount || (dx === 0 && dy === 0)) return
    const totalX = this.getTotalX(slot) + dx
    const totalY = this.getTotalY(slot) + dy
    const minX = this.radius[slot] - this.baseX[slot]
    const maxX = this.width - this.radius[slot] - this.baseX[slot]
    const minY = this.radius[slot] - this.baseY[slot]
    const maxY = this.height - this.radius[slot] - this.baseY[slot]
    const nextX = Math.min(maxX, Math.max(minX, totalX))
    const nextY = Math.min(maxY, Math.max(minY, totalY))
    this.anchorX[slot] = nextX - this.reflowX[slot]
    this.anchorY[slot] = nextY - this.reflowY[slot]
  }

  /** Sends every cluster home. The reflow offsets keep the current totals and
   * spring back, so Reset reads as a settle rather than a snap. */
  public reset(): void {
    for (let i = 0; i < this.slotCount; i++) {
      this.reflowX[i] = this.getTotalX(i)
      this.reflowY[i] = this.getTotalY(i)
      this.anchorX[i] = 0
      this.anchorY[i] = 0
      this.velocityX[i] = 0
      this.velocityY[i] = 0
    }
    this.activeSlot = -1
  }

  /** Leaving the Folders view: drop every offset at once. */
  public clear(): void {
    this.anchorX.fill(0)
    this.anchorY.fill(0)
    this.reflowX.fill(0)
    this.reflowY.fill(0)
    this.velocityX.fill(0)
    this.velocityY.fill(0)
    this.targetX.fill(0)
    this.targetY.fill(0)
    this.activeSlot = -1
  }

  public hasOffsets(): boolean {
    for (let i = 0; i < this.slotCount; i++) {
      if (
        Math.abs(this.getTotalX(i)) > CLUSTER_SPRING.obstacleThresholdPx ||
        Math.abs(this.getTotalY(i)) > CLUSTER_SPRING.obstacleThresholdPx
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Advances the reflow springs by one frame. Returns true when any total
   * offset moved, so the caller only repaints labels when something changed.
   */
  public update(dtMs: number, instant: boolean): boolean {
    if (this.slotCount === 0) return false
    this.computeReflowTargets()

    const dt = Math.min(MAX_DT_S, Math.max(MIN_DT_S, dtMs / 1000))
    const k = CLUSTER_SPRING.stiffness
    const c = CLUSTER_SPRING.damping
    let changed = false

    for (let i = 0; i < this.slotCount; i++) {
      if (i === this.activeSlot) continue

      const previousX = this.reflowX[i]
      const previousY = this.reflowY[i]

      if (instant) {
        this.reflowX[i] = this.targetX[i]
        this.reflowY[i] = this.targetY[i]
        this.velocityX[i] = 0
        this.velocityY[i] = 0
      } else {
        const ax = k * (this.targetX[i] - this.reflowX[i]) - c * this.velocityX[i]
        const ay = k * (this.targetY[i] - this.reflowY[i]) - c * this.velocityY[i]
        this.velocityX[i] += ax * dt
        this.velocityY[i] += ay * dt
        this.reflowX[i] += this.velocityX[i] * dt
        this.reflowY[i] += this.velocityY[i] * dt

        if (
          Math.abs(this.targetX[i] - this.reflowX[i]) < CLUSTER_SPRING.restOffsetPx &&
          Math.abs(this.targetY[i] - this.reflowY[i]) < CLUSTER_SPRING.restOffsetPx &&
          Math.abs(this.velocityX[i]) < CLUSTER_SPRING.restVelocityPxS &&
          Math.abs(this.velocityY[i]) < CLUSTER_SPRING.restVelocityPxS
        ) {
          this.reflowX[i] = this.targetX[i]
          this.reflowY[i] = this.targetY[i]
          this.velocityX[i] = 0
          this.velocityY[i] = 0
        }
      }

      if (
        Math.abs(this.reflowX[i] - previousX) > 0.001 ||
        Math.abs(this.reflowY[i] - previousY) > 0.001
      ) {
        changed = true
      }
    }

    return changed
  }

  private isObstacle(slot: number): boolean {
    if (slot === this.activeSlot) return true
    return (
      Math.abs(this.anchorX[slot]) > CLUSTER_SPRING.obstacleThresholdPx ||
      Math.abs(this.anchorY[slot]) > CLUSTER_SPRING.obstacleThresholdPx
    )
  }

  /**
   * Targets for the non-anchored clusters: push them out of every anchored
   * cluster they overlap. Three relaxation passes are enough for five slots.
   */
  private computeReflowTargets(): void {
    const n = this.slotCount
    this.targetX.fill(0)
    this.targetY.fill(0)

    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < n; j++) {
        if (j === this.activeSlot || this.isObstacle(j)) continue

        let tx = this.targetX[j]
        let ty = this.targetY[j]

        for (let o = 0; o < n; o++) {
          if (o === j || !this.isObstacle(o)) continue

          const obstacleX = this.baseX[o] + this.getTotalX(o)
          const obstacleY = this.baseY[o] + this.getTotalY(o)
          const centerX = this.baseX[j] + tx
          const centerY = this.baseY[j] + ty
          const dx = centerX - obstacleX
          const dy = centerY - obstacleY
          const minDistance =
            this.radius[j] + this.radius[o] + CLUSTER_SPRING.separationPaddingPx
          const distanceSq = dx * dx + dy * dy

          if (distanceSq >= minDistance * minDistance) continue

          const distance = Math.sqrt(distanceSq)
          if (distance < 0.001) {
            // Exactly concentric: pick a deterministic direction so the
            // solver never divides by zero or flickers between axes.
            tx += minDistance * (j % 2 === 0 ? 1 : -1)
          } else {
            const push = minDistance - distance
            tx += (dx / distance) * push
            ty += (dy / distance) * push
          }
        }

        this.targetX[j] = tx
        this.targetY[j] = ty
      }
    }
  }
}
