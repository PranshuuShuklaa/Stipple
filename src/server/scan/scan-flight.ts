import 'server-only'

import type { Scan } from '@/lib/types/scan'
import type { ScanStageEvent, ScanStageName } from '@/lib/scan-stages'
import { SCAN_STAGES } from '@/lib/scan-stages'
import type { ApiErrorCode } from '@/server/github/errors'
import { buildScan } from './build-scan'
import { knownApiErrorOf } from './error-response'

/**
 * The designed error travels as data (message, code, optional rate-limit
 * reset time) so the cache boundary never digests a thrown error.
 */
export interface DesignedErrorRecord {
  code: ApiErrorCode
  message: string
  resetAt?: string
}

export type ScanResult = { ok: true; scan: Scan } | { ok: false; error: DesignedErrorRecord }

export type ScanStageSink = (event: ScanStageEvent) => void

/**
 * One build per repo per process, shared by every consumer (/api/repo,
 * the report page, /api/scan-progress). A subscriber joining mid-build
 * replays the recorded stage events, so the sweep looks like it watched
 * the whole pipeline. Settled entries live one hour, matching the data
 * cache, and answer with the stored scan at once.
 */

const FLIGHT_TTL_MS = 60 * 60 * 1000

const GENERIC_UPSTREAM_MESSAGE = 'GitHub is having trouble right now. Try again in a few minutes.'

interface ScanFlight {
  promise: Promise<ScanResult>
  history: ScanStageEvent[]
  subscribers: Set<ScanStageSink>
  settledAt: number | null
}

const flights = new Map<string, ScanFlight>()

function flightKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`
}

function pruneExpired(nowMs: number): void {
  for (const [key, flight] of flights) {
    if (flight.settledAt !== null && nowMs - flight.settledAt > FLIGHT_TTL_MS) {
      flights.delete(key)
    }
  }
}

function designedErrorRecordOf(error: unknown): DesignedErrorRecord {
  const known = knownApiErrorOf(error)
  if (!known) return { code: 'upstream', message: GENERIC_UPSTREAM_MESSAGE }
  const probe = known as { resetAt?: unknown }
  const resetAt = typeof probe.resetAt === 'string' ? probe.resetAt : undefined
  return resetAt
    ? { code: known.code, message: known.message, resetAt }
    : { code: known.code, message: known.message }
}

/**
 * Runs the shared scan build. The flight always records stage history
 * internally, so even a build started without a subscriber (for example
 * through the cached getter) replays complete stages to later listeners.
 */
export async function runScanWithFlight(owner: string, repo: string, onStage?: ScanStageSink): Promise<ScanResult> {
  pruneExpired(Date.now())

  const key = flightKey(owner, repo)
  let flight = flights.get(key)
  if (!flight) {
    flight = startFlight(owner, repo)
    flights.set(key, flight)
  }

  if (onStage) {
    flight.subscribers.add(onStage)
    for (const event of flight.history) onStage(event)
  }
  const result = await flight.promise
  if (onStage) flight.subscribers.delete(onStage)
  return result
}

/** A settled result may just answer; the events are then synthesized. */
export function synthesizeScanStages(scan: Scan): ScanStageEvent[] {
  return SCAN_STAGES.map((stage, index) => {
    const event: ScanStageEvent = { stage: stage as ScanStageName, index: index + 1, total: SCAN_STAGES.length }
    if (stage === 'tree') event.files = Math.max(0, scan.files.length)
    return event
  })
}

/** Clears the in-process flight table (tests only). */
export function resetScanFlightsForTests(): void {
  flights.clear()
}

function startFlight(owner: string, repo: string): ScanFlight {
  const history: ScanStageEvent[] = []
  const subscribers = new Set<ScanStageSink>()
  const publish: ScanStageSink = (event) => {
    history.push(event)
    for (const subscriber of subscribers) subscriber(event)
  }
  const run: Promise<ScanResult> = (async () => {
    try {
      return { ok: true as const, scan: await buildScan(owner, repo, { onStage: publish }) }
    } catch (error) {
      return { ok: false as const, error: designedErrorRecordOf(error) }
    }
  })()
  const flight: ScanFlight = { promise: run, history, subscribers, settledAt: null }
  void run.then(() => {
    flight.settledAt = Date.now()
  })
  return flight
}
