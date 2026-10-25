'use client'

import { forwardRef, useImperativeHandle, type RefObject } from 'react'
import type { ScoreBandName } from './badge-svg'
import { useLinkForge } from './use-link-forge'
import styles from './link-forge.module.css'

export interface LinkForgeHandle {
  /** Bursts the badge dots toward the clicked button and into its pill. */
  burst: (target: HTMLElement) => void
}

interface LinkForgeProps {
  badgeRef: RefObject<HTMLImageElement | null>
  active: boolean
  band: ScoreBandName
}

/**
 * Canvas overlay for the share section. It draws the Link forge only; the
 * dots frame the real badge so the score stays selectable and readable.
 */
export const LinkForge = forwardRef<LinkForgeHandle, LinkForgeProps>(
  function LinkForge({ badgeRef, active, band }, ref) {
    const { canvasRef, burst } = useLinkForge({ badgeRef, active, band })

    useImperativeHandle(ref, () => ({ burst }), [burst])

    return (
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-hidden="true"
        hidden={!active}
      />
    )
  },
)
