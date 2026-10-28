/**
 * Edge-case states: empty repo, private repo, an offline drop mid-scan,
 * an archived repo, and a one-file repo. Error states are mocked at the
 * browser level; the report states use the dev-only fixture route so no
 * GitHub token is consumed. The remaining edge cases (no languages,
 * monorepo, truncated tree, typo, rate limit) are covered by
 * tests/unit/* and tests/e2e/error-states.spec.ts.
 */
import { expect, test } from '@playwright/test'

const OWNER = 'octo'
const REPO = 'Hello-World'
const SCAN_URL = `/scan/${OWNER}/${REPO}`

function sseError(error: { code: string; message: string; resetAt?: string }): string {
  return `event: error\ndata: ${JSON.stringify({ error })}\n\n`
}

test('an empty repo says there is nothing to scan and offers no dead Retry', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseError({
        code: 'empty_repo',
        message: 'This repo has no files on its default branch yet.',
      }),
    }),
  )

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText('Nothing to scan yet.')
  await expect(page.locator('body')).toContainText(/no files on its default branch/i)
  await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /scan a different repo/i })).toBeVisible()
})

test('a private or removed repo keeps the designed private-or-missing state', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseError({
        code: 'private_or_missing',
        message: 'github.com/octo/Hello-World may be private or removed.',
      }),
    }),
  )

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText('This repo is not reachable.')
  await expect(page.locator('body')).toContainText(/may be private or removed/i)
  await expect(page.getByRole('button', { name: /try again/i })).toHaveCount(0)
})

test('an offline drop after the first stage becomes network-lost, not a 15 s freeze', async ({ page }) => {
  const partialStream =
    'event: stage\ndata: {"stage":"tree","index":1,"total":4,"files":42}\n\n'

  // The stream delivers real progress and then closes with no done/error
  // event; the direct request also fails at the network level.
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: partialStream }),
  )
  await page.route('**/api/repo/**', (route) => route.abort())

  await page.goto(SCAN_URL)

  await expect(page.locator('h1')).toContainText('The connection dropped.', { timeout: 5000 })
  await expect(page.locator('body')).toContainText(/could not reach the network/i)
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
})

test('an archived repo still renders its report and says it is archived', async ({ page }) => {
  await page.goto('/dev/report?variant=archived')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('stipple.')
  await expect(page.locator('body')).toContainText(
    'This repo is archived. Stipple scanned the last state it was left in.',
  )
})

test('a one-file repo says "1 file." and keeps the singular honest', async ({ page }) => {
  await page.goto('/dev/report?variant=one-file')

  await expect(page.getByRole('heading', { name: '1 file.' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('1 files')
})
