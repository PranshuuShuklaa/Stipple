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
  color?: string
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

export interface Scan {
  owner: string
  name: string
  description: string
  defaultBranch: string
  stars: number
  htmlUrl: string
  files: ScanFile[]
  languages: ScanLanguage[]
  activity: ScanActivityWeek[]
  contributors: ScanContributor[]
  commits: number
  health: ScanHealth
  dependencies: string[]
  flags: ScanFlags
  scannedAt: string
}
