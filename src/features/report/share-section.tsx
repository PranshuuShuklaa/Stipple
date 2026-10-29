'use client'

import { useState, useRef, useEffect } from 'react'
import { animate } from 'animejs'
import type { Scan } from '@/lib/types/scan'
import { RiseText } from './rise-text'
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
import { scoreBand } from '@/features/share/badge-svg'
import { LinkForge, type LinkForgeHandle } from '@/features/share/link-forge'
import { useQualityTier } from './use-quality-tier'
import styles from './report.module.css'

/**
 * Share section: badge preview popping in, copy boxes for report link,
 * badge Markdown, animated card Markdown, and summary block Markdown.
 * Copy buttons use the Clipboard API with a fallback and show "Copied".
 */
export function ShareSection({ scan }: { scan: Scan }) {
  const sectionRef = useRef<HTMLElement | null>(null)
  const badgePreviewRef = useRef<HTMLDivElement | null>(null)
  const badgeImageRef = useRef<HTMLImageElement | null>(null)
  const forgeRef = useRef<LinkForgeHandle | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const copiedButtonRef = useRef<HTMLButtonElement | null>(null)
  const visible = useOnceWhenVisible(sectionRef, 0.3)
  const reducedMotion = useReducedMotion()
  const quality = useQualityTier()

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState('')
  const [copyPulse, setCopyPulse] = useState(0)
  const [siteUrl] = useState(() => getSiteUrl())

  const copyLabels: Record<string, string> = {
    link: 'Report link',
    badge: 'Badge Markdown',
    card: 'Card Markdown',
    summary: 'Summary block',
  }

  const plainMotion = reducedMotion || quality === 'low'
  const motionEnabled = !plainMotion
  const motionEnabledRef = useRef(motionEnabled)

  useEffect(() => {
    motionEnabledRef.current = motionEnabled
  }, [motionEnabled])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (copyPulse === 0 || !motionEnabledRef.current) return
    const button = copiedButtonRef.current
    if (!button) return

    const frame = window.requestAnimationFrame(() => {
      forgeRef.current?.burst(button)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [copyPulse])

  useEffect(() => {
    if (!visible) return
    const previews = badgePreviewRef.current
    if (!previews) return

    const tween = animate(
      previews,
      plainMotion
        ? { opacity: [0, 1], duration: 300, ease: 'linear' }
        : {
            scale: [0.7, 1],
            opacity: [0, 1],
            duration: 900,
            ease: 'outElastic(1, 0.6)',
          },
    )

    return () => {
      tween.revert()
    }
  }, [visible, plainMotion])

  const reportUrl = getReportUrl(scan.owner, scan.name, siteUrl)
  const badgeApiUrl = getBadgeApiUrl(scan.owner, scan.name, siteUrl)
  const cardApiUrl = getCardApiUrl(scan.owner, scan.name, siteUrl)
  const band = scoreBand(scan.health.score).name

  const badgeMarkdown = buildBadgeMarkdown(scan.owner, scan.name, siteUrl)
  const cardMarkdown = buildCardMarkdown(scan.owner, scan.name, siteUrl)
  const summaryBlock = buildSummaryMarkdown(scan, siteUrl)

  const handleCopy = async (
    key: string,
    text: string,
    button: HTMLButtonElement,
    label: string,
  ) => {
    const success = await copyToClipboard(text)
<<<<<<< HEAD
=======
    if (!success) {
      setCopyMessage('Copy failed. Select the text and copy it manually.')
      return
    }

    setCopyMessage(`${label} copied.`)
    copiedButtonRef.current = button
    setCopiedKey(key)
>>>>>>> 02806be17734b91a2914c4c7297afda106178ddf
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
    }

    if (!success) {
      setCopiedKey(null)
      setCopyMessage('Copy failed. Select the text and copy it manually.')
      copyTimerRef.current = window.setTimeout(() => {
        setCopyMessage('')
        copyTimerRef.current = null
      }, 4000)
      return
    }

    copiedButtonRef.current = button
    setCopiedKey(key)
    setCopyMessage(`${copyLabels[key] ?? 'Text'} copied to the clipboard.`)
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr))
      setCopyMessage('')
      copyTimerRef.current = null
    }, 1600)

    if (motionEnabled) {
      setCopyPulse((value) => value + 1)
    }
  }

  return (
    <section
      id="share"
<<<<<<< HEAD
      aria-labelledby="share-heading"
      ref={sectionRef}
      className={styles.shareSection}
=======
      ref={sectionRef}
      className={styles.shareSection}
      aria-labelledby="share-heading"
>>>>>>> 02806be17734b91a2914c4c7297afda106178ddf
    >
      <LinkForge
        ref={forgeRef}
        badgeRef={badgeImageRef}
        active={visible && motionEnabled}
        band={band}
      />
      <RiseText id="share-heading" text="Share." className={`type-section ${styles.sectionHeadline}`} />
      <p className={styles.sectionBody}>
        Embed this repo&apos;s live health badge and animated card in your README, or share the story link.
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {copyMessage}
      </p>

      <div className={styles.sharePreviews} ref={badgePreviewRef}>
        <div className={styles.previewCard}>
          <p className={styles.previewLabel}>Health badge</p>
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={badgeImageRef}
              className={styles.badgeImage}
              src={badgeApiUrl}
              alt={`${scan.owner}/${scan.name} Stipple health badge: ${scan.health.score} out of 100`}
            />
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </div>
        <div className={styles.previewCard}>
          <p className={styles.previewLabel}>Animated README card</p>
          <a href={reportUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
<<<<<<< HEAD
            <img
              src={cardApiUrl}
              alt={`${scan.owner}/${scan.name} Stipple animated card: ${scan.files.length.toLocaleString('en-US')} files, health ${scan.health.score} out of 100`}
              width="300"
              height="120"
              style={{ maxWidth: '100%', height: 'auto' }}
            />
=======
            <img src={cardApiUrl} alt={`${scan.owner}/${scan.name} Stipple animated card`} width="300" height="120" style={{ maxWidth: '100%', height: 'auto' }} />
>>>>>>> 02806be17734b91a2914c4c7297afda106178ddf
            <span className="visually-hidden"> (opens in a new tab)</span>
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
              onClick={(event) => handleCopy('link', reportUrl, event.currentTarget, 'Report link')}
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
              onClick={(event) =>
                handleCopy('badge', badgeMarkdown, event.currentTarget, 'Badge Markdown')
              }
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
              onClick={(event) =>
                handleCopy('card', cardMarkdown, event.currentTarget, 'Card Markdown')
              }
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
              onClick={(event) =>
                handleCopy('summary', summaryBlock, event.currentTarget, 'Summary block')
              }
            >
              {copiedKey === 'summary' ? 'Copied' : 'Copy summary'}
            </button>
          </div>
          <pre className={styles.copyPre}><code>{summaryBlock}</code></pre>
        </div>
      </div>
      <p className={styles.copyStatus} role="status" aria-live="polite">
        {copyMessage}
      </p>
    </section>
  )
}
