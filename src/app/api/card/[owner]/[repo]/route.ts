import 'server-only'

import { isValidOwnerRepo } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import { buildCardSvg, cardSpecFromScan, fallbackCardSpec } from '@/features/share/card-svg'

/**
 * GET /api/card/{owner}/{repo}[.svg] — animated SVG card for README files.
 * CSS keyframes only, no scripts, prefers-color-scheme dark/light support,
 * prefers-reduced-motion fallback, under 50 KB.
 */

const CARD_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

function cardResponse(svg: string, status = 200): Response {
  return new Response(svg, {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': CARD_CACHE_CONTROL,
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
    if (!isValidOwnerRepo(owner, repoName)) {
      return cardResponse(buildCardSvg(fallbackCardSpec(owner, repoName)).svg)
    }
    const result = await getScanCached(owner, repoName)
    return cardResponse(
      result.ok
        ? buildCardSvg(cardSpecFromScan(result.scan)).svg
        : buildCardSvg(fallbackCardSpec(owner, repoName)).svg,
    )
  } catch {
    return cardResponse(buildCardSvg(fallbackCardSpec(owner, repoName)).svg)
  }
}
