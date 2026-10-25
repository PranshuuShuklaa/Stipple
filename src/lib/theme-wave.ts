import type { QualityTierName } from '@/engine/quality'

/**
 * Theme switch wave (DESIGN.md signature 12). Toggling light and dark
 * reveals the new page through a circle growing from the button, so the
 * dots and the page change in one sweep.
 *
 * The reveal uses the View Transitions API when the browser supports it.
 * Low tier, reduced motion and unsupported browsers fall back to an
 * instant theme change.
 */

export type ThemeName = 'dark' | 'light'

export const THEME_WAVE_EVENT = 'stipple:theme-wave'
export const THEME_WAVE_DURATION_MS = 700
export const THEME_WAVE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

export interface ThemeWaveDetail {
  theme: ThemeName
}

/** Distance from the button centre to the farthest viewport corner. */
export function themeWaveRadius(
  originX: number,
  originY: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const dx = Math.max(originX, viewportWidth - originX)
  const dy = Math.max(originY, viewportHeight - originY)
  return Math.ceil(Math.hypot(dx, dy)) + 2
}

export function supportsThemeWave(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function'
  )
}

export function shouldWaveTheme(
  tier: QualityTierName | null,
  reducedMotion: boolean,
  supported: boolean,
): boolean {
  return supported && !reducedMotion && tier !== 'low'
}

/**
 * Runs `update` inside a View Transition and grows the new snapshot from
 * the origin. The callback must apply the theme synchronously; the engine
 * listens for THEME_WAVE_EVENT inside it so its next painted frame is the
 * one the browser captures for the new snapshot.
 */
export function startThemeWave(
  originX: number,
  originY: number,
  update: () => void,
): void {
  if (typeof document.startViewTransition !== 'function') {
    update()
    return
  }

  const root = document.documentElement
  const radius = themeWaveRadius(
    originX,
    originY,
    window.innerWidth,
    window.innerHeight,
  )

  const applyTheme = (): void => {
    // The initial clip lives in base.css and reads these before the
    // animation starts, so the new snapshot never flashes at full size.
    root.style.setProperty('--theme-wave-x', `${originX}px`)
    root.style.setProperty('--theme-wave-y', `${originY}px`)
    update()
  }

  let transition: ViewTransition
  try {
    transition = document.startViewTransition(applyTheme)
  } catch {
    update()
    return
  }

  void transition.ready
    .then(() => {
      const options: KeyframeAnimationOptions = {
        duration: THEME_WAVE_DURATION_MS,
        easing: THEME_WAVE_EASING,
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      }
      const animation = document.documentElement.animate(
        [
          { clipPath: `circle(0px at ${originX}px ${originY}px)` },
          {
            clipPath: `circle(${radius}px at ${originX}px ${originY}px)`,
          },
        ],
        options,
      )
      void animation.finished.catch(() => {})
    })
    .catch(() => {})

  void transition.finished.catch(() => {})
}
