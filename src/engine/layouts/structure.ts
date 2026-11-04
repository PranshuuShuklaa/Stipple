import type { Scan } from '@/lib/types/scan'
import type { LayoutTarget, ThemeColors, Viewport } from './files'
import { FOLDER_CENTERS, type FolderLabel } from './folders'
import { collectStructureGroups, type StructureGroup } from './structure-groups'
import { normalizeRepoPath, repoPathParts } from '../structure-navigation'

export interface StructureGroupLabel extends FolderLabel {
  key: string
  path: string | null
  zoomable: boolean
  isFilesHere: boolean
  slot: number
}

export interface StructureLayoutTarget extends LayoutTarget {
  labels: StructureGroupLabel[]
  groups: StructureGroup[]
  /** Group slot per dot (-1 when the dot is hidden). */
  groupOf: Int32Array
  /** Flat [x0, y0, x1, y1, ...] cluster centres in canvas px. */
  groupCenters: Float32Array
  focusPath: string
  breadcrumb: string[]
}

interface ClusterGrid {
  centers: [number, number][]
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
}

/**
 * Balanced cluster centres. Five groups keep the reference Folders positions;
 * every other count uses a grid whose last row is centred.
 */
function clusterGrid(count: number, width: number, height: number): ClusterGrid {
  if (count === 5) {
    return {
      centers: FOLDER_CENTERS.map(([x, y]) => [x, y] as [number, number]),
      cols: 3,
      rows: 2,
      cellWidth: width / 3,
      cellHeight: height / 2.4,
    }
  }

  if (count === 1) {
    return {
      centers: [[0.5, 0.5]],
      cols: 1,
      rows: 1,
      cellWidth: width * 0.55,
      cellHeight: height * 0.5,
    }
  }

  if (count === 2) {
    return {
      centers: [
        [0.3, 0.5],
        [0.7, 0.5],
      ],
      cols: 2,
      rows: 1,
      cellWidth: width * 0.32,
      cellHeight: height * 0.5,
    }
  }

  if (count === 3) {
    return {
      centers: [
        [0.3, 0.38],
        [0.7, 0.38],
        [0.5, 0.7],
      ],
      cols: 2,
      rows: 2,
      cellWidth: width * 0.32,
      cellHeight: height * 0.28,
    }
  }

  if (count === 4) {
    return {
      centers: [
        [0.3, 0.34],
        [0.7, 0.34],
        [0.3, 0.68],
        [0.7, 0.68],
      ],
      cols: 2,
      rows: 2,
      cellWidth: width * 0.32,
      cellHeight: height * 0.28,
    }
  }

  const cols = Math.min(4, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / cols)
  const centers: [number, number][] = []
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / cols)
    const col = index % cols
    const itemsInRow = Math.min(cols, count - row * cols)
    const rowOffset = (cols - itemsInRow) / 2
    const x = 0.12 + ((col + rowOffset + 0.5) / cols) * 0.76
    const y = 0.18 + ((row + 0.5) / rows) * 0.64
    centers.push([x, y])
  }

  return {
    centers,
    cols,
    rows,
    cellWidth: (width * 0.76) / cols,
    cellHeight: (height * 0.64) / rows,
  }
}

/**
 * Structure layout: one phyllotaxis spiral per next-level folder group.
 *
 * - Groups come from `collectStructureGroups`, so the labels and counts match
 *   `groupAt` exactly, including the '(files here)' and overflow buckets.
 * - Groups with more than 12 children already arrive merged by the helper.
 * - Each cluster's pitch shrinks to fit its cell, so labels never sit on dots.
 * - Dot colours cycle through c1..c5; labels carry the same facts as text.
 */
export function calculateStructureLayout(
  scan: Scan,
  viewport: Viewport,
  theme: ThemeColors,
  focusPath = '',
  poolSize?: number,
): StructureLayoutTarget {
  const normalizedFocus = normalizeRepoPath(focusPath)
  const { groups, groupOfFile } = collectStructureGroups(scan.files, normalizedFocus)
  const fileCount = scan.files.length
  const total = Math.max(fileCount, poolSize ?? fileCount)
  const width = viewport.width
  const height = viewport.height

  const x = new Float32Array(total)
  const y = new Float32Array(total)
  const size = new Float32Array(total)
  const alpha = new Float32Array(total)
  const r = new Uint8ClampedArray(total)
  const g = new Uint8ClampedArray(total)
  const b = new Uint8ClampedArray(total)
  const groupOf = new Int32Array(total).fill(-1)

  const [fgR, fgG, fgB] = theme.fg
  const centerX = width / 2 - 4
  const centerY = height / 2 - 8
  const collapsedSize = Math.max(4, Math.min(12, Math.round(width / 90)))
  const halfCollapsed = collapsedSize / 2

  if (groups.length === 0) {
    for (let index = 0; index < total; index++) {
      x[index] = centerX - halfCollapsed
      y[index] = centerY - halfCollapsed
      size[index] = collapsedSize
      alpha[index] = 0
      r[index] = fgR
      g[index] = fgG
      b[index] = fgB
    }
    return {
      x,
      y,
      size,
      alpha,
      r,
      g,
      b,
      dotCount: total,
      cols: 1,
      rows: 1,
      labels: [],
      groups,
      groupOf,
      groupCenters: new Float32Array(0),
      focusPath: normalizedFocus,
      breadcrumb: repoPathParts(normalizedFocus),
    }
  }

  const grid = clusterGrid(groups.length, width, height)
  const basePitch = Math.min(width / 25, height / 13)
  const pitches = new Float32Array(groups.length)
  const outerRadii = new Float32Array(groups.length)
  const centers = new Float32Array(groups.length * 2)

  for (let slot = 0; slot < groups.length; slot++) {
    const [fractionX, fractionY] = grid.centers[slot] ?? [0.5, 0.5]
    centers[slot * 2] = width * fractionX
    centers[slot * 2 + 1] = height * fractionY

    const count = Math.max(1, groups[slot]?.count ?? 0)
    const maxRadius = Math.min(grid.cellWidth * 0.44, grid.cellHeight * 0.4)
    pitches[slot] = Math.max(
      2,
      Math.min(basePitch, maxRadius / (0.4 * Math.sqrt(count))),
    )
    outerRadii[slot] = 0.4 * pitches[slot] * Math.sqrt(Math.max(0, count - 0.5))
  }

  const smallestPitch = Math.min(...Array.from(pitches))
  const baseDot = Math.max(6, Math.min(12, Math.round(width / 90)))
  const dotSize = Math.min(baseDot, Math.max(4, 0.8 * smallestPitch))
  const halfDot = dotSize / 2

  const themeColors = [theme.c1, theme.c2, theme.c3, theme.c4, theme.c5]
  const cursor = new Int32Array(groups.length)

  for (let index = 0; index < fileCount; index++) {
    const slot = groupOfFile[index] ?? -1
    groupOf[index] = slot
    if (slot < 0 || slot >= groups.length) {
      x[index] = centerX - halfDot
      y[index] = centerY - halfDot
      size[index] = dotSize
      alpha[index] = 0
      r[index] = fgR
      g[index] = fgG
      b[index] = fgB
      continue
    }

    const k = cursor[slot] ?? 0
    cursor[slot] = k + 1
    const angle = k * 2.39996
    const radius = 0.4 * pitches[slot] * Math.sqrt(k + 0.5)
    const originX = centers[slot * 2] ?? centerX
    const originY = centers[slot * 2 + 1] ?? centerY

    x[index] = originX + radius * Math.cos(angle) - halfDot
    y[index] = originY + radius * Math.sin(angle) - halfDot
    size[index] = dotSize
    alpha[index] = 1

    const [cr, cg, cb] = themeColors[slot % themeColors.length] ?? theme.fg
    r[index] = cr
    g[index] = cg
    b[index] = cb
  }

  for (let index = fileCount; index < total; index++) {
    x[index] = centerX - halfDot
    y[index] = centerY - halfDot
    size[index] = dotSize
    alpha[index] = 0
    r[index] = fgR
    g[index] = fgG
    b[index] = fgB
  }

  const labels: StructureGroupLabel[] = groups.map((group, slot) => ({
    folder: group.label,
    count: group.count,
    x: centers[slot * 2] ?? centerX,
    y: Math.max(64, (centers[slot * 2 + 1] ?? centerY) - outerRadii[slot] - 10),
    path: group.path,
    zoomable: group.zoomable,
    key: group.key,
    isFilesHere: group.isFilesHere,
    slot,
  }))

  return {
    x,
    y,
    size,
    alpha,
    r,
    g,
    b,
    dotCount: total,
    cols: grid.cols,
    rows: grid.rows,
    labels,
    groups,
    groupOf,
    groupCenters: centers,
    focusPath: normalizedFocus,
    breadcrumb: repoPathParts(normalizedFocus),
  }
}
