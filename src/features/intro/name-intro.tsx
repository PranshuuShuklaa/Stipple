'use client'

import { useEffect, useRef } from 'react'
import { animate, stagger } from 'animejs'
import type { JSAnimation } from 'animejs'
import styles from './name-intro.module.css'

const WORD = 'stipple'
const SESSION_KEY = 'stipple:name-entrance-played-v2'

interface NameIntroProps {
  onDone: () => void
}

function isReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function finishWordmark(wordmark: HTMLElement): void {
  wordmark.style.transform = 'none'
  wordmark.style.opacity = '1'
  wordmark.querySelectorAll<HTMLElement>('.wordmark-letter').forEach((letter) => {
    letter.style.opacity = '1'
    letter.style.transform = 'none'
  })
  const mark = wordmark.querySelector<HTMLElement>('.wordmark-mark')
  if (mark) {
    mark.style.opacity = '1'
    mark.style.transform = 'none'
  }
}

export function NameIntro({ onDone }: NameIntroProps) {
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wordmark = document.querySelector<HTMLElement>('.wordmark')
    if (!wordmark) {
      onDone()
      return
    }

    const root = document.documentElement
    const content = document.querySelector<HTMLElement>('.home')
    const letters = Array.from(
      wordmark.querySelectorAll<HTMLElement>('.wordmark-letter')
    )
    const mark = wordmark.querySelector<HTMLElement>('.wordmark-mark')
    const nav = document.querySelector<HTMLElement>('.theme-toggle')
    const animations: JSAnimation[] = []
    let finished = false
    let frame = 0
    let skipHandler: ((event: Event) => void) | null = null
    const pointerMove = (event: PointerEvent) => {
      if (isReducedMotion()) return
      document.querySelectorAll<HTMLElement>('.headline-letter').forEach((letter) => {
        const rect = letter.getBoundingClientRect()
        const dx = rect.left + rect.width / 2 - event.clientX
        const dy = rect.top + rect.height / 2 - event.clientY
        const distance = Math.hypot(dx, dy)
        if (distance < 180 && distance > 0) {
          const amount = (1 - distance / 180) * 18
          letter.style.translate = `${(dx / distance) * amount}px ${(dy / distance) * amount}px`
        } else {
          letter.style.translate = '0 0'
        }
      })
    }

    const complete = () => {
      if (finished) return
      finished = true
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        // Session storage is optional; the entrance still completes without it.
      }
      if (skipHandler) {
        window.removeEventListener('pointerdown', skipHandler)
        window.removeEventListener('keydown', skipHandler)
      }
      finishWordmark(wordmark)
      content?.classList.remove('introPending')
      root.removeAttribute('data-name-entrance')
      onDone()
    }

    const animateLivingWordmark = (time: number) => {
      if (isReducedMotion()) return
      const seconds = time / 1000
      const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)']
      letters.forEach((letter, index) => {
        letter.style.color = colors[Math.floor((seconds * 0.7 + index * 0.11) % colors.length)]
        letter.style.translate = `0 ${Math.sin(seconds * 2.4 + index * 0.8) * 2.2}px`
      })
      frame = requestAnimationFrame(animateLivingWordmark)
    }

    const skip = () => {
      animations.forEach((animation) => animation.seek(animation.duration))
      complete()
    }

    const start = () => {
      if (isReducedMotion()) {
        finishWordmark(wordmark)
        content?.classList.remove('introPending')
        try {
          window.sessionStorage.setItem(SESSION_KEY, '1')
        } catch {
          // Session storage is optional.
        }
        onDone()
        return
      }

      const rect = wordmark.getBoundingClientRect()
      const scale = Math.min(9, (window.innerWidth * (window.innerWidth > 820 ? 0.5 : 0.8)) / rect.width)
      const x = window.innerWidth / 2 - (rect.left + (rect.width * scale) / 2)
      const y = window.innerHeight / 2 - (rect.top + (rect.height * scale) / 2)

      wordmark.style.transformOrigin = '0 0'
      const setWordmarkPosition = (progress: number) => {
        const remaining = 1 - progress
        const currentScale = scale + (1 - scale) * progress
        wordmark.style.transform = `translate(${x * remaining}px, ${y * remaining}px) scale(${currentScale})`
      }
      setWordmarkPosition(0)
      wordmark.style.opacity = '1'
      letters.forEach((letter) => {
        letter.style.opacity = '0'
        letter.style.transform = 'translateY(40px) rotate(-14deg) scale(0)'
      })
      if (mark) {
        mark.style.opacity = '0'
        mark.style.transform = 'scale(0)'
      }

      if (mark) {
        animations.push(
          animate(mark, {
            opacity: [0, 1],
            scale: [0, 1],
            duration: 900,
            ease: 'outElastic(1, .5)',
          })
        )
      }
      const glide = { progress: 0 }
      animations.push(
        animate(letters, {
          opacity: [0, 1],
          scale: [0, 1],
          rotate: [-14, 0],
          translateY: [40, 0],
          duration: 1000,
          delay: stagger(80, { start: 250 }),
          ease: 'outElastic(1, .55)',
        }),
        animate(glide, {
          progress: 1,
          duration: 1100,
          delay: 1800,
          ease: 'inOutExpo',
          update: () => setWordmarkPosition(glide.progress),
        })
      )
      if (nav) {
        animations.push(
          animate(nav, {
            opacity: [0, 1],
            duration: 700,
            delay: 2500,
            ease: 'outQuad',
          })
        )
      }

      const ring = ringRef.current
      if (ring) {
        animations.push(
          animate(ring, {
            opacity: [0, 0.8, 0],
            scale: [0.2, 1],
            duration: 900,
            delay: 1000,
            ease: 'outQuad',
          })
        )
      }

      if (content) {
        animations.push(
          animate(content, {
            opacity: [0, 1],
            duration: 900,
            delay: 3400,
            ease: 'outQuad',
            onComplete: complete,
          })
        )
      }

      const headlineLetters = document.querySelectorAll<HTMLElement>('.headline-letter')
      if (headlineLetters.length > 0) {
        animations.push(
          animate(headlineLetters, {
            translateY: ['115%', '0%'],
            opacity: [0, 1],
            duration: 1100,
            delay: stagger(30, { start: 2600 }),
            ease: 'outExpo',
          })
        )
      }

      skipHandler = skip
      window.addEventListener('pointerdown', skipHandler)
      window.addEventListener('keydown', skipHandler)
      window.addEventListener('pointermove', pointerMove)
      frame = requestAnimationFrame(animateLivingWordmark)
      window.setTimeout(complete, 4300)
    }

    root.setAttribute('data-name-entrance', 'pending')
    if (content) content.classList.add('introPending')

    const params = new URLSearchParams(window.location.search)
    const replay = params.get('intro') === '1'
    let played = false
    try {
      played = window.sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      played = false
    }

    if (played && !replay) {
      finishWordmark(wordmark)
      content?.classList.remove('introPending')
      onDone()
      frame = requestAnimationFrame(animateLivingWordmark)
    } else {
      start()
    }

    return () => {
      animations.forEach((animation) => animation.revert())
      cancelAnimationFrame(frame)
      if (skipHandler) {
        window.removeEventListener('pointerdown', skipHandler)
        window.removeEventListener('keydown', skipHandler)
      }
      window.removeEventListener('pointermove', pointerMove)
      root.removeAttribute('data-name-entrance')
      content?.classList.remove('introPending')
    }
  }, [onDone])

  return (
    <>
      <div className={styles.reducedWordmark} data-intro-wordmark aria-hidden="true">
        {WORD}
      </div>
      <div ref={ringRef} className={styles.ring} aria-hidden="true" />
    </>
  )
}

export { WORD }
