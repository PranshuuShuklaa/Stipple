import type { Scan } from '@/lib/types/scan'
import type { LayoutName } from '@/engine/renderer'

/**
 * Pure helpers that turn a Scan into the four story steps' headlines and
 * bodies (REFERENCE.md: "Step headlines come from data"). No DOM, no
 * React, no server imports — unit tested in
 * tests/unit/step-headlines.test.ts.
 */

export interface ReportStep {
  layout: LayoutName
  headline: string
  body: string
}

export interface TopLanguage {
  name: string
  pct: number
}

export interface BusiestWeek {
  week: string
  commits: number
  weeksAgo: number
}

export interface BiggestFolder {
  folder: string
  count: number
}

/** Thousands-separated integer, identical in tests and browsers. */
export function formatCount(value: number): string {
  return String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const ROOT_FOLDER = '(root)'

function weeksAgoLabel(weeksAgo: number): string {
  if (weeksAgo === 0) return 'this week'
  if (weeksAgo === 1) return '1 week ago'
  return `${weeksAgo} weeks ago`
}

function dotCountCap(totalFiles: number, cap = 2500): number {
  return Math.min(totalFiles, cap)
}

/** One dot = one file until the cap; above it one dot stands for several. */
export function filesPerDot(totalFiles: number): number {
  if (totalFiles <= 0) return 1
  return Math.ceil(totalFiles / dotCountCap(totalFiles))
}

/* --- Files step --- */

export function filesHeadline(scan: Scan): string {
  const total = scan.files.length
  if (total === 0) return 'No files were counted.'
  const noun = total === 1 ? 'file' : 'files'
  if (scan.flags.truncated) return `First ${formatCount(total)} ${noun}.`
  return `${formatCount(total)} ${noun}.`
}

export function filesBody(scan: Scan): string {
  const total = scan.files.length
  if (total === 0) return 'The tree arrived without files, so there is nothing to draw yet.'
  if (scan.flags.truncated) {
    return `GitHub cut the file list short. This scan covers the first ${formatCount(total)} files it returned.`
  }
  if (filesPerDot(total) > 1) {
    return 'Repos this size show one dot for several files. The legend on the stage says how many.'
  }
  return 'Every file is one dot. The grid spreads out from the center of the stage.'
}

/* --- Languages step --- */

export function topLanguage(scan: Scan): TopLanguage | null {
  const languages = scan.languages
  if (languages.length === 0) return null
  let totalBytes = 0
  for (const language of languages) {
    if (Number.isFinite(language.bytes) && language.bytes > 0) totalBytes += language.bytes
  }
  if (totalBytes <= 0) return null
  const top = languages[0]
  const pct = Math.round((top.bytes / totalBytes) * 100)
  return {
    name: top.name,
    pct: Math.min(100, Math.max(0, pct)),
  }
}

export function languagesHeadline(scan: Scan): string {
  const top = topLanguage(scan)
  if (!top) return 'Language data is missing.'
  if (top.pct === 0) return `${top.name} leads, under 1%.`
  return `${top.pct}% ${top.name}.`
}

export function languagesBody(scan: Scan): string {
  const top = topLanguage(scan)
  if (!top) return 'GitHub returned no language bytes for this repo.'
  const next = scan.languages[1]
  if (!next) return `Dots sort into the language bar. ${top.name} is the only counted language.`
  return `Dots sort into the language bar. ${top.name} leads, then ${next.name}.`
}

/* --- Activity step --- */

/**
 * The strongest week of the last 16, most recent first on ties. The
 * latest week in the list counts as weeksAgo 0, so repos younger than 16
 * weeks still report honest numbers.
 */
export function findBusiestWeek(scan: Scan): BusiestWeek | null {
  if (scan.flags.statsPending) return null
  const weeks = scan.activity
  if (weeks.length === 0) return null
  let bestIndex = -1
  let bestCommits = -1
  let bestWeek = ''
  for (let index = 0; index < weeks.length; index++) {
    const week = weeks[index]
    const commits = week.commits
    const moreRecent = week.week > bestWeek
    if (commits > bestCommits || (commits === bestCommits && moreRecent)) {
      bestCommits = commits
      bestIndex = index
      bestWeek = week.week
    }
  }
  if (bestIndex < 0 || bestCommits <= 0) return null
  return {
    week: weeks[bestIndex].week,
    commits: bestCommits,
    weeksAgo: weeks.length - 1 - bestIndex,
  }
}

export function activityHeadline(scan: Scan): string {
  if (scan.flags.statsPending) return 'Commit stats are still computing.'
  const weeks = scan.activity
  if (weeks.length === 0) return 'No weekly commits recorded.'
  const peak = findBusiestWeek(scan)
  if (!peak) return 'No commits in 16 weeks.'
  return `Busiest week: ${weeksAgoLabel(peak.weeksAgo)}.`
}

export function activityBody(scan: Scan): string {
  if (scan.flags.statsPending) {
    return "GitHub hasn't finished counting the weekly commits. The columns stay empty until the numbers are real."
  }
  const weeks = scan.activity
  if (weeks.length === 0) return 'GitHub returned no weekly commit data for this repo.'
  const peak = findBusiestWeek(scan)
  if (!peak) return 'No commits landed in the window shown, so every column is empty.'
  return `${formatCount(peak.commits)} commits landed that week. Brighter means newer.`
}

/* --- Folders step --- */

/**
 * The top-level folder with the most files, uppermost alphabetically on
 * ties. The synthetic root bucket is never the answer here; all-root
 * repos report null.
 */
export function biggestFolder(scan: Scan): BiggestFolder | null {
  const counts = new Map<string, number>()
  for (const file of scan.files) {
    const folder = file.folder || ROOT_FOLDER
    if (folder === ROOT_FOLDER) continue
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  let winner: { folder: string; count: number } | null = null
  for (const [folder, count] of counts) {
    if (!winner || count > winner.count || (count === winner.count && folder.localeCompare(winner.folder) < 0)) {
      winner = { folder, count }
    }
  }
  return winner
}

export function foldersHeadline(scan: Scan): string {
  const winner = biggestFolder(scan)
  if (!winner) return 'All files sit in the repo root.'
  return `${winner.folder} is the biggest folder.`
}

export function foldersBody(scan: Scan): string {
  const winner = biggestFolder(scan)
  if (!winner) return 'No top-level folders to cluster for this repo.'
  const total = scan.files.length
  const folderCount = new Set(
    scan.files
      .map((file) => file.folder || ROOT_FOLDER)
      .filter((folder) => folder !== ROOT_FOLDER),
  ).size
  if (folderCount > 5) {
    return `${formatCount(winner.count)} of ${formatCount(total)} files live there. The last cluster gathers the smaller top-level folders.`
  }
  return `${formatCount(winner.count)} of ${formatCount(total)} files live there. The other clusters are top-level folders too.`
}

/* --- The four steps in story order --- */

export function buildReportSteps(scan: Scan): ReportStep[] {
  return [
    { layout: 'files', headline: filesHeadline(scan), body: filesBody(scan) },
    { layout: 'languages', headline: languagesHeadline(scan), body: languagesBody(scan) },
    { layout: 'activity', headline: activityHeadline(scan), body: activityBody(scan) },
    { layout: 'folders', headline: foldersHeadline(scan), body: foldersBody(scan) },
  ]
}
