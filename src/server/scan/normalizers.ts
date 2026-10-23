import 'server-only'

import type {
  RawCommitActivityWeek,
  RawCommunityProfile,
  RawContributorStats,
  RawLanguages,
  RawRepo,
  RawTreeEntry,
} from '@/server/github/raw-types'
import type {
  ScanActivityWeek,
  ScanContributor,
  ScanFile,
  ScanHealth,
  ScanLanguage,
} from '@/lib/types/scan'

/**
 * Pure normalizers: raw GitHub API shapes to the one Scan type.
 * Nothing here invents numbers — missing data stays missing.
 */

export const ACTIVITY_WEEKS = 16

/** Root-level dependency manifests we read, in a stable order. */
export const MANIFEST_FILES = ['Cargo.toml', 'package.json', 'pom.xml', 'requirements.txt'] as const

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  bash: 'Shell', c: 'C', cc: 'C++', cjs: 'JavaScript', cpp: 'C++', cs: 'C#', css: 'CSS', cts: 'TypeScript',
  cxx: 'C++', dart: 'Dart', go: 'Go', h: 'C', hpp: 'C++', hh: 'C++', htm: 'HTML', html: 'HTML',
  ipynb: 'Jupyter Notebook', java: 'Java', js: 'JavaScript', json: 'JSON', jsx: 'JavaScript',
  kt: 'Kotlin', mjs: 'JavaScript', mts: 'TypeScript', php: 'PHP', py: 'Python', rb: 'Ruby',
  rs: 'Rust', sass: 'SCSS', scala: 'Scala', scss: 'SCSS', sh: 'Shell', svelte: 'Svelte',
  swift: 'Swift', sql: 'SQL', ts: 'TypeScript', tsx: 'TypeScript', toml: 'TOML', vue: 'Vue', yml: 'YAML', yaml: 'YAML',
}

/**
 * Builds a resolver: file name to the repo's own language name (exact
 * spelling from the languages endpoint), or null when the extension is
 * unmapped or the language is not in the repo.
 */
export function createLanguageResolver(languages: RawLanguages): (fileName: string) => string | null {
  const byLower: Record<string, string> = {}
  for (const name of Object.keys(languages)) byLower[name.toLowerCase()] = name

  return (fileName: string) => {
    const dot = fileName.lastIndexOf('.')
    if (dot <= 0) return null
    const guess = EXTENSION_TO_LANGUAGE[fileName.slice(dot + 1).toLowerCase()]
    if (!guess) return null
    return byLower[guess.toLowerCase()] ?? null
  }
}

function folderOf(path: string): string {
  const slash = path.indexOf('/')
  return slash === -1 ? '(root)' : path.slice(0, slash)
}

/** Blobs only (no trees and no submodule commits). */
export function filesFromTree(entries: RawTreeEntry[], languageFor: (fileName: string) => string | null): ScanFile[] {
  const folders = new Set(entries.filter((entry) => entry.type === 'tree').map((entry) => entry.path))
  return entries
    .filter((entry) => entry.type === 'blob' && entry.path !== '')
    .filter((entry) => !folders.has(entry.path))
    .map((entry) => ({
      path: entry.path,
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      size: entry.size ?? 0,
      language: languageFor(entry.path),
      folder: folderOf(entry.path),
    }))
}

/** Sorted by bytes, descending; zero-byte languages dropped. */
export function languagesFromRaw(raw: RawLanguages): ScanLanguage[] {
  return Object.entries(raw)
    .filter(([, bytes]) => Number.isFinite(bytes) && bytes > 0)
    .map(([name, bytes]) => ({ name, bytes: Math.floor(bytes) }))
    .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
}

function weekIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

/**
 * The last 16 weeks, oldest first, as ISO "YYYY-MM-DD" Monday weeks.
 * Weeks with zero commits are kept — the activity view shows them.
 * A `week` of 0 stands for "before tracking" and is dropped.
 */
export function activityFromRaw(weeks: RawCommitActivityWeek[]): ScanActivityWeek[] {
  return weeks
    .filter((week) => week.week > 0)
    .slice()
    .sort((a, b) => a.week - b.week)
    .slice(-ACTIVITY_WEEKS)
    .map((week) => ({ week: weekIso(week.week), commits: Math.max(0, Math.floor(week.total)) }))
}

/** Named contributors only, strongest first. Anonymous rows (null author) are dropped. */
export function contributorsFromRaw(members: RawContributorStats[]): ScanContributor[] {
  return members
    .filter((member) => member.author !== null && typeof member.author.login === 'string')
    .map(({ author, total }) => ({ login: author!.login, commits: Math.max(0, Math.floor(total)) }))
    .sort((a, b) => b.commits - a.commits || a.login.localeCompare(b.login))
}

/** Lifetime commit total from the contributor statistics. */
export function commitsTotalFromRaw(members: RawContributorStats[]): number {
  return members.reduce((sum, member) => sum + Math.max(0, Math.floor(member.total)), 0)
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Production dependencies only (devDependencies are not what the repo ships). */
export function parsePackageJson(text: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
  const body = parsed as Record<string, unknown>
  return collectObjectKeys(body['dependencies'], body['optionalDependencies'])
}

function collectObjectKeys(...sections: unknown[]): string[] {
  const names: string[] = []
  for (const section of sections) {
    if (typeof section !== 'object' || section === null || Array.isArray(section)) continue
    for (const key of Object.keys(section)) names.push(key)
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export function parseRequirementsTxt(text: string): string[] {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const stripped = line.trim()
    if (stripped === '' || stripped.startsWith('#')) continue
    if (stripped.startsWith('-')) continue // options like -e or -r, not packages
    if (/^https?:\/\//i.test(stripped)) continue // direct links are not named packages
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(line)
    if (match) names.push(match[1])
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export function parseCargoToml(text: string): string[] {
  const names: string[] = []
  let inDependencies = false
  for (const line of text.split(/\r?\n/)) {
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (section) {
      inDependencies = section[1].trim() === 'dependencies'
      continue
    }
    if (!inDependencies) continue
    const stripped = line.replace(/#.*$/, '').trim()
    if (stripped === '') continue
    const key = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(stripped)
    if (key) names.push(key[1])
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export function parsePomXml(text: string): string[] {
  const names: string[] = []
  const blocks = text.match(/<dependency[^>]*>([\s\S]*?)<\/dependency>/g) ?? []
  for (const block of blocks) {
    const groupId = /<groupId>([^<]*)<\/groupId>/.exec(block)
    const artifactId = /<artifactId>([^<]*)<\/artifactId>/.exec(block)
    if (!groupId || !artifactId) continue
    names.push(`${unescapeXml(groupId[1].trim())}:${unescapeXml(artifactId[1].trim())}`)
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

/** Parses whichever manifest format a file name stands for. */
export function parseDependencies(fileName: string, text: string): string[] {
  switch (fileName.toLowerCase()) {
    case 'package.json':
      return parsePackageJson(text)
    case 'requirements.txt':
      return parseRequirementsTxt(text)
    case 'cargo.toml':
      return parseCargoToml(text)
    case 'pom.xml':
      return parsePomXml(text)
    default:
      return []
  }
}

export interface CommunityHealthFiles {
  readme: boolean
  contributing: boolean
  license: boolean
}

function communityHealthFiles(profile: RawCommunityProfile | null): CommunityHealthFiles | null {
  if (!profile?.files) return null
  const files = profile.files
  const present = (file: unknown): boolean => file !== null && file !== undefined
  return {
    readme: present(files['readme']),
    contributing: present(files['contributing']),
    license: present(files['license']),
  }
}

export interface HealthInputs {
  /** Each root blob `path` from the tree. */
  paths: string[]
  pushedAtIso: string | null
  repoLicense: RawRepo['license']
  community: RawCommunityProfile | null
  now: Date
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export const HEALTH_CHECK_NAMES = [
  'README',
  'License',
  'Tests',
  'CI workflow',
  'Contributing guide',
  'Commit in the last 30 days',
] as const

/**
 * Six checks; the score is the rounded share of checks passed.
 * README/License/Contributing come from the community profile with a
 * root-file fallback, Tests and CI from the tree, recency from pushed_at.
 */
export function healthFrom(inputs: HealthInputs): ScanHealth {
  const { paths, pushedAtIso, repoLicense, community, now } = inputs
  const files = communityHealthFiles(community)
  const hasRoot = (pattern: RegExp): boolean => paths.some((path) => pattern.test(path))

  const readme = (files?.readme ?? false) || hasRoot(/^readme(\.[^/\n]+)?$/i)
  const license = repoLicense != null || files?.license === true
  const tests =
    hasRoot(/(^|\/)(test|tests|specs?)(\/)/i) || paths.some((path) => /\.(test|spec)\./i.test(path))
  const ci = paths.some(
    (path) => path.startsWith('.github/workflows/') && /\.(yml|yaml)$/i.test(path),
  )
  const contributing = (files?.contributing ?? false) || hasRoot(/^contributing(\.[^/\n]+)?$/i)
  const pushedAt = pushedAtIso === null ? null : new Date(pushedAtIso)
  const recentCommit = pushedAt !== null && !Number.isNaN(pushedAt.getTime()) && now.getTime() - pushedAt.getTime() <= THIRTY_DAYS_MS

  const passed: boolean[] = [readme, license, tests, ci, contributing, recentCommit]
  const score = Math.round((passed.filter(Boolean).length / HEALTH_CHECK_NAMES.length) * 100)
  return {
    score,
    checks: passed.map((value, index) => ({ name: HEALTH_CHECK_NAMES[index], passed: value })),
  }
}
