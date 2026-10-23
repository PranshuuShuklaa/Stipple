'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { animate } from 'animejs'
import { DotStage, type DotStageHandle } from '@/components/ui/dot-stage'
import type { DotEngine } from '@/engine/renderer'
import type { Scan } from '@/lib/types/scan'
import { SCAN_FALLBACK_AFTER_MS, SCAN_MAX_WAIT_MS, SCAN_REVEAL_MS, type ScanStageEvent } from '@/lib/scan-stages'
import {
  MAX_WAIT_ERROR,
  createPlaceholderScan,
  initialScanFlowState,
  processScanFlowEvent,
  scanFlowMessage,
  sweepCreepTarget,
  type DesignedError,
  type ScanFlowEvent,
  type ScanFlowState,
} from './scan-flow'
import styles from './scan-screen.module.css'

const PLACEHOLDER_DOT_COUNT = 240

const FALLBACK_FETCH_ERROR: DesignedError = {
  code: 'upstream',
  message: 'GitHub is having trouble right now. Try again in a few minutes.',
}

const ERROR_TITLE: Record<string, string> = {
  not_found: 'No report for this repo.',
  private_or_missing: 'This repo is not reachable.',
  empty_repo: 'Nothing to scan yet.',
  rate_limited: 'The shared GitHub limit is used up.',
  invalid_input: 'That address does not look right.',
  upstream: 'GitHub is having trouble.',
}

type SweepModeName = 'off' | 'waiting' | 'shimmer' | 'reveal'

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function ScanScreen({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter()
  const [runId, setRunId] = useState(0)
  const [state, setState] = useState<ScanFlowState>(initialScanFlowState)

  const stageRef = useRef<DotStageHandle>(null)
  const stateRef = useRef(state)
  const startAtRef = useRef(0)
  const pendingScanRef = useRef<Scan | null>(null)
  const sweepModeRef = useRef<SweepModeName>('waiting')
  const navigatedRef = useRef(false)
  const revealAnimRef = useRef<ReturnType<typeof animate> | null>(null)
  const tickerRef = useRef<number | null>(null)

  // The steady creep reads the live state inside the rAF callback, so
  // the ref follows the committed render instead of the render pass.
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )

  const placeholder = useMemo(
    () => createPlaceholderScan(PLACEHOLDER_DOT_COUNT, owner, repo),
    [owner, repo],
  )

  const process = useCallback((event: ScanFlowEvent) => {
    setState((previous) => processScanFlowEvent(previous, event))
  }, [])

  const retry = useCallback(() => {
    navigatedRef.current = false
    pendingScanRef.current = null
    setState(initialScanFlowState())
    setRunId((value) => value + 1)
  }, [])

  // Field readiness: a stage or scan event that lands before the engine
  // mounts is held and applied the moment the engine exists.
  const handleEngineReady = useCallback((engine: DotEngine | null) => {
    if (!engine) return
    engine.setSweepMode(sweepModeRef.current)
    if (pendingScanRef.current) {
      engine.setScan(pendingScanRef.current)
      pendingScanRef.current = null
    }
  }, [])

  // One stream plus one timer pair per run. Retry tears it all down.
  useEffect(() => {
    navigatedRef.current = false
    startAtRef.current = performance.now()
    const source = new EventSource(`/api/scan-progress/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)

    const parse = (event: Event): unknown => {
      try {
        return JSON.parse(String((event as MessageEvent).data ?? ''))
      } catch {
        return null
      }
    }

    const onStage = (event: Event) => {
      const data = parse(event) as ScanStageEvent | null
      if (!data || typeof data.stage !== 'string') return
      process({
        type: 'stage',
        stage: data.stage,
        files: typeof data.files === 'number' ? data.files : undefined,
      })
    }

    const onDone = (event: Event) => {
      const data = parse(event) as { scan?: Scan } | null
      if (!data?.scan) return
      source.close()
      process({ type: 'scan-ready', scan: data.scan, source: 'stream' })
    }

    const onError = (event: Event) => {
      if (event instanceof MessageEvent && typeof event.data === 'string' && event.data !== '') {
        const data = parse(event) as { error?: DesignedError } | null
        source.close()
        process({ type: 'designed-error', error: data?.error ?? FALLBACK_FETCH_ERROR })
        return
      }
      // The connection broke (blocked URL, network drop, server restart).
      source.close()
      process({ type: 'stream-lost' })
    }

    source.addEventListener('stage', onStage)
    source.addEventListener('done', onDone)
    source.addEventListener('error', onError)

    const fallbackTimer = window.setTimeout(() => {
      process({ type: 'stream-lost' })
    }, SCAN_FALLBACK_AFTER_MS)
    const maxWaitTimer = window.setTimeout(() => {
      process({ type: 'max-wait', error: { ...MAX_WAIT_ERROR } })
    }, SCAN_MAX_WAIT_MS)

    return () => {
      source.close()
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(maxWaitTimer)
      if (tickerRef.current !== null) {
        window.cancelAnimationFrame(tickerRef.current)
        tickerRef.current = null
      }
      revealAnimRef.current?.pause()
      revealAnimRef.current = null
    }
  }, [runId, owner, repo, process])

  // When the stream answers nothing in time, the plain request rescues the scan.
  useEffect(() => {
    if (state.phase !== 'fallback') return
    const controller = new AbortController()
    const run = async () => {
      try {
        const response = await fetch(`/api/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
          signal: controller.signal,
        })
        const body = (await response.json()) as { scan?: Scan; error?: DesignedError }
        if (body.scan) {
          process({ type: 'scan-ready', scan: body.scan, source: 'fallback' })
        } else if (body.error) {
          process({ type: 'designed-error', error: body.error })
        } else {
          process({ type: 'designed-error', error: FALLBACK_FETCH_ERROR })
        }
      } catch {
        if (controller.signal.aborted) return
        process({ type: 'designed-error', error: FALLBACK_FETCH_ERROR })
      }
    }
    void run()
    return () => controller.abort()
  }, [state.phase, runId, owner, repo, process])

  // The placeholder grid takes the real count when the tree event lands.
  useEffect(() => {
    if (state.files === null) return
    const scan = createPlaceholderScan(state.files, owner, repo)
    const engine = stageRef.current?.getEngine()
    if (!engine) {
      pendingScanRef.current = scan
      return
    }
    engine.setScan(scan)
  }, [state.files, owner, repo])

  // The real scan lands: hand it to the field; the reveal finishes the sweep.
  useEffect(() => {
    if (!state.scan) return
    const engine = stageRef.current?.getEngine()
    if (!engine) {
      pendingScanRef.current = state.scan
      return
    }
    engine.setScan(state.scan)
  }, [state.scan])

  // Sweep mode follows the phase; reduced motion gets neither line nor shimmer.
  useEffect(() => {
    const mode: SweepModeName = reducedMotion
      ? 'off'
      : state.phase === 'streaming'
        ? 'waiting'
        : state.phase === 'fallback'
          ? 'shimmer'
          : state.phase === 'revealing'
            ? 'reveal'
            : 'off'
    sweepModeRef.current = mode
    stageRef.current?.getEngine()?.setSweepMode(mode)
  }, [state.phase, reducedMotion])

  // Steady creep while the stream works; the stage caps bound every frame.
  useEffect(() => {
    if (state.phase !== 'streaming' || reducedMotion) return
    const tick = () => {
      const engine = stageRef.current?.getEngine()
      if (engine) {
        const elapsed = performance.now() - startAtRef.current
        engine.setSweepLine(sweepCreepTarget(elapsed, stateRef.current.stagesCompleted))
      }
      tickerRef.current = window.requestAnimationFrame(tick)
    }
    tickerRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (tickerRef.current !== null) {
        window.cancelAnimationFrame(tickerRef.current)
        tickerRef.current = null
      }
    }
  }, [state.phase, reducedMotion])

  // The color reveal runs the line out to the full width once the scan is held.
  useEffect(() => {
    if (state.phase !== 'revealing') return
    const engine = stageRef.current?.getEngine()
    if (engine && !reducedMotion) {
      const proxy = { line: engine.getSweepLine() }
      const animation = animate(proxy, {
        line: 1,
        duration: SCAN_REVEAL_MS,
        ease: 'outQuad',
        onUpdate: () => engine.setSweepLine(proxy.line),
      })
      revealAnimRef.current = animation
    }
    return () => {
      revealAnimRef.current?.pause()
      revealAnimRef.current = null
    }
  }, [state.phase, reducedMotion])

  // Navigate a beat after the scan is in; the cross-fade covers reduced motion.
  useEffect(() => {
    if (state.phase !== 'revealing') return
    const delay = reducedMotion ? 300 : SCAN_REVEAL_MS + 120
    const timer = window.setTimeout(() => {
      process({ type: 'reveal-finished' })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [state.phase, reducedMotion, process])

  useEffect(() => {
    if (!state.navigated || navigatedRef.current) return
    navigatedRef.current = true
    void router.replace(`/r/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  }, [state.navigated, router, owner, repo])

  if (state.phase === 'error') {
    return (
      <div className="shell">
        <h1 className="type-section">
          {ERROR_TITLE[state.error?.code ?? 'upstream'] ?? 'GitHub is having trouble.'}
        </h1>
        <p className={styles.errorBody}>
          github.com/{owner}/{repo}: {state.error?.message ?? 'The scan could not finish.'}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.retry} onClick={retry}>
            Retry
          </button>
          <Link href="/" className={styles.alt}>
            Scan a different repo
          </Link>
        </div>
      </div>
    )
  }

  const revealing = state.phase === 'revealing'

  return (
    <div className="shell">
      <h1 className="type-section">Scanning {owner}/{repo}</h1>
      <div
        className={`${styles.stageBox} ${revealing && reducedMotion ? styles.crossfade : ''}`}
        aria-busy={!revealing}
      >
        <DotStage
          key={runId}
          ref={stageRef}
          scan={placeholder}
          variant="scan"
          className={styles.stage}
          ariaLabel={`Scanning ${owner}/${repo}: a sweep line over gray dots`}
          onEngineReady={handleEngineReady}
        />
      </div>
      <p className={styles.status} role="status" aria-live="polite">
        {scanFlowMessage(state, owner, repo)}
      </p>
    </div>
  )
}
