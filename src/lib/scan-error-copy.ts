/**
 * The designed error copy, shared by the scan screen and the report
 * error screen (DESIGN.md copy rules: plain, specific, sentence case,
 * one message and one clear next action per code).
 *
 * Client-safe and pure: the only logic here is the human resetting of
 * the rate-limit reset time, which takes the clock as an argument.
 */

interface ScanErrorDesign {
  title: string
  /** Whether "Try again" is a real next action for this code. */
  retry: boolean
}

const DESIGNS: Record<string, ScanErrorDesign> = {
  invalid_input: { title: 'That address does not look right.', retry: false },
  not_found: { title: 'No report for this repo.', retry: false },
  private_or_missing: { title: 'This repo is not reachable.', retry: false },
  empty_repo: { title: 'Nothing to scan yet.', retry: false },
  rate_limited: { title: 'The shared GitHub limit is used up.', retry: true },
  upstream: { title: 'GitHub is having trouble.', retry: true },
  network_lost: { title: 'The connection dropped.', retry: true },
}

const DEFAULT_TITLE = 'GitHub is having trouble.'

/** Plain title for a designed code; unknown codes keep a working screen. */
export function scanErrorTitle(code: string): string {
  return DESIGNS[code]?.title ?? DEFAULT_TITLE
}

/** True when retrying can change the outcome: transient failures only. */
export function scanErrorRetries(code: string): boolean {
  return DESIGNS[code]?.retry ?? true
}

/**
 * "The limit resets at 14:03 UTC (in 23 minutes)." for a future reset
 * that the UI shows next to the message. Returns '' when the ISO time
 * does not parse, so callers simply render no extra line.
 */
export function rateLimitResetCopy(resetAt: string, now: Date = new Date()): string {
  const reset = new Date(resetAt)
  if (Number.isNaN(reset.getTime())) return ''

  const clock = `${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(isoSeconds(reset))} UTC`

  const seconds = Math.ceil((reset.getTime() - now.getTime()) / 1000)
  if (seconds <= 0) return `The limit resets at ${clock}. Run the scan again now.`

  const minutes = Math.max(1, Math.ceil(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes - hours * 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  if (rest > 0) parts.push(`${rest} minute${rest === 1 ? '' : 's'}`)

  return `The limit resets at ${clock} (in ${parts.join(' ')}).`
}

function isoSeconds(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000)
}
