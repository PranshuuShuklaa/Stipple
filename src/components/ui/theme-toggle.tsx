'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import { readQualityTier } from '@/engine/quality-signal'
import {
  THEME_WAVE_EVENT,
  shouldWaveTheme,
  startThemeWave,
  supportsThemeWave,
  type ThemeWaveDetail,
} from '@/lib/theme-wave'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'stipple-theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function effectiveTheme(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === 'dark' || set === 'light') return set
  return systemTheme()
}

export function ThemeToggle() {
  const [label, setLabel] = useState('Switch theme')

  useEffect(() => {
    const sync = () => {
      const next = effectiveTheme() === 'dark' ? 'light' : 'dark'
      setLabel(`Switch to ${next} theme`)
    }
    sync()
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable: theme applies for this page view only */
    }

    const applyTheme = () => {
      document.documentElement.dataset.theme = next
      window.dispatchEvent(
        new CustomEvent<ThemeWaveDetail>(THEME_WAVE_EVENT, {
          detail: { theme: next },
        }),
      )
    }

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const supported = supportsThemeWave()
    if (shouldWaveTheme(readQualityTier(), reducedMotion, supported)) {
      const rect = event.currentTarget.getBoundingClientRect()
      startThemeWave(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        applyTheme,
      )
    } else {
      applyTheme()
    }

    setLabel(`Switch to ${next === 'dark' ? 'light' : 'dark'} theme`)
  }

  return (
    <button type="button" className="theme-toggle" aria-label={label} onClick={toggle}>
      <svg className="icon-sun" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M14.7 3.3l-1.4 1.4M4.7 13.3l-1.4 1.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <svg className="icon-moon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M15.5 11.2A6.8 6.8 0 0 1 6.8 2.5 6.8 6.8 0 1 0 15.5 11.2Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
