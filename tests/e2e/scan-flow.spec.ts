/**
 * Scan screen smoke: a healthy SSE stream hands off to the report URL;
 * a blocked stream falls back to the direct request and still completes;
 * a designed error event shows the error screen with Retry. Every API
 * call is mocked at the browser level, so no GitHub token is consumed by
 * this spec itself (the /r/ report page does its own server-side work;
 * assertions stay URL-only and never depend on report content beyond
 * the report page being reachable). Run with `npm run dev` on :3000,
 * then `npx playwright test tests/e2e/scan-flow.spec.ts`.
 */
import { expect, test } from '@playwright/test'

const OWNER = 'octo'
const REPO = 'Hello-World'
const SCAN_URL = `/scan/${OWNER}/${REPO}`
const REPORT_URL = `**/r/${OWNER}/${REPO}`

type Stage = { stage: string; index: number; total: number; files?: number }

function stageList(fileCount: number): Stage[] {
  return [
    { stage: 'tree', index: 1, total: 4, files: fileCount },
    { stage: 'languages', index: 2, total: 4 },
    { stage: 'activity', index: 3, total: 4 },
    { stage: 'health', index: 4, total: 4 },
  ]
}

function fixtureScan(fileCount: number): object {
  return {
    owner: OWNER,
    name: REPO,
    description: '',
    defaultBranch: 'main',
    stars: 1,
    htmlUrl: `https://github.com/${OWNER}/${REPO}`,
    files: Array.from({ length: fileCount }, (_unused, index) => ({
      path: `f-${index}`, name: `f-${index}`, size: 4, language: null, folder: '(root)',
    })),
    languages: [],
    activity: [],
    contributors: [],
    commits: 0,
    health: { score: 50, checks: [] },
    dependencies: [],
    flags: { truncated: false, statsPending: false },
    scannedAt: '2026-10-24T00:00:00.000Z',
  }
}

function streamEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sseBody(fileCount: number, scan: object = fixtureScan(fileCount)): string {
  return [
    ...stageList(fileCount).map((stage) => streamEvent('stage', stage)),
    streamEvent('done', { scan }),
  ].join('')
}

test('a healthy stream finishes the sweep and opens the report', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: sseBody(9) }),
  )

  await page.goto(SCAN_URL)
  const field = page.getByRole('img', { name: /sweep line over gray dots/i })
  await expect(field).toBeVisible()
  await expect(field).toHaveAccessibleName(/Scanning octo\/Hello-World/i)

  await page.waitForURL(REPORT_URL, { timeout: 30_000 })
})

test('a blocked stream falls back to the direct request and still completes', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) => route.abort())
  await page.route('**/api/repo/**', async (route) => {
    // The direct answer arrives 800 ms late, so the honest fallback copy
    // stays on screen long enough to be observed (a local reply is fast).
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ scan: fixtureScan(6) }) })
  })

  await page.goto(SCAN_URL)
  await expect(page.getByRole('status')).toContainText(/direct way/i)

  await page.waitForURL(REPORT_URL, { timeout: 30_000 })
})

test('a designed error event shows the error screen with Retry', async ({ page }) => {
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: streamEvent('error', {
        error: { code: 'rate_limited', message: 'The shared limit is used up. Try again after 01:30 UTC.', resetAt: '2026-10-24T01:30:00.000Z' },
      }),
    }),
  )

  await page.goto(SCAN_URL)
  const retry = page.getByRole('button', { name: /try again/i })
  await expect(retry).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('h1')).toContainText(/shared GitHub limit/i)
  await expect(page.locator('body')).toContainText('github.com/octo/Hello-World')

  await expect(page).not.toHaveURL(new RegExp(`/r/${OWNER}/${REPO}$`))
})

test('the status line reads like a human wrote it while the scan waits', async ({ page }) => {
  // Stage events only, no done event: the screen keeps waiting on the
  // stream honestly (the 15 s cap guards it after this test ends). The
  // stage copies land in one chunk in a mock, so the visible state is the
  // last waiting line — the point of the test is that the line is human
  // words about scan meaning, never parse internals. Number formatting
  // ("1,234 files") is covered in tests/unit/scan-flow.test.ts.
  await page.route('**/api/scan-progress/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: stageList(1_234).map((stage) => streamEvent('stage', stage)).join(''),
    }),
  )

  await page.goto(SCAN_URL)
  const status = page.getByRole('status')
  await expect(status).toContainText(/Putting the report together/, { timeout: 10_000 })
  await expect(status).not.toContainText(/stage|API|event|json/i)
})
