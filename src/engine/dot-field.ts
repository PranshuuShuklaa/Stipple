import type { Scan, ScanFile } from '@/lib/types/scan'

/**
 * One dot = one file until 2,500 files (AGENTS.md). Above that the files are
 * split into strata of consecutive indices and each dot stands for N files,
 * weighted by size: the representative file is the largest of its stratum and
 * the dot's size is the summed size of the stratum.
 */

export const HARD_DOT_CAP = 2500

export interface DotField {
  scan: Scan
  dotCount: number
  totalFiles: number
  filesPerDot: number
}

export function buildDotField(scan: Scan, maxDots: number): DotField {
  const total = scan.files.length
  const dotCount = Math.max(0, Math.min(total, maxDots))

  if (dotCount === total) {
    return { scan, dotCount, totalFiles: total, filesPerDot: 1 }
  }

  if (dotCount === 0) {
    return { scan: { ...scan, files: [] }, dotCount: 0, totalFiles: 0, filesPerDot: 1 }
  }

  const representatives = new Array<ScanFile>(dotCount)
  for (let j = 0; j < dotCount; j++) {
    const start = Math.floor((j * total) / dotCount)
    const end = Math.floor(((j + 1) * total) / dotCount)

    let best = scan.files[start]
    let sizeSum = 0
    for (let i = start; i < end; i++) {
      const file = scan.files[i]
      if (file.size > best.size) best = file
      sizeSum += file.size
    }

    representatives[j] = { ...best, size: sizeSum }
  }

  return {
    scan: { ...scan, files: representatives },
    dotCount,
    totalFiles: total,
    filesPerDot: Math.ceil(total / dotCount),
  }
}
