/**
 * Automated accessibility pass (axe-core).
 *
 * Covers every page in light, dark and reduced-motion mode. The intro is
 * skipped via sessionStorage so the scan lands on the real page; a separate
 * reduced-motion test checks the intro's short fade path.
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const WCAG_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
]

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(' '),
      summary: node.failureSummary,
    })),
  }))
  expect(summary, `${label}: ${JSON.stringify(summary, null, 2)}`).toEqual([])
}

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    ({ theme }) => {
      sessionStorage.setItem('stipple:intro-played', '1')
      localStorage.setItem('stipple-theme', theme)
    },
    { theme },
  )
}

test('home has no accessibility violations in light and dark', async ({ page }) => {
  await prepare(page, 'light')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await scan(page, 'home light')

  await prepare(page, 'dark')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await scan(page, 'home dark')
})

test('report has no accessibility violations in light and dark', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page, 'light')
  await page.goto('/r/octocat/Hello-World')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello/i, {
    timeout: 60_000,
  })
  await scan(page, 'report light')

  await prepare(page, 'dark')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello/i, {
    timeout: 60_000,
  })
  await scan(page, 'report dark')
})

test('designed report error has no accessibility violations', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page, 'light')
  await page.goto('/r/nobody-xyz/does-not-exist-123')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 60_000,
  })
  await scan(page, 'report error')
})

test('scan screen has no accessibility violations', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page, 'light')
  await page.goto('/scan/octocat/Hello-World')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Scanning/i)
  await scan(page, 'scan screen')
})

test.describe('scan error state', () => {
  const designedError = {
    code: 'rate_limited',
    message: 'The GitHub API limit is used up for the shared token.',
    resetAt: new Date(Date.now() + 20 * 60_000).toISOString(),
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/scan-progress/**', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
        },
        body: `event: error\ndata: ${JSON.stringify({ error: designedError })}\n\n`,
      }),
    )
  })

  test('has no accessibility violations and moves focus to the error in both themes', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await prepare(page, 'light')
    await page.goto('/scan/octocat/Hello-World')
    const heading = page.getByRole('heading', {
      level: 1,
      name: /shared GitHub limit is used up/i,
    })
    await expect(heading).toBeVisible({ timeout: 30_000 })
    await expect(heading).toBeFocused()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await scan(page, 'scan error light')

    await prepare(page, 'dark')
    await page.reload()
    await expect(heading).toBeVisible({ timeout: 30_000 })
    await scan(page, 'scan error dark')
  })
})

test.describe('keyboard', () => {
  test('skip link appears first, focuses main, and focus rings are visible', async ({ page }) => {
    await prepare(page, 'light')
    await page.goto('/')

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()

    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('main-content')

    await page.keyboard.press('Tab')
    const repoInput = page.getByRole('textbox', { name: /GitHub repository/i })
    await expect(repoInput).toBeFocused()

    await page.keyboard.press('Shift+Tab')
    const themeToggle = page.getByRole('button', { name: /Switch to .* theme/i })
    await expect(themeToggle).toBeFocused()
    const outline = await themeToggle.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        color: style.outlineColor,
      }
    })
    expect(outline.style).toBe('solid')
    expect(outline.width).toBe('2px')
    expect(outline.color).not.toBe('rgba(0, 0, 0, 0)')
  })

  test('every focus stop on home and report shows a visible ring', async ({ page }) => {
    test.setTimeout(120_000)
    await prepare(page, 'light')

    await page.goto('/')
    const homeStops = await tabStops(page)
    expect(homeStops.length).toBeGreaterThanOrEqual(5)
    for (const stop of homeStops) {
      expect(stop, `${stop.tag} "${stop.name}"`).toMatchObject({ ring: true, ringStyle: 'solid' })
    }

    await prepare(page, 'dark')
    await page.goto('/r/octocat/Hello-World')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello/i, {
      timeout: 60_000,
    })
    const reportStops = await tabStops(page)
    expect(reportStops.length).toBeGreaterThanOrEqual(8)
    for (const stop of reportStops) {
      expect(stop, `${stop.tag} "${stop.name}"`).toMatchObject({ ring: true, ringStyle: 'solid' })
    }
  })

  test('folder labels take keyboard focus and arrow keys without scrolling', async ({ page }) => {
    test.setTimeout(120_000)
    await prepare(page, 'light')
    await page.goto('/r/octocat/Hello-World')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello/i, {
      timeout: 60_000,
    })
    const label = page.getByRole('button', { name: /files\. Drag to move/i }).first()
    await page.getByRole('heading', { name: /By folder/i }).scrollIntoViewIfNeeded()
    await expect.poll(() => label.evaluate((element) => element.closest('[inert]') === null)).toBe(true)

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(label).toBeFocused()
    const ring = await label.evaluate((element) => {
      const child = element.querySelector('span')
      if (!(child instanceof HTMLElement)) return null
      const style = getComputedStyle(child)
      return { style: style.outlineStyle, width: style.outlineWidth }
    })
    expect(ring).toMatchObject({ style: 'solid', width: '2px' })

    const before = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('ArrowRight')
    const after = await page.evaluate(() => window.scrollY)
    expect(after).toBe(before)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the intro is a short, aria-hidden wordmark fade', async ({ page }) => {
    test.setTimeout(30_000)
    await page.addInitScript(() => {
      sessionStorage.removeItem('stipple:intro-played')
      const probe = { fadeSeen: false }
      ;(
        window as unknown as {
          __stippleIntroProbe: { fadeSeen: boolean }
        }
      ).__stippleIntroProbe = probe
      const inspect = () => {
        for (const element of document.querySelectorAll('div')) {
          if (
            element.getAttribute('aria-hidden') === 'true' &&
            element.textContent === 'stipple' &&
            getComputedStyle(element).position === 'fixed'
          ) {
            probe.fadeSeen = true
          }
        }
      }
      new MutationObserver(inspect).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      })
    })

    const started = Date.now()
    await page.goto('/')
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __stippleIntroProbe?: { fadeSeen: boolean }
              }
            ).__stippleIntroProbe?.fadeSeen ?? false,
        ),
      )
      .toBe(true)
    await expect(page.getByText('Click, press any key or scroll to skip.')).toHaveCount(0)
    expect(Date.now() - started).toBeLessThan(2_500)
  })

  test('home, report and scan screen have no accessibility violations', async ({ page }) => {
    test.setTimeout(120_000)
    await prepare(page, 'light')
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await scan(page, 'home reduced motion')

    await page.goto('/r/octocat/Hello-World')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Hello/i, {
      timeout: 60_000,
    })
    await scan(page, 'report reduced motion')

    await page.goto('/scan/octocat/Hello-World')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Scanning/i)
    await scan(page, 'scan screen reduced motion')
  })
})

interface TabStop {
  key: string
  tag: string
  name: string
  ring: boolean
  ringStyle: string
  ringWidth: string
}

/** Tab through the page and report the ring state of every focus stop. */
async function tabStops(page: Page, limit = 40): Promise<TabStop[]> {
  const stops: TabStop[] = []
  for (let step = 0; step < limit; step++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate((): TabStop | null => {
      const element = document.activeElement
      if (
        !(element instanceof HTMLElement) ||
        element === document.body ||
        element === document.documentElement
      ) {
        return null
      }
      const ringed = (node: HTMLElement) => {
        const style = getComputedStyle(node)
        return style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2
      }
      const holder = ringed(element)
        ? element
        : (Array.from(element.querySelectorAll<HTMLElement>('*')).find(ringed) ?? null)
      const style = holder ? getComputedStyle(holder) : null
      const label =
        element.getAttribute('aria-label') ??
        element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ??
        ''
      return {
        key: `${element.tagName}:${element.id}:${label}`,
        tag: element.tagName.toLowerCase(),
        name: label,
        ring: holder !== null,
        ringStyle: style?.outlineStyle ?? 'none',
        ringWidth: style?.outlineWidth ?? '0px',
      }
    })
    if (!stop || stops.some((seen) => seen.key === stop.key)) break
    stops.push(stop)
  }
  return stops
}
