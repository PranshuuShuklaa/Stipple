/**
 * Raw GitHub REST API response shapes (api.github.com).
 * Field names mirror the API exactly (snake_case), per the official
 * docs and the github/rest-api-description OpenAPI spec.
 */

export interface RawRepoOwner {
  login: string
}

export interface RawRepo {
  name: string
  full_name: string
  description: string | null
  default_branch: string
  stargazers_count: number
  html_url: string
  archived: boolean
  pushed_at: string | null
  owner: RawRepoOwner
  license: {
    key: string
    name: string
    spdx_id: string | null
  } | null
}

export interface RawTreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size: number | null
  url: string
}

export interface RawTree {
  sha: string
  truncated: boolean
  tree: RawTreeEntry[]
}

export type RawLanguages = Record<string, number>

export interface RawCommitActivityWeek {
  days: number[]
  total: number
  week: number
}

export interface RawContributorStatsWeek {
  w: number
  a: number
  d: number
  c: number
}

export interface RawContributorStats {
  author: {
    login: string
  } | null
  total: number
  weeks: RawContributorStatsWeek[]
}

/** Each community health file is: named file object, or null when missing. */
export type RawCommunityFile = {
  key: string
  name: string | null
  url: string | null
} | null

export interface RawCommunityProfile {
  health_percentage: number
  description: string | null
  documentation: string | null
  files: {
    code_of_conduct: RawCommunityFile
    code_of_conduct_file: RawCommunityFile
    license: RawCommunityFile
    contributing: RawCommunityFile
    readme: RawCommunityFile
    issue_template: RawCommunityFile
    pull_request_template: RawCommunityFile
  }
  updated_at: string | null
}

export interface RawContentFile {
  type: string
  name: string
  /** base64 when encoding is "base64"; null for files over 1 MB */
  content: string | null
  encoding: string | null
}

export interface RawApiErrorBody {
  message?: string
}
