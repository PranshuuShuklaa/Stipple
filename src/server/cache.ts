import 'server-only'

import { cacheLife } from 'next/cache'
import type { ApiErrorCode } from '@/server/github/errors'
import type { Scan } from '@/lib/types/scan'
import { buildScan } from '@/server/scan/build-scan'
import { knownApiErrorOf } from '@/server/scan/error-response'

/**
 * The one cache behind every consumer of scan data (the /api/repo route
 * now, the report page, badges and OG images later). One function, so
 * every caller shares one cache entry per repo.
 *
 * This project runs Next 16 with `cacheComponents: true`; the documented
 * model there is the "use cache" directive instead of fetch options like
 * `next: { revalidate }` (the docs call that the "without Cache
 * Components" model). revalidate = 3600 keeps an hour of freshness.
 *
 * The cached scope RETURNS a plain result instead of throwing: errors
 * crossing the cache boundary are digested by Next and lose their
 * identity, so designed codes travel as data. The route does the
 * throw/mapping after the boundary.
 */

const SCAN_STALE_SECONDS = 300
export const SCAN_REVALIDATE_SECONDS = 3600
const SCAN_EXPIRE_SECONDS = 86_400

export interface DesignedErrorRecord {
  code: ApiErrorCode
  message: string
  resetAt?: string
}

export type ScanResult = { ok: true; scan: Scan } | { ok: false; error: DesignedErrorRecord }

export async function getScanCached(owner: string, repo: string): Promise<ScanResult> {
  'use cache'
  cacheLife({ stale: SCAN_STALE_SECONDS, revalidate: SCAN_REVALIDATE_SECONDS, expire: SCAN_EXPIRE_SECONDS })
  try {
    return { ok: true, scan: await buildScan(owner, repo) }
  } catch (error) {
    const known = knownApiErrorOf(error)
    if (known) {
      const resetAt = (known as { resetAt?: string }).resetAt
      return {
        ok: false,
        error: typeof resetAt === 'string' ? { code: known.code, message: known.message, resetAt } : { code: known.code, message: known.message },
      }
    }
    // Unknown failures read like any other upstream error through the
    // route's GENERIC_MESSAGE copy, so the response stays coherent.
    return { ok: false, error: { code: 'upstream', message: 'GitHub is having trouble right now. Try again in a few minutes.' } }
  }
}
