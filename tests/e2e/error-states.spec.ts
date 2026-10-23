/**
 * Designed error states (Phase 5c): the three that block real users most
 * — not found, rate limited (with the human reset time), and network
 * lost. Every API call is mocked at the browser level, so no GitHub
 * token is consumed. Run with `npm run dev` on :3000, then
 * `npx playwright test tests/e2e/error-states.spec.ts`.
 */
import { expect, test } from '@playwright/test'

const OWNER = 'octo'
const REPO = 'Hello-World'
const SCAN_URL = `/scan/${OWNER}/${REPO}`

function sseError(error: { code: string; message: string; resetAt?: string }): string {
  return `event: error\ndata: ${JSON.stringify({ error })}\n\n`
}

test('a not-found repo shows the plain message and only the way out, no dead Retry', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseError({
        code: 'not_found',
        message:
          "We couldn't find github.com/octo/Hello-World. Check the spelling, or make sure the repo is public.",
      }),
    }),
  )

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText('No report for this repo.')
  await expect(page.locator('body')).toContainText(/Check the spelling, or make sure the repo is public/)

  // A retry cannot fix a missing repo: the only next action is a new scan.
  await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /scan a different repo/i })).toBeVisible()

  await expect(page).not.toHaveURL(new RegExp(`/r/${OWNER}/${REPO}`))
})

test('a rate-limited scan shows the reset time in human copy with the retry that makes sense', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseError({
        code: 'rate_limited',
        message: 'The shared GitHub rate limit is used up.',
        resetAt: '2030-01-01T06:30:00.000Z',
      }),
    }),
  )

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText(/shared GitHub limit/i)
  // The reset time is the next action: a clock time, never a raw ISO stamp.
  await expect(page.locator('body')).toContainText(/The limit resets at 06:30 UTC/)
  await expect(page.locator('body')).toContainText(/in \d+ minutes|hour/)

  const tryAgain = page.getByRole('button', { name: /try again/i })
  await expect(tryAgain).toBeVisible()
  await expect(page.getByRole('link', { name: /scan a different repo/i })).toBeVisible()

  // Retrying keeps the same designed limit message (the mock still answers limited),
  // so the screen stays honest instead of looping back to the sweep silently.
  await tryAgain.click()
  await expect(page.locator('h1')).toContainText(/shared GitHub limit/i)
})

test('a lost network on the fallback path explains itself and offers Retry', async ({ page }) => {
  // Both the progress stream and the direct request fail at the network level.
  await page.route('**/api/scan-progress/**', (route) => route.abort())
  await page.route('**/api/repo/**', (route) => route.abort())

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText('The connection dropped.')
  await expect(page.locator('body')).toContainText(/could not reach the network/i)

  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /scan a different repo/i })).toBeVisible()
})
