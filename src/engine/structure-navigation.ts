/**
 * Pure helpers behind the Structure explorer's navigation. No React, no DOM.
 *
 * A "repo path" is always a forward-slash path relative to the repository
 * root, with no leading or trailing slash. The empty string is the root.
 */

export interface StructureFocusState {
  focusPath: string
  breadcrumb: string[]
}

/** Collapses repeated slashes, drops '.', and resolves '..' by popping. */
export function normalizeRepoPath(path: string): string {
  if (!path) return ''
  const parts = path.replace(/\\/g, '/').split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join('/')
}

export function repoPathParts(path: string): string[] {
  const normalized = normalizeRepoPath(path)
  return normalized === '' ? [] : normalized.split('/')
}

export function parentRepoPath(path: string): string {
  const parts = repoPathParts(path)
  parts.pop()
  return parts.join('/')
}

/** True when `path` is `ancestor` itself or sits below it. */
export function isRepoPathWithin(path: string, ancestor: string): boolean {
  const normalizedPath = normalizeRepoPath(path)
  const normalizedAncestor = normalizeRepoPath(ancestor)
  if (normalizedAncestor === '') return true
  return (
    normalizedPath === normalizedAncestor ||
    normalizedPath.startsWith(`${normalizedAncestor}/`)
  )
}

/** Cycles a focus index with wrap-around; -1 means "no focus yet". */
export function cycleFocusIndex(
  current: number,
  count: number,
  direction: 1 | -1,
): number {
  if (count <= 0) return -1
  if (current < 0 || current >= count) return direction === 1 ? 0 : count - 1
  return (current + direction + count) % count
}

/**
 * Zoom stagger: every dot inherits the distance rank of its cluster from the
 * clicked cluster (or the stage centre when going up). The clicked cluster
 * starts at 0 ms, the nearest cluster at `staggerMs`, and so on.
 */
export function structureStaggerDelays(
  groupOf: Int32Array,
  groupCenters: Float32Array,
  dotCount: number,
  originX: number,
  originY: number,
  staggerMs = 4,
): Float32Array {
  const delays = new Float32Array(Math.max(0, dotCount))
  const groupCount = Math.floor(groupCenters.length / 2)
  if (groupCount === 0) return delays

  const order = Array.from({ length: groupCount }, (_, slot) => slot)
  const distance = new Float32Array(groupCount)
  for (let slot = 0; slot < groupCount; slot++) {
    const dx = (groupCenters[slot * 2] ?? 0) - originX
    const dy = (groupCenters[slot * 2 + 1] ?? 0) - originY
    distance[slot] = dx * dx + dy * dy
  }
  order.sort((a, b) => (distance[a] ?? 0) - (distance[b] ?? 0) || a - b)

  const rank = new Int32Array(groupCount).fill(-1)
  for (let i = 0; i < order.length; i++) {
    rank[order[i] ?? 0] = i
  }

  for (let i = 0; i < delays.length; i++) {
    const slot = groupOf[i] ?? -1
    if (slot < 0 || slot >= groupCount) continue
    delays[i] = Math.max(0, rank[slot] ?? 0) * staggerMs
  }
  return delays
}
