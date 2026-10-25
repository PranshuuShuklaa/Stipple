'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { animate, splitText, stagger, utils, type TextSplitter } from 'animejs'
import { useOnceWhenVisible, useReducedMotion } from './use-once-when-visible'
import styles from './report.module.css'

interface RiseTextProps {
  /** Plain text only: splitText rewrites the DOM into line wrappers. */
  text: string
  className?: string
  as?: 'h2' | 'h3'
}

/**
 * Text rise: the heading splits into lines, each line sits in its own
 * clipped mask and slides up from below once, on scroll entry. 700 ms
 * outExpo, 80 ms between lines. Reduced motion leaves plain text alone.
 */
export function RiseText({ text, className, as: Tag = 'h2' }: RiseTextProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const contentRef = useRef<HTMLSpanElement | null>(null)
  const visibleRef = useRef(false)
  const startRef = useRef<(() => void) | null>(null)
  const playedRef = useRef(false)
  const visible = useOnceWhenVisible(headingRef, 0.3)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const content = contentRef.current
    if (!content || reducedMotion) return

    const splitter = splitText(content, {
      lines: { wrap: 'clip' },
      words: false,
      chars: false,
      accessible: false,
    })
    let animation: { revert: () => void } | null = null

    const start = () => {
      const lines = splitter.lines as HTMLElement[]
      if (playedRef.current || lines.length === 0) return
      playedRef.current = true
      animation = animate(lines, {
        y: ['140%', '0%'],
        duration: 700,
        ease: 'outExpo',
        delay: stagger(80),
      })
    }

    startRef.current = start

    splitter.addEffect((instance: TextSplitter) => {
      const lines = instance.lines as HTMLElement[]
      if (lines.length === 0) return
      utils.set(lines, { y: playedRef.current ? '0%' : '140%' })
      if (visibleRef.current && !playedRef.current) start()
    })

    if (visibleRef.current && !playedRef.current) start()

    return () => {
      startRef.current = null
      animation?.revert()
      splitter.revert()
    }
  }, [reducedMotion])

  useEffect(() => {
    visibleRef.current = visible
    if (visible) startRef.current?.()
  }, [visible])

  return (
    <Tag ref={headingRef} className={className}>
      <span ref={contentRef} className={styles.riseContent}>
        {text}
      </span>
    </Tag>
  )
}

interface RiseMaskProps {
  children: ReactNode
  className?: string
  as?: 'h2' | 'h3'
}

/**
 * Masked rise for a heading that React keeps updating (the health score).
 * No splitting: the whole line block slides up behind a clip, so the live
 * score node stays the same node and its count-up keeps working.
 */
export function RiseMask({ children, className, as: Tag = 'h2' }: RiseMaskProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const innerRef = useRef<HTMLSpanElement | null>(null)
  const playedRef = useRef(false)
  const visible = useOnceWhenVisible(headingRef, 0.3)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    if (reducedMotion) {
      utils.set(inner, { y: '0%' })
      return
    }
    if (!visible) {
      if (!playedRef.current) utils.set(inner, { y: '140%' })
      return
    }
    if (playedRef.current) {
      utils.set(inner, { y: '0%' })
      return
    }
    playedRef.current = true
    const animation = animate(inner, {
      y: ['140%', '0%'],
      duration: 700,
      ease: 'outExpo',
    })
    return () => {
      animation.revert()
      utils.set(inner, { y: '0%' })
    }
  }, [visible, reducedMotion])

  return (
    <Tag ref={headingRef} className={className}>
      <span className={styles.riseMask}>
        <span ref={innerRef} className={styles.riseInner}>
          {children}
        </span>
      </span>
    </Tag>
  )
}
