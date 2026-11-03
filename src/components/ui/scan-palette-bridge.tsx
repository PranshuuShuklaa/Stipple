'use client'

import { useEffect } from 'react'
import type { Scan } from '@/lib/types/scan'
import { paletteForScan, paletteString } from '@/lib/language-palette'

export function ScanPaletteBridge({ scan }: { scan: Scan }) {
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const previous = Array.from({ length: 5 }, (_, index) => root.style.getPropertyValue(`--c${index + 1}`))
    const apply = () => {
      const manual = root.dataset.theme
      const dark = manual === 'dark' || (manual !== 'light' && media.matches)
      const palette = paletteForScan(scan, dark)
      palette.forEach((color, index) => {
        root.style.setProperty(`--repo-c${index + 1}`, color)
        root.style.setProperty(`--c${index + 1}`, color)
      })
      root.dataset.glowPalette = paletteString(palette.slice(0, 4))
      root.style.setProperty('--acc', palette[0])
      window.dispatchEvent(new Event('stipple:palette-change'))
    }

    apply()
    media.addEventListener('change', apply)
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      media.removeEventListener('change', apply)
      observer.disconnect()
      root.removeAttribute('data-glow-palette')
      root.style.removeProperty('--acc')
      for (let index = 1; index <= 5; index += 1) {
        root.style.removeProperty(`--repo-c${index}`)
        if (previous[index - 1]) root.style.setProperty(`--c${index}`, previous[index - 1])
        else root.style.removeProperty(`--c${index}`)
      }
    }
  }, [scan])

  return null
}
