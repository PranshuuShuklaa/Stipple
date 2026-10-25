import 'server-only'

import { isValidOwnerRepo } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import { buildBadgeSvg } from '@/features/share/badge-svg'

/**
 * GET /api/badge/{owner}/{repo}[.svg] — the health score badge, colored by
 * band, AA on both segments. Invalid repos, scan failures and unknown
 * errors never crash: they get the designed neutral fallback badge.
 */

const BADGE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

function badgeResponse(svg: string, status = 200): Response {
  return new Response(svg, {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': BADGE_CACHE_CONTROL,
    },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const { owner, repo } = await params
  const repoName = repo.replace(/\.svg$/i, '')

  try {
    // GitHub names are case-insensitive; keep the caller's casing for display.
    if (!isValidOwnerRepo(owner, repoName)) {
      return badgeResponse(buildBadgeSvg({ owner, repo: repoName, score: null }).svg)
    }
    const result = await getScanCached(owner, repoName)
    return badgeResponse(
      result.ok
        ? buildBadgeSvg({ owner: result.scan.owner, repo: result.scan.name, score: result.scan.health.score }).svg
        : buildBadgeSvg({ owner, repo: repoName, score: null }).svg,
    )
  } catch {
    return badgeResponse(buildBadgeSvg({ owner, repo: repoName, score: null }).svg)
  }
}
