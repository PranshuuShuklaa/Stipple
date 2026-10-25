import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

import { isValidOwnerRepo } from '@/lib/repo-input'
import { getScanCached } from '@/server/cache'
import {
  OG_HEIGHT,
  OG_WIDTH,
  buildOgElement,
  fallbackOgElement,
  ogDotSpecs,
  OG_FIELD_H,
  OG_FIELD_W,
  type OgElementSpec,
} from '@/features/share/og-image'

/**
 * GET /api/og/{owner}/{repo} — the social preview PNG: the dot field from
 * the scan with the repo name and score. Fonts are the self-hosted
 * Familjen Grotesk TTFs; a load failure degrades to Satori's default font.
 * Invalid repos, scan failures and anything thrown here never crash the
 * route: they get the designed fallback image.
 */

const OG_CACHE_CONTROL = 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'

const FONT_FAMILY = 'Familjen Grotesk'
const FONT_WEIGHTS = [
  { weight: 400, file: 'familjen-grotesk-400.ttf' },
  { weight: 600, file: 'familjen-grotesk-600.ttf' },
] as const

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }

let fontsPromise: Promise<OgFont[]> | null = null

function loadOgFonts(): Promise<OgFont[]> {
  fontsPromise ??= loadFonts()
  return fontsPromise
}

async function loadFonts(): Promise<OgFont[]> {
  const loaded: OgFont[] = []
  for (const entry of FONT_WEIGHTS) {
    try {
      const buffer = await readFile(join(process.cwd(), 'public', 'fonts', entry.file))
      const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      loaded.push({ name: FONT_FAMILY, data, weight: entry.weight, style: 'normal' })
    } catch {
      // Missing font file: degrade to the default font instead of failing.
    }
  }
  return loaded
}

interface OgImageOptions {
  width: number
  height: number
  headers: Record<string, string>
}

function imageOptions(fonts: OgFont[]): OgImageOptions & { fonts: OgFont[] } {
  return {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    headers: { 'cache-control': OG_CACHE_CONTROL },
    fonts,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<Response> {
  const { owner, repo } = await params
  try {
    // GitHub names are case-insensitive; keep the caller's casing for display.
    const fonts = await loadOgFonts()
    if (!isValidOwnerRepo(owner, repo)) {
      return new ImageResponse(fallbackOgElement(null), imageOptions(fonts))
    }
    const result = await getScanCached(owner, repo)
    if (!result.ok) {
      return new ImageResponse(fallbackOgElement(`${owner}/${repo}`), imageOptions(fonts))
    }
    const scan = result.scan
    const spec: OgElementSpec = {
      owner: scan.owner,
      repo: scan.name,
      score: scan.health.score,
      dots: ogDotSpecs(scan, OG_FIELD_W, OG_FIELD_H),
    }
    return new ImageResponse(buildOgElement(spec), imageOptions(fonts))
  } catch {
    return new Response(fallbackImageMarkup(), {
      status: 200,
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': OG_CACHE_CONTROL },
    })
  }
}

/** Last resort if even Satori fails: a plain dot matrix, on-brand. */
function fallbackImageMarkup(): string {
  const S = 12
  const GAP_X = 60
  const GAP_Y = 66
  const COLS = 20
  const ROWS = 9
  const fills = ['#9A7BFF', '#FF5C9A', '#FFB33D', '#3DDC97', '#4CC9FF']
  const dots: string[] = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const x = (1200 - (COLS - 1) * GAP_X) / 2 + (i % COLS) * GAP_X
    const y = (630 - (ROWS - 1) * GAP_Y) / 2 + Math.floor(i / COLS) * GAP_Y
    dots.push(`<circle cx="${x}" cy="${y}" r="${S / 2}" fill="${fills[i % fills.length]}" />`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">` +
    `<rect width="1200" height="630" fill="#100C24" />` +
    dots.join('') +
    `</svg>`
  )
}
