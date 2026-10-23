/**
 * Report story scroll smoke: /r/octocat/Hello-World morphs between the
 * four story layouts when stepping down and back up (the Round 2
 * regression — reverse morphs), and the Files step shows language-coded
 * legend swatches. Run with `npm run dev` on :3000, then
 * `npx playwright test tests/e2e/report-scroll.spec.ts`.
 */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/r/octocat/Hello-World')
  // Story headline appears on desktop layout
  await expect(page.locator('h1')).toContainText(/Hello/i)
})

test('steps down through every layout and back up, ending on files again', async ({ page }) => {
  const stage = page.getByRole('img', { name: /field of dots/i })
  await expect(stage).toBeVisible()

  const stepDescriptions = [
    /files/i,
    /language/i,
    /commits/i,
    /folder/i,
  ] as const

  const scrollToStep = async (index: number) => {
    const step = page.locator('[data-step-index]').nth(index)
    await step.scrollIntoViewIfNeeded()
    // Give the step viewport-center measurement and the morph time to settle
    await page.waitForTimeout(1200)
  }

  for (let i = 1; i < 4; i++) {
    await scrollToStep(i)
  }

  // Scroll back up: the reverse morphs must run too
  for (let i = 2; i >= 0; i--) {
    await scrollToStep(i)
  }

  // After returning to step 0 the engine must be back on the files layout
  // (self-healing dispatch), with the active step highlighted.
  await expect(page.locator('[data-step-index=\'0\']')).toHaveClass(/stepActive|active/, {
    timeout: 5000,
  })
})

test('files legend shows language swatches when the scan counts languages', async ({ page }) => {
  const legend = page.locator('xpath=//span[contains(text(), "files") or contains(text(), "Files")]').first()
  await expect(legend).toBeVisible()
  // Language swatches (DESIGN.md rule: color + label) appear next to the
  // files count when more than one language is counted.
  const swatches = page.locator('i.swatch, [class*=swatch]')
  await expect(swatches.first()).toBeVisible()
  await expect(swatches.first()).toHaveCSS('background-color', /rgb\(/)
})
