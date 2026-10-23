import 'server-only'

import { cacheLife } from 'next/cache'
import { runScanWithFlight, type ScanResult } from '@/server/scan/scan-flight'

/**
 * The one cache behind every consumer of scan data (the /api/repo route,
 * the report page, badges and OG images). One function, so every caller
 * shares one cache entry per repo — and one build, through the scan
 * flight (src/server/scan/scan-flight.ts).
 *
 * This project runs Next 16 with `cacheComponents: true`; the documented
 * model there is the "use cache" directive instead of fetch options like
 * `next: { revalidate }` (the docs call that the "without Cache
 * Components" model). revalidate = 3600 keeps an hour of freshness.
 *
 * The cached scope RETURNS a plain result instead of throwing: errors
 * crossing the cache boundary are digested by Next and lose their
 * identity, so designed codes travel as data. The mapping lives in the
 * scan flight, which this scope wraps.
 */

const SCAN_STALE_SECONDS = 300
export const SCAN_REVALIDATE_SECONDS = 3600
const SCAN_EXPIRE_SECONDS = 86_400

export type { DesignedErrorRecord, ScanResult } from '@/server/scan/scan-flight'

export async function getScanCached(owner: string, repo: string): Promise<ScanResult> {
  'use cache'
  cacheLife({ stale: SCAN_STALE_SECONDS, revalidate: SCAN_REVALIDATE_SECONDS, expire: SCAN_EXPIRE_SECONDS })
  return runScanWithFlight(owner, repo)
}
