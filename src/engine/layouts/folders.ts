import type { Scan } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'

export interface FolderLabel {
  folder: string
  count: number
  x: number
  y: number
}

export interface FoldersLayoutTarget extends LayoutTarget {
  labels: FolderLabel[]
  /** Cluster slot (0..4) for every dot, for the draggable-cluster offsets. */
  clusterOf: Int32Array
  /** Flat [x0, y0, x1, y1, ...] dot centers in canvas px. */
  clusterCenters: Float32Array
  /** Reflow core radius per cluster in px (tighter than the visual spiral). */
  clusterRadii: Float32Array
}

export const FOLDER_CENTERS: readonly [number, number][] = [
  [0.22, 0.5],
  [0.55, 0.28],
  [0.5, 0.7],
  [0.8, 0.55],
  [0.84, 0.2],
] as const

/**
 * Calculates dot positions and properties for the Folders 5-cluster phyllotaxis spiral layout.
 * Conforms strictly to REFERENCE.md:
 * - 5 cluster centers: [0.22, 0.50], [0.55, 0.28], [0.50, 0.70], [0.80, 0.55], [0.84, 0.20]
 * - Pitch P = min(W / 25, H / 13)
 * - Dot k of folder sits on spiral:
 *     angle = k * 2.39996
 *     radius = 0.4 * P * sqrt(k + 0.5)
 *     x = W * Q[f][0] + radius * cos(angle) - s / 2
 *     y = H * Q[f][1] + radius * sin(angle) - s / 2
 * - Color is folder color (c1..c5), opacity 1.0
 * - Labels: y = H * cy - 0.4 * P * sqrt(count) - 10, text is folder name + count
 */
export function calculateFoldersLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors
): FoldersLayoutTarget {
  const n = scan.files.length
  const W = viewport.width
  const H = viewport.height

  const P = Math.min(W / 25, H / 13)
  const baseS = Math.max(6, Math.min(12, Math.round(W / 90)))
  const s = Math.min(baseS, Math.max(4, 0.8 * P))
  const halfS = s / 2

  // Count files per folder
  const folderCounts = new Map<string, number>()
  for (const file of scan.files) {
    const f = file.folder || 'root'
    folderCounts.set(f, (folderCounts.get(f) ?? 0) + 1)
  }

  // Sort folders by file count descending
  const sortedFolders = Array.from(folderCounts.entries()).sort((a, b) => b[1] - a[1])

  // Top 5 folder names
  const topFolders: string[] = []
  for (let i = 0; i < 5; i++) {
    if (i < sortedFolders.length) {
      topFolders.push(sortedFolders[i][0])
    } else {
      topFolders.push(`folder-${i + 1}`)
    }
  }

  const folderToSlot = new Map<string, number>()
  for (let i = 0; i < 4; i++) {
    if (i < sortedFolders.length) {
      folderToSlot.set(sortedFolders[i][0], i)
    }
  }

  // Assign each dot to a folder slot (0..4) and index k within that cluster
  const dotFolder = new Int32Array(n)
  const dotK = new Int32Array(n)
  const clusterCounts = [0, 0, 0, 0, 0]

  for (let i = 0; i < n; i++) {
    const folder = scan.files[i]?.folder || 'root'
    const slot = folderToSlot.has(folder) ? folderToSlot.get(folder)! : 4
    dotFolder[i] = slot
    dotK[i] = clusterCounts[slot]
    clusterCounts[slot]++
  }

  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const size = new Float32Array(n)
  const alpha = new Float32Array(n)
  const rArr = new Uint8ClampedArray(n)
  const gArr = new Uint8ClampedArray(n)
  const bArr = new Uint8ClampedArray(n)

  const themeColors = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5]

  for (let i = 0; i < n; i++) {
    const f = dotFolder[i]
    const k = dotK[i]
    const [qx, qy] = FOLDER_CENTERS[f]

    const angle = k * 2.39996
    const radius = 0.4 * P * Math.sqrt(k + 0.5)

    x[i] = W * qx + radius * Math.cos(angle) - halfS
    y[i] = H * qy + radius * Math.sin(angle) - halfS
    size[i] = s
    alpha[i] = 1.0

    const [cr, cg, cb] = themeColors[f] ?? theme.c5
    rArr[i] = cr
    gArr[i] = cg
    bArr[i] = cb
  }

  // Create labels
  const labels: FolderLabel[] = FOLDER_CENTERS.map(([qx, qy], i) => {
    const count = clusterCounts[i]
    const name = topFolders[i]
    return {
      folder: name,
      count,
      x: W * qx,
      y: H * qy - 0.4 * P * Math.sqrt(count) - 10,
    }
  })

  // Draggable-cluster geometry. The reflow core is deliberately tighter than
  // the visual spiral so the untouched reference layout never pushes itself
  // apart; only a cluster moved by the user displaces its neighbours.
  const clusterCenters = new Float32Array(FOLDER_CENTERS.length * 2)
  const clusterRadii = new Float32Array(FOLDER_CENTERS.length)
  for (let i = 0; i < FOLDER_CENTERS.length; i++) {
    const [qx, qy] = FOLDER_CENTERS[i]
    clusterCenters[i * 2] = W * qx
    clusterCenters[i * 2 + 1] = H * qy
    clusterRadii[i] =
      clusterCounts[i] > 0 ? 0.55 * 0.4 * P * Math.sqrt(clusterCounts[i]) + s : 0
  }

  return {
    x,
    y,
    size,
    alpha,
    r: rArr,
    g: gArr,
    b: bArr,
    dotCount: n,
    cols: 24,
    rows: 10,
    labels,
    clusterOf: dotFolder,
    clusterCenters,
    clusterRadii,
  }
}
