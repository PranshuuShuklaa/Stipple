/**
 * Parses the repo input field. Accepts `owner/repo` or a GitHub URL
 * (`https://github.com/owner/repo`, with or without scheme, query,
 * fragment, extra path segments).
 * Returns null for anything that is not clearly a repo.
 *
 * Pure and shared: used by the scan form (client) and the API route (server).
 */

export interface ParsedRepo {
  owner: string
  repo: string
}

const GITHUB_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com(?=\/|$)/i

/** GitHub owner names: letters and digits, single hyphens inside. */
export const OWNER_RE = /^[A-Za-z0-9](?:-?[A-Za-z0-9])*$/ // 39 max, checked in code
/** GitHub repo names: letters, digits, dots, underscores, hyphens. */
export const REPO_RE = /^[A-Za-z0-9._-]+$/

export function parseRepoInput(raw: string): ParsedRepo | null {
  const value = raw.trim()
  if (value.length === 0 || value.length > 2048) return null

  let owner: string | undefined
  let repo: string | undefined

  const urlMatch = GITHUB_URL_PREFIX.exec(value)
  if (urlMatch) {
    let path = value.slice(urlMatch[0].length)
    path = path.replace(/[?#].*$/, '')
    path = path.replace(/\/+$/, '')
    path = path.replace(/^\//, '')

    let segments: string[]
    try {
      segments = decodeURIComponent(path).split('/')
    } catch {
      return null
    }

    if (segments.length < 2) return null
    owner = segments[0]
    repo = segments[1]
  } else {
    const parts = value.split('/')
    if (parts.length !== 2) return null
    owner = parts[0]
    repo = parts[1]
  }

  if (!owner || !repo) return null
  if (owner.length > 39) return null
  if (repo.length > 100) return null
  if (!OWNER_RE.test(owner)) return null
  if (repo === '.' || repo === '..') return null
  if (!REPO_RE.test(repo)) return null

  return { owner, repo }
}
