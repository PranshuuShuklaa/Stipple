import 'server-only'

import { InvalidInputError } from '@/server/github/errors'
import { isValidOwnerRepo } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import { errorToResponse } from '@/server/scan/error-response'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const { owner, repo } = await params

  // GitHub names are case-insensitive; keep the caller's casing for display.
  if (!isValidOwnerRepo(owner, repo)) return errorToResponse(new InvalidInputError())

  try {
    const result = await getScanCached(owner, repo)
    if (!result.ok) return errorToResponse(result.error)
    return Response.json(result.scan, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorToResponse(error)
  }
}
