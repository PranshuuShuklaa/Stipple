import 'server-only'

import { InvalidInputError } from '@/server/github/errors'
import { isValidOwnerRepo } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import { errorBodyOf } from '@/server/scan/error-response'
import { runScanWithFlight, synthesizeScanStages } from '@/server/scan/scan-flight'
import type { ScanResult } from '@/server/scan/scan-flight'

/**
 * The scan progress stream: server-sent events that mirror the real
 * scan pipeline (stage, done, error) for the /scan screen. The fast
 * path probes the shared cache first and synthesizes a complete stage
 * sequence from the stored scan for repos scanned recently; otherwise
 * the route joins the build through the flight table and streams the
 * pipeline's own stage events.
 *
 * No `runtime`/`dynamic` segment config: under cacheComponents Next
 * rejects those exports, and awaiting `params` already makes the
 * handler per-request.
 */

export const maxDuration = 60

const PROBE_TIMEOUT_MS = 300

const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

/** Resolves with null when the probe is slower than the timeout; the probe keeps running. */
function probeWithinTimeout(promise: Promise<ScanResult>, timeoutMs: number): Promise<ScanResult | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: ScanResult | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    void promise.then(
      (value) => finish(value),
      () => finish(null),
    )
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const { owner, repo } = await params
  const valid = isValidOwnerRepo(owner, repo)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        if (!valid) {
          send('error', { error: errorBodyOf(new InvalidInputError()) })
          return
        }

        const probe = await probeWithinTimeout(getScanCached(owner, repo), PROBE_TIMEOUT_MS)
        if (probe) {
          if (probe.ok) {
            for (const event of synthesizeScanStages(probe.scan)) send('stage', event)
            send('done', { scan: probe.scan })
          } else {
            send('error', { error: probe.error })
          }
          return
        }

        const result = await runScanWithFlight(owner, repo, (event) => send('stage', event))
        if (!result.ok) {
          send('error', { error: result.error })
          return
        }
        send('done', { scan: result.scan })
      } catch (error) {
        send('error', { error: errorBodyOf(error) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: SSE_HEADERS })
}
