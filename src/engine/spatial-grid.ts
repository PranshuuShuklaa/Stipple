export interface NearestDotResult {
  index: number
  distance: number
}

/**
 * 2D Spatial Hash Grid for O(1) nearest-neighbor dot queries.
 * Replaces O(N) linear scans on mousemove events with constant-time localized bucket lookups.
 */
export class SpatialGrid {
  private cellSize: number
  private cols = 0
  private rows = 0
  private buckets: number[][] = []
  private x: Float32Array | null = null
  private y: Float32Array | null = null
  private size: Float32Array | null = null
  private count = 0

  constructor(cellSize = 36) {
    this.cellSize = cellSize
  }

  /**
   * Rebuilds the spatial index from dot positions and dimensions.
   */
  public build(
    x: Float32Array,
    y: Float32Array,
    size: Float32Array,
    count: number,
    width: number,
    height: number
  ): void {
    this.x = x
    this.y = y
    this.size = size
    this.count = count

    this.cols = Math.max(1, Math.ceil(width / this.cellSize))
    this.rows = Math.max(1, Math.ceil(height / this.cellSize))

    const totalBuckets = this.cols * this.rows
    this.buckets = Array.from({ length: totalBuckets }, () => [])

    for (let i = 0; i < count; i++) {
      const radius = size[i] / 2
      const cx = x[i] + radius
      const cy = y[i] + radius

      const col = Math.max(0, Math.min(this.cols - 1, Math.floor(cx / this.cellSize)))
      const row = Math.max(0, Math.min(this.rows - 1, Math.floor(cy / this.cellSize)))

      const bucketIndex = row * this.cols + col
      this.buckets[bucketIndex].push(i)
    }
  }

  /**
   * Finds the nearest dot within maxRadius of (qx, qy).
   * Returns null if no dot is within maxRadius.
   */
  public findNearest(qx: number, qy: number, maxRadius: number): NearestDotResult | null {
    if (!this.x || !this.y || !this.size || this.count === 0 || this.buckets.length === 0) {
      return null
    }

    const minCol = Math.max(0, Math.floor((qx - maxRadius) / this.cellSize))
    const maxCol = Math.min(this.cols - 1, Math.floor((qx + maxRadius) / this.cellSize))
    const minRow = Math.max(0, Math.floor((qy - maxRadius) / this.cellSize))
    const maxRow = Math.min(this.rows - 1, Math.floor((qy + maxRadius) / this.cellSize))

    const maxRadiusSq = maxRadius * maxRadius
    let bestDistSq = maxRadiusSq
    let bestIndex = -1

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * this.cols
      for (let c = minCol; c <= maxCol; c++) {
        const bucket = this.buckets[rowOffset + c]
        if (!bucket) continue

        for (let k = 0; k < bucket.length; k++) {
          const i = bucket[k]
          const radius = this.size[i] / 2
          const cx = this.x[i] + radius
          const cy = this.y[i] + radius

          const dx = cx - qx
          const dy = cy - qy
          const distSq = dx * dx + dy * dy

          if (distSq < bestDistSq) {
            bestDistSq = distSq
            bestIndex = i
          }
        }
      }
    }

    if (bestIndex === -1) {
      return null
    }

    return {
      index: bestIndex,
      distance: Math.sqrt(bestDistSq),
    }
  }
}
