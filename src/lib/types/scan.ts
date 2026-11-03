export interface ScanFile {
  path: string
  name: string
  size: number
  language: string | null
  folder: string
  week?: number
}

export interface ScanLanguage {
  name: string
  bytes: number
}

export interface ScanActivityWeek {
  week: string // "YYYY-MM-DD"
  commits: number
}

export interface ScanContributor {
  login: string
  commits: number
}

export interface ScanHealthCheck {
  name: string
  passed: boolean
}

export interface ScanHealth {
  score: number // 0..100
  checks: ScanHealthCheck[]
}

export interface ScanFlags {
  truncated: boolean
  statsPending: boolean
}

export interface ScanPulseDay {
  date: string
  commits: number
}

export interface ScanPulse {
  days: ScanPulseDay[]
  lastCommit: string | null
  activeWeeks: number
  longestStreakWeeks: number
  busiestWeekday: number
  totalCommits: number
  topWeeksShare: number
  status: 'active' | 'quiet' | 'dormant'
  pattern: 'steady' | 'bursty' | 'occasional'
}

export interface ScanStructure {
  codeSplit: {
    source: number
    tests: number
    docs: number
    config: number
    assets: number
    other: number
  }
  largest: { path: string; size: number }[]
  maxDepth: number
  topFolders: number
}

export interface Scan {
  owner: string
  name: string
  description: string
  defaultBranch: string
  stars: number
  htmlUrl: string
  /** Archived repos still scan; the report says so instead of hiding it. */
  archived?: boolean
  files: ScanFile[]
  languages: ScanLanguage[]
  activity: ScanActivityWeek[]
  contributors: ScanContributor[]
  commits: number
  health: ScanHealth
  dependencies: string[]
  flags: ScanFlags
  pulse?: ScanPulse
  structure?: ScanStructure
  scannedAt: string
}
