import type { Scan, ScanFile, ScanLanguage, ScanActivityWeek, ScanHealthCheck } from '@/lib/types/scan'

const LANGUAGE_SETS: [string, string, string, string, string][] = [
  ['TypeScript', 'CSS', 'JavaScript', 'HTML', 'Other'],
  ['Python', 'Jupyter', 'Shell', 'Dockerfile', 'Other'],
  ['Rust', 'TOML', 'Shell', 'Markdown', 'Other'],
  ['Java', 'Kotlin', 'XML', 'Gradle', 'Other'],
]

const DEPENDENCY_SETS: string[][] = [
  ['react', 'vite', 'tailwindcss', 'framer-motion', 'd3', 'zod', 'axios', 'lodash'],
  ['numpy', 'pandas', 'flask', 'requests', 'pytest', 'scipy', 'pydantic', 'click'],
  ['serde', 'tokio', 'clap', 'anyhow', 'regex', 'rayon', 'tracing', 'reqwest'],
  ['spring-boot', 'junit', 'lombok', 'jackson', 'guava', 'slf4j', 'mockito', 'hibernate'],
]

export const FIXTURE_FOLDERS = ['src/components', 'src/lib', 'src/hooks', 'public', 'tests'] as const
export const FIXTURE_FOLDER_WEIGHTS = [98, 52, 30, 38, 22] as const
const EXTENSIONS = ['tsx', 'ts', 'ts', 'svg', 'test.ts'] as const
const WORDS = ['Card', 'Nav', 'index', 'utils', 'Chart', 'store', 'Modal', 'theme', 'api', 'Form', 'Grid', 'parse'] as const

export const FIXTURE_FILE_COUNT = 240
export const FIXTURE_GRID_COLS = 24
export const FIXTURE_GRID_ROWS = 10
export const FIXTURE_ACTIVITY_WEEKS = 16

/**
 * Deterministic mulberry32 PRNG (from reference/repolens-reference.html).
 */
export function createPrng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 32-bit FNV-1a hash function for strings.
 */
export function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Creates a seeded deterministic Scan fixture (240 files, 5 languages, 16 weeks, 5 folders).
 */
export function createScanFixture(seedOrRepo: number | string = 'stipple/stipple'): Scan {
  const seed = typeof seedOrRepo === 'string' ? hashString(seedOrRepo) : seedOrRepo
  const rng = createPrng(seed)

  const shuffle = <T>(array: T[]): T[] => {
    const arr = [...array]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const temp = arr[i]
      arr[i] = arr[j]
      arr[j] = temp
    }
    return arr
  }

  const langNames = LANGUAGE_SETS[seed % LANGUAGE_SETS.length]
  const q = [0, 1, 2, 3, 4].map((i) => rng() * rng() + 0.04 + (i ? 0 : 0.35))
  const qSum = q.reduce((acc, curr) => acc + curr, 0)

  const langCounts = q.map((x) => Math.round((x / qSum) * FIXTURE_FILE_COUNT))
  const initialSum = langCounts.reduce((acc, curr) => acc + curr, 0)
  langCounts[0] += FIXTURE_FILE_COUNT - initialSum

  const languageAssignments = shuffle(
    langCounts.flatMap((count, index) => Array<number>(count).fill(index))
  )

  const folderAssignments = shuffle(
    FIXTURE_FOLDER_WEIGHTS.flatMap((weight, index) => Array<number>(weight).fill(index))
  )

  const weekCounts = new Array<number>(FIXTURE_ACTIVITY_WEEKS).fill(0)

  const files: ScanFile[] = []
  for (let i = 0; i < FIXTURE_FILE_COUNT; i++) {
    const langIndex = languageAssignments[i]
    const folderIndex = folderAssignments[i]
    // week calculation matching reference: Math.floor(15.99 * Math.sqrt(r()))
    const week = Math.floor(15.99 * Math.sqrt(rng()))
    weekCounts[week]++

    const folder = FIXTURE_FOLDERS[folderIndex]
    const ext = EXENSIONS[folderIndex] ?? 'ts'
    const word = WORDS[Math.floor(rng() * WORDS.length)]
    const fileName = `${word}.${ext}`
    const path = `${folder}/${fileName}`
    const size = Math.floor(rng() * 40000) + 500

    files.push({
      path,
      name: fileName,
      size,
      language: langNames[langIndex] ?? 'Other',
      folder,
    })
  }

  const languages: ScanLanguage[] = langNames.map((name, index) => ({
    name,
    bytes: Math.round(langCounts[index] * 18400),
  }))

  const baseDate = new Date('2026-10-19T00:00:00Z')
  const activity: ScanActivityWeek[] = weekCounts.map((count, index) => {
    const weekDate = new Date(baseDate.getTime() - (15 - index) * 7 * 24 * 60 * 60 * 1000)
    return {
      week: weekDate.toISOString().split('T')[0],
      commits: Math.max(1, Math.round(count * 4.2)),
    }
  })

  const checkNames = [
    'README',
    'License',
    'Tests',
    'CI workflow',
    'Contributing guide',
    'Commit in the last 30 days',
  ]
  const checks: ScanHealthCheck[] = checkNames.map((name) => ({
    name,
    passed: rng() > 0.3,
  }))
  const passedCount = checks.filter((c) => c.passed).length
  const healthScore = Math.round((passedCount / checks.length) * 100)

  const depOptions = DEPENDENCY_SETS[seed % DEPENDENCY_SETS.length]
  const dependencies = depOptions.filter(() => rng() > 0.25)

  const totalCommits = 300 + Math.floor(rng() * 2100)
  const peopleCount = 2 + Math.floor(rng() * 10)
  const contributors = Array.from({ length: peopleCount }, (_, i) => ({
    login: i === 0 ? 'octocat' : `contributor-${i + 1}`,
    commits: Math.max(1, Math.round((totalCommits / peopleCount) * (1 - i / peopleCount))),
  }))

  const repoParts = typeof seedOrRepo === 'string' ? seedOrRepo.split('/') : ['stipple', 'stipple']
  const owner = repoParts[0] || 'stipple'
  const name = repoParts[1] || 'stipple'

  return {
    owner,
    name,
    description: 'Deterministic 240-file fixture for the Stipple dot engine.',
    defaultBranch: 'main',
    stars: 128,
    htmlUrl: `https://github.com/${owner}/${name}`,
    files,
    languages,
    activity,
    contributors,
    commits: totalCommits,
    health: {
      score: healthScore,
      checks,
    },
    dependencies,
    flags: {
      truncated: false,
      statsPending: false,
    },
    scannedAt: new Date('2026-10-23T00:00:00Z').toISOString(),
  }
}
const EXENSIONS = EXTENSIONS
