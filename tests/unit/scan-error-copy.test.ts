import { describe, expect, it } from 'vitest'
import { rateLimitResetCopy, scanErrorRetries, scanErrorTitle } from '@/lib/scan-error-copy'

const NOW = new Date('2026-10-24T12:00:00Z')

describe('scanErrorTitle', () => {
  it('has a plain, specific title for every designed code', () => {
    for (const code of [
      'invalid_input',
      'not_found',
      'private_or_missing',
      'empty_repo',
      'rate_limited',
      'upstream',
      'network_lost',
    ]) {
      const title = scanErrorTitle(code)
      expect(title.length).toBeGreaterThan(0)
      expect(title.endsWith('.')).toBe(true)
      // DESIGN copy rules: no marketing filler, no apologies.
      expect(title.toLowerCase()).not.toMatch(/sorry|oops|unleash|supercharge|seamless/)
    }
  })

  it('keeps unknown codes working with the generic title', () => {
    expect(scanErrorTitle('future_code')).toBe('GitHub is having trouble.')
  })
})

describe('scanErrorRetries', () => {
  it('retries only transient failures', () => {
    expect(scanErrorRetries('invalid_input')).toBe(false)
    expect(scanErrorRetries('not_found')).toBe(false)
    expect(scanErrorRetries('private_or_missing')).toBe(false)
    expect(scanErrorRetries('empty_repo')).toBe(false)
    expect(scanErrorRetries('rate_limited')).toBe(true)
    expect(scanErrorRetries('upstream')).toBe(true)
    expect(scanErrorRetries('network_lost')).toBe(true)
    // A code the copy module does not know yet stays retryable rather than a dead end.
    expect(scanErrorRetries('future_code')).toBe(true)
  })
})

describe('rateLimitResetCopy', () => {
  it('shows the reset clock in UTC and the wait in whole minutes, rounding up', () => {
    expect(rateLimitResetCopy('2026-10-24T12:01:30Z', NOW)).toBe(
      'The limit resets at 12:01 UTC (in 2 minutes).',
    )
  })

  it('formats hour-plus spans without inventing seconds', () => {
    expect(rateLimitResetCopy('2026-10-24T12:45:00Z', NOW)).toBe(
      'The limit resets at 12:45 UTC (in 45 minutes).',
    )
    expect(rateLimitResetCopy('2026-10-24T13:23:00Z', NOW)).toBe(
      'The limit resets at 13:23 UTC (in 1 hour 23 minutes).',
    )
    expect(rateLimitResetCopy('2026-10-24T13:00:00Z', NOW)).toBe(
      'The limit resets at 13:00 UTC (in 1 hour).',
    )
  })

  it('sends the reader to retry once the window has rolled over', () => {
    expect(rateLimitResetCopy('2026-10-24T11:00:00Z', NOW)).toBe(
      'The limit resets at 11:00 UTC. Run the scan again now.',
    )
  })

  it('renders nothing for a reset time that does not parse', () => {
    expect(rateLimitResetCopy('soon-ish', NOW)).toBe('')
    expect(rateLimitResetCopy('', NOW)).toBe('')
  })
})
