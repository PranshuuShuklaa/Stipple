import 'server-only'

import { InvalidInputError } from '@/server/github/errors'
import { OWNER_RE, REPO_RE } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import { errorToResponse } from '@/server/scan/error-response'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const { owner, repo } = await params

  const validOwner = owner.length <= 39 && OWNER_RE.test(owner)
  // GitHub names are case-insensitive; keep the caller's casing for display.
  const validRepo = repo.length <= 100 && REPO_RE.test(repo) && repo !== '.' && repo !== '..'
  if (!validOwner || !validRepo) return errorToResponse(new InvalidInputError())

  try {
    const result = await getScanCached(owner, repo)
    if (!result.ok) return errorToResponse(result.error)
    return Response.json(result.scan, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorToResponse(error)
  }
}
