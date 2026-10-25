'use client'

import { useState, useRef, useEffect } from 'react'
import { animate } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { useOnceWhenVisible, useReducedMotion } from './use-once-when-visible'
import {
  getSiteUrl,
  getReportUrl,
  getBadgeApiUrl,
  getCardApiUrl,
  buildBadgeMarkdown,
  buildCardMarkdown,
  buildSummaryMarkdown,
  copyToClipboard,
} from '@/features/share/markdown'
import styles from './report.module.css'

/**
 * Share section: badge preview popping in, copy boxes for report link,
 * badge Markdown, animated card Markdown, and summary block Markdown.
 * Copy buttons use the Clipboard API with a fallback and show "Copied".
 */
export function ShareSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const badgePreviewRef = useRef<HTMLDivElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [siteUrl] = useState(() => getSiteUrl())

  useEffect(() => {
    if (!visible || reducedMotion) return
    const badgeEl = badgePreviewRef.current
    if (!badgeEl) return

    const tween = animate(badgeEl, {
      scale: [0.7, 1],
      opacity: [0, 1],
      duration: 900,
      ease: 'outElastic(1, 0.6)',
    })

    return () => {
      tween.revert()
    }
  }, [visible, reducedMotion])

  const reportUrl = getReportUrl(scan.owner, scan.name, siteUrl)
  const badgeApiUrl = getBadgeApiUrl(scan.owner, scan.name, siteUrl)
  const cardApiUrl = getCardApiUrl(scan.owner, scan.name, siteUrl)

  const badgeMarkdown = buildBadgeMarkdown(scan.owner, scan.name, siteUrl)
  const cardMarkdown = buildCardMarkdown(scan.owner, scan.name, siteUrl)
  const summaryBlock = buildSummaryMarkdown(scan, siteUrl)

  const handleCopy = async (key: string, text: string) => {
    const success = await copyToClipboard(text)
    if (success) {
      setCopiedKey(key)
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr))
      }, 1600)
    }
  }

  return (
    <section id="share" ref={sectionRef} className={styles.shareSection}>
      <h2 className={`type-section ${styles.sectionHeadline}`}>Share.</h2>
      <p className={styles.sectionBody}>
        Embed this repo&apos;s live health badge and animated card in your README, or share the story link.
      </p>

      <div className={styles.sharePreviews} ref={badgePreviewRef}>
        <div className={styles.previewCard}>
          <p className={styles.previewLabel}>Health badge</p>
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badgeApiUrl} alt={`${scan.owner}/${scan.name} Stipple health badge`} />
          </a>
        </div>
        <div className={styles.previewCard}>
          <p className={styles.previewLabel}>Animated README card</p>
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cardApiUrl} alt={`${scan.owner}/${scan.name} Stipple animated card`} width="300" height="120" style={{ maxWidth: '100%', height: 'auto' }} />
          </a>
        </div>
      </div>

      <div className={styles.copyGroups}>
        <div className={styles.copyGroup}>
          <div className={styles.copyHeader}>
            <span className={styles.copyTitle}>Report link</span>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => handleCopy('link', reportUrl)}
            >
              {copiedKey === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <code className={styles.copyCode}>{reportUrl}</code>
        </div>

        <div className={styles.copyGroup}>
          <div className={styles.copyHeader}>
            <span className={styles.copyTitle}>Badge Markdown</span>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => handleCopy('badge', badgeMarkdown)}
            >
              {copiedKey === 'badge' ? 'Copied' : 'Copy badge'}
            </button>
          </div>
          <code className={styles.copyCode}>{badgeMarkdown}</code>
        </div>

        <div className={styles.copyGroup}>
          <div className={styles.copyHeader}>
            <span className={styles.copyTitle}>Animated card Markdown</span>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => handleCopy('card', cardMarkdown)}
            >
              {copiedKey === 'card' ? 'Copied' : 'Copy card'}
            </button>
          </div>
          <code className={styles.copyCode}>{cardMarkdown}</code>
        </div>

        <div className={styles.copyGroup}>
          <div className={styles.copyHeader}>
            <span className={styles.copyTitle}>Summary block Markdown</span>
            <button
              type="button"
              className={styles.copyButton}
              onClick={() => handleCopy('summary', summaryBlock)}
            >
              {copiedKey === 'summary' ? 'Copied' : 'Copy summary'}
            </button>
          </div>
          <pre className={styles.copyPre}><code>{summaryBlock}</code></pre>
        </div>
      </div>
    </section>
  )
}
