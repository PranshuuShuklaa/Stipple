'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { animate, stagger, utils, type Target } from 'animejs'
import styles from './odometer.module.css'

interface OdometerProps {
  /** Final, already formatted value (digits and separators only). */
  text: string
  /** Play the roll once the section is visible. */
  start: boolean
  /** False for reduced motion: the final number stays static. */
  animate: boolean
  className?: string
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Odometer: each digit is a vertical strip that rolls from 0 to its final
 * value, staggered from the last digit, 1400 ms easeOutExpo. The server
 * markup already shows the final number; the client rewinds it before the
 * section can be seen, so the roll never starts from a visibly finished
 * counter, and no-JS and reduced motion stay honest.
 */
export function Odometer({ text, start, animate: shouldAnimate, className }: OdometerProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const playedRef = useRef(false)

  useIsomorphicLayoutEffect(() => {
    if (!shouldAnimate || playedRef.current) return
    const root = rootRef.current
    if (!root) return
    const strips = root.querySelectorAll<HTMLElement>('[data-odometer-strip]')
    if (strips.length === 0) return
    utils.set(strips, { y: '0em' })
  }, [shouldAnimate, text])

  useEffect(() => {
    if (!shouldAnimate || !start || playedRef.current) return
    const root = rootRef.current
    if (!root) return
    const strips = root.querySelectorAll<HTMLElement>('[data-odometer-strip]')
    if (strips.length === 0) return
    playedRef.current = true

    const animation = animate(strips, {
      y: (target: Target) => {
        const strip = target as HTMLElement
        const digit = Number(strip.dataset.odometerDigit)
        return ['0em', `-${Number.isFinite(digit) ? digit : 0}em`]
      },
      duration: 1400,
      ease: 'outExpo',
      delay: stagger(60, { from: 'last' }),
    })

    return () => {
      animation.revert()
      for (const strip of strips) {
        const digit = Number(strip.dataset.odometerDigit)
        const value = Number.isFinite(digit) ? digit : 0
        strip.style.transform = `translateY(-${value}em)`
      }
    }
  }, [shouldAnimate, start])

  const characters = Array.from(text)

  return (
    <span
      ref={rootRef}
      className={className ? `${styles.odometer} ${className}` : styles.odometer}
    >
      <span className={styles.digits} aria-hidden="true">
        {characters.map((character, index) => {
          if (!/[0-9]/.test(character)) {
            return (
              <span className={styles.separator} key={`${character}-${index}`}>
                {character}
              </span>
            )
          }
          const digit = Number(character)
          return (
            <span className={styles.window} key={`${character}-${index}`}>
              <span
                className={styles.strip}
                data-odometer-strip
                data-odometer-digit={character}
                style={{ transform: `translateY(-${digit}em)` }}
              >
                {DIGITS.map((row) => (
                  <span className={styles.digit} key={row}>
                    {row}
                  </span>
                ))}
              </span>
            </span>
          )
        })}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  )
}
