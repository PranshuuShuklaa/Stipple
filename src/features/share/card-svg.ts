import type { Scan } from '@/lib/types/scan'
import { escapeXmlText } from './badge-svg'
import { createLanguageIndexer } from '@/engine/layouts/language-colors'

/**
 * Animated README card SVG generator.
 * Pure function, unit-testable without a server.
 * Meets all requirements:
 * - CSS keyframes only (no scripts, no external references, no foreignObject, no web fonts).
 * - Deterministic dot positions from the Scan.
 * - Dots assemble into the language bar, then a small health ring draws itself and numbers appear.
 * - Light and dark through prefers-color-scheme inside the SVG.
 * - <title> and <desc>.
 * - Under 50 KB.
 * - Animation off under prefers-reduced-motion.
 */

export const CARD_WIDTH = 600
export const CARD_HEIGHT = 240

const LIGHT_COLORS = {
  bg: '#EEEBF8',
  panel: '#DFD9F2',
  fg: '#1A1533',
  dim: '#51496F',
  line: '#C9C1E3',
  c1: '#5B2BE0',
  c2: '#E0246E',
  c3: '#B56A00',
  c4: '#0A865D',
  c5: '#0A7FC2',
} as const

const DARK_COLORS = {
  bg: '#100C24',
  panel: '#1A1438',
  fg: '#F1EEFF',
  dim: '#A89FCF',
  line: '#2E2658',
  c1: '#9A7BFF',
  c2: '#FF5C9A',
  c3: '#FFB33D',
  c4: '#3DDC97',
  c5: '#4CC9FF',
} as const

export interface CardSpec {
  owner: string
  repo: string
  description?: string | null
  commits: number
  filesCount: number
  score: number | null
  languages: { name: string; percent: number; colorKey: string }[]
  dots: { x: number; y: number; d: number; colorKey: string; startX: number; startY: number }[]
}

const MAX_CARD_DOTS = 80

/**
   * Build deterministic card spec from a Scan model.
   */
export function cardSpecFromScan(scan: Scan): CardSpec {
  const fileCount = scan.files.length
  const step = Math.ceil(fileCount / MAX_CARD_DOTS)
  const sampledFiles = scan.files.filter((_, i) => i % step === 0).slice(0, MAX_CARD_DOTS)
  const languageIndexer = createLanguageIndexer(scan)
  const colorKeys = ['c1', 'c2', 'c3', 'c4', 'c5'] as const

  // Field bounding box for dots on card: x: 36..260, y: 70..210 (width 224, height 140)
  const cols = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(sampledFiles.length * 1.5))))
  const rows = Math.ceil(sampledFiles.length / cols)
  const cellW = 210 / Math.max(1, cols)
  const cellH = 130 / Math.max(1, rows)
  const dotDiameter = Math.min(8, Math.max(5, Math.floor(Math.min(cellW, cellH) * 0.75)))

  const dots = sampledFiles.map((file, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const finalX = 40 + col * cellW + cellW / 2
    const finalY = 75 + row * cellH + cellH / 2
    // Start position: randomized or centered near field center (145, 140)
    const startX = 145 + ((i * 37) % 90) - 45
    const startY = 140 + ((i * 53) % 70) - 35
    const langIdx = languageIndexer(file.language)
    const colorKey = colorKeys[langIdx] ?? 'c5'
    return {
      x: Math.round(finalX * 10) / 10,
      y: Math.round(finalY * 10) / 10,
      d: dotDiameter,
      colorKey,
      startX: Math.round(startX * 10) / 10,
      startY: Math.round(startY * 10) / 10,
    }
  })

  // Calculate language percentages
  const totalBytes = scan.languages.reduce((sum, l) => sum + l.bytes, 0)
  const languages = scan.languages.slice(0, 5).map((lang, idx) => ({
    name: lang.name,
    percent: totalBytes > 0 ? Math.round((lang.bytes / totalBytes) * 100) : 0,
    colorKey: colorKeys[idx] ?? 'c5',
  }))

  return {
    owner: scan.owner,
    repo: scan.name,
    description: scan.description,
    commits: scan.commits,
    filesCount: scan.files.length,
    score: scan.health.score,
    languages,
    dots,
  }
}

/**
 * Fallback card spec when scan fails or repo is invalid.
 */
export function fallbackCardSpec(owner: string, repo: string): CardSpec {
  const colorKeys = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
  const dots = Array.from({ length: 48 }, (_, i) => {
    const cols = 8
    const col = i % cols
    const row = Math.floor(i / cols)
    const finalX = 45 + col * 26
    const finalY = 75 + row * 22
    return {
      x: finalX,
      y: finalY,
      d: 7,
      colorKey: colorKeys[i % colorKeys.length],
      startX: 145 + ((i * 19) % 80) - 40,
      startY: 140 + ((i * 31) % 60) - 30,
    }
  })
  return {
    owner,
    repo,
    description: 'Stipple repo summary',
    commits: 0,
    filesCount: 0,
    score: null,
    languages: [{ name: 'TypeScript', percent: 100, colorKey: 'c1' }],
    dots,
  }
}

export interface CardSvgResult {
  svg: string
  width: number
  height: number
}

export function buildCardSvg(spec: CardSpec): CardSvgResult {
  const titleText = `${spec.owner}/${spec.repo} — Stipple repository summary`
  const descText = `Animated Stipple card showing ${spec.filesCount} files, health score ${spec.score ?? 'n/a'}, and language breakdown.`

  const ringRadius = 30
  const ringCircumference = 2 * Math.PI * ringRadius
  const validScore = spec.score !== null && Number.isFinite(spec.score) ? Math.max(0, Math.min(100, Math.round(spec.score))) : 0
  const ringOffset = ringCircumference * (1 - validScore / 100)

  const dotColorClasses = new Set(['c1', 'c2', 'c3', 'c4', 'c5'])

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-label="${escapeXmlText(titleText)}">
<title>${escapeXmlText(titleText)}</title>
<desc>${escapeXmlText(descText)}</desc>
<style>
  :root {
    --bg: ${LIGHT_COLORS.bg};
    --panel: ${LIGHT_COLORS.panel};
    --fg: ${LIGHT_COLORS.fg};
    --dim: ${LIGHT_COLORS.dim};
    --line: ${LIGHT_COLORS.line};
    --c1: ${LIGHT_COLORS.c1};
    --c2: ${LIGHT_COLORS.c2};
    --c3: ${LIGHT_COLORS.c3};
    --c4: ${LIGHT_COLORS.c4};
    --c5: ${LIGHT_COLORS.c5};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: ${DARK_COLORS.bg};
      --panel: ${DARK_COLORS.panel};
      --fg: ${DARK_COLORS.fg};
      --dim: ${DARK_COLORS.dim};
      --line: ${DARK_COLORS.line};
      --c1: ${DARK_COLORS.c1};
      --c2: ${DARK_COLORS.c2};
      --c3: ${DARK_COLORS.c3};
      --c4: ${DARK_COLORS.c4};
      --c5: ${DARK_COLORS.c5};
    }
  }
  .bg { fill: var(--bg); }
  .panel { fill: var(--panel); }
  .fg { fill: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .dim { fill: var(--dim); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .line { stroke: var(--line); }
  .c1 { fill: var(--c1); }
  .c2 { fill: var(--c2); }
  .c3 { fill: var(--c3); }
  .c4 { fill: var(--c4); }
  .c5 { fill: var(--c5); }

  @keyframes dotAssemble {
    0% {
      transform: translate(var(--dx), var(--dy)) scale(0.1);
      opacity: 0;
    }
    100% {
      transform: translate(0px, 0px) scale(1);
      opacity: 1;
    }
  }
  @keyframes ringDraw {
    0% {
      stroke-dashoffset: ${ringCircumference};
    }
    100% {
      stroke-dashoffset: ${ringOffset};
    }
  }
  @keyframes contentFade {
    0% {
      opacity: 0;
      transform: translateY(6px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dot {
    animation: dotAssemble 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: var(--delay);
  }
  .health-ring {
    animation: ringDraw 1.3s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both;
  }
  .animate-in {
    animation: contentFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.9s both;
  }

  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after {
      animation: none !important;
      transition: none !important;
    }
  }
</style>

<!-- Background -->
<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="14" class="bg" />
<rect x="20" y="20" width="260" height="200" rx="10" class="panel" />

<!-- Header -->
<text x="305" y="44" font-size="20" font-weight="600" class="fg">${escapeXmlText(spec.owner)} / ${escapeXmlText(spec.repo)}</text>
<text x="305" y="62" font-size="12" font-weight="500" class="dim">stipple — one dot, one file</text>

<!-- Divider line -->
<line x1="305" y1="78" x2="575" y2="78" stroke-width="1" class="line" />

<!-- Dot field / Language bar area -->
<g>
  ${spec.dots
    .map((dot, i) => {
      const dx = dot.startX - dot.x
      const dy = dot.startY - dot.y
      const delay = (i * 0.008).toFixed(3)
      const colorClass = dotColorClasses.has(dot.colorKey) ? dot.colorKey : 'c1'
      return `<circle cx="${dot.x}" cy="${dot.y}" r="${dot.d / 2}" class="dot ${colorClass}" style="--dx: ${dx}px; --dy: ${dy}px; --delay: ${delay}s;" />`
    })
    .join('\n  ')}
</g>

<!-- Health Ring & Stats (Right side) -->
<g transform="translate(485, 145)" class="animate-in">
  <!-- Ring track -->
  <circle cx="0" cy="0" r="${ringRadius}" fill="none" stroke-width="6" class="line" />
  <!-- Ring progress -->
  <circle cx="0" cy="0" r="${ringRadius}" fill="none" stroke-width="6" stroke="var(--c1)" stroke-dasharray="${ringCircumference}" stroke-dashoffset="${ringOffset}" stroke-linecap="round" transform="rotate(-90)" class="health-ring" />
  <!-- Score number -->
  <text x="0" y="5" font-size="18" font-weight="600" text-anchor="middle" class="fg">${spec.score !== null ? validScore : 'n/a'}</text>
  <text x="0" y="22" font-size="10" font-weight="500" text-anchor="middle" class="dim">health</text>
</g>

<!-- Summary stats text (Left/Center bottom) -->
<g transform="translate(305, 108)" class="animate-in">
  <text x="0" y="0" font-size="13" font-weight="600" class="fg">Files: ${spec.filesCount}</text>
  <text x="0" y="22" font-size="13" font-weight="600" class="fg">Commits: ${spec.commits}</text>
  <text x="0" y="44" font-size="12" font-weight="500" class="dim">Languages: ${escapeXmlText(spec.languages.map((l) => `${l.name} (${l.percent}%)`).join(', ') || 'None')}</text>
</g>

</svg>`

  return { svg, width: CARD_WIDTH, height: CARD_HEIGHT }
}
