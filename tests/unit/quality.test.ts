import { describe, it, expect } from 'vitest'
import {
  pickTier,
  FpsMeter,
  TierController,
  QUALITY_TIERS,
  QUALITY_CONFIG,
} from '@/engine/quality'
import { buildDotField, HARD_DOT_CAP } from '@/engine/dot-field'
import { createScanFixture } from '../fixtures/scan-fixture'
import type { Scan } from '@/lib/types/scan'

const SECOND = 1000

function framesAt(fps: number, count = 60): number[] {
  const interval = SECOND / fps
  return Array.from({ length: count }, (_, i) => i * interval)
}

function createBigScan(fileCount: number): Scan {
  const base = createScanFixture('big-repo')
  const files = Array.from({ length: fileCount }, (_, i) => {
    const source = base.files[i % base.files.length]
    return { ...source, path: `src/generated/file-${i}.ts`, size: (i % 17) + 1 }
  })
  return { ...base, files }
}

describe('pickTier', () => {
  it('picks High at 55 fps and above', () => {
    expect(pickTier(60)).toBe('high')
    expect(pickTier(55)).toBe('high')
    expect(pickTier(120)).toBe('high')
  })

  it('picks Medium between 45 and 55 fps', () => {
    expect(pickTier(54.9)).toBe('medium')
    expect(pickTier(50)).toBe('medium')
    expect(pickTier(45)).toBe('medium')
  })

  it('picks Low under 45 fps', () => {
    expect(pickTier(44.9)).toBe('low')
    expect(pickTier(30)).toBe('low')
    expect(pickTier(10)).toBe('low')
  })

  it('reduced motion forces Low regardless of fps', () => {
    expect(pickTier(60, true)).toBe('low')
    expect(pickTier(120, true)).toBe('low')
    expect(pickTier(30, true)).toBe('low')
  })
})

describe('FpsMeter', () => {
  it('measures close to 60 fps over 60 frames at 60 Hz', () => {
    const meter = new FpsMeter()
    let result: number | null = null
    for (const t of framesAt(60)) {
      result = meter.record(t)
    }
    expect(result).not.toBeNull()
    expect(result).toBeGreaterThan(59.9)
    expect(result).toBeLessThan(60.1)
  })

  it('measures about 40 fps when each frame takes 25 ms', () => {
    const meter = new FpsMeter()
    let result: number | null = null
    for (const t of framesAt(40)) {
      result = meter.record(t)
    }
    expect(result).not.toBeNull()
    expect(result).toBeGreaterThan(39.9)
    expect(result).toBeLessThan(40.1)
  })

  it('returns null while sampling and only reports on the final frame', () => {
    const meter = new FpsMeter()
    const frames = framesAt(60)
    for (let i = 0; i < frames.length - 1; i++) {
      expect(meter.record(frames[i])).toBeNull()
      expect(meter.isComplete).toBe(false)
      expect(meter.getFps()).toBeNull()
    }
    const final = meter.record(frames[frames.length - 1])
    expect(final).not.toBeNull()
    expect(meter.isComplete).toBe(true)
  })

  it('ignores extra frames after completion until reset', () => {
    const meter = new FpsMeter()
    const frames = framesAt(60)
    for (const t of frames) meter.record(t)
    expect(meter.record(99999)).toBeNull()
    expect(meter.getFps()).not.toBeNull()

    meter.reset()
    expect(meter.getFps()).toBeNull()
    expect(meter.isComplete).toBe(false)
  })
})

describe('TierController', () => {
  it('starts High by default and stays High on good fps', () => {
    const controller = new TierController()
    expect(controller.getTier()).toBe('high')

    const first = controller.evaluate(60, 0)
    const second = controller.evaluate(58, SECOND)
    expect(first.changed).toBe(false)
    expect(second.changed).toBe(false)
    expect(controller.getTier()).toBe('high')
  })

  it('downgrades to Low immediately on the first measurement', () => {
    const controller = new TierController()
    const result = controller.evaluate(30, 0)
    expect(result.changed).toBe(true)
    expect(result.previous).toBe('high')
    expect(result.tier).toBe('low')
  })

  it('never switches more than once every 5 seconds', () => {
    const controller = new TierController()
    expect(controller.evaluate(40, 0).tier).toBe('low')

    // Fast device appears before the cooldown ends: blocked
    const early = controller.evaluate(60, QUALITY_CONFIG.cooldownMs - 1)
    expect(early.changed).toBe(false)
    expect(controller.getTier()).toBe('low')

    // After the cooldown: switch allowed
    const later = controller.evaluate(60, QUALITY_CONFIG.cooldownMs)
    expect(later.changed).toBe(true)
    expect(later.tier).toBe('high')
  })

  it('ignores repeated evaluations of the same tier for the cooldown', () => {
    const controller = new TierController()
    controller.evaluate(50, 0) // switches High -> Medium at t=0

    // Fast device appears inside the cooldown: blocked, tier unchanged
    const blocked = controller.evaluate(60, 2 * SECOND)
    expect(blocked.changed).toBe(false)
    expect(controller.getTier()).toBe('medium')

    // After the cooldown the next real change goes through
    const allowed = controller.evaluate(60, QUALITY_CONFIG.cooldownMs)
    expect(allowed.changed).toBe(true)
    expect(allowed.tier).toBe('high')
  })

  it('starts at Low when reduced motion is on, and stays Low', () => {
    const controller = new TierController(true)
    expect(controller.getTier()).toBe('low')

    const result = controller.evaluate(60, 0)
    expect(result.changed).toBe(false)
    expect(controller.getTier()).toBe('low')
  })

  it('forces Low immediately via forceLow even inside the cooldown', () => {
    const controller = new TierController()
    expect(controller.evaluate(50, 0).tier).toBe('medium') // switches High -> Medium

    controller.setReducedMotion(true)

    // Inside the cooldown a normal evaluation would be blocked
    const blocked = controller.evaluate(35, 1000)
    expect(blocked.changed).toBe(false)
    expect(controller.getTier()).toBe('medium')

    const forced = controller.evaluate(60, 1000, { forceLow: true })
    expect(forced.changed).toBe(true)
    expect(forced.previous).toBe('medium')
    expect(forced.tier).toBe('low')

    // Already Low: a repeat evaluation is a no-op
    const repeat = controller.evaluate(60, 2000, { forceLow: true })
    expect(repeat.changed).toBe(false)
  })

  it('leaving reduced motion off can switch to High after the cooldown', () => {
    const controller = new TierController(true)
    controller.setReducedMotion(false)
    const result = controller.evaluate(60, 1000)
    expect(result.changed).toBe(true)
    expect(result.tier).toBe('high')
  })

  it('reports time until the next switch', () => {
    const controller = new TierController()
    controller.evaluate(40, 0)
    expect(controller.msUntilNextSwitch(1000)).toBe(QUALITY_CONFIG.cooldownMs - 1000)
    expect(controller.msUntilNextSwitch(4999)).toBe(1)
    expect(controller.msUntilNextSwitch(5000)).toBe(0)
  })
})

describe('Quality tier definitions (DESIGN.md)', () => {
  it('caps dots at 3000, 1500 and 600', () => {
    expect(QUALITY_TIERS.high.maxDots).toBe(3000)
    expect(QUALITY_TIERS.medium.maxDots).toBe(1500)
    expect(QUALITY_TIERS.low.maxDots).toBe(600)
  })

  it('turns effects off step by step', () => {
    expect(QUALITY_TIERS.high.effects).toEqual({
      pointerField: true,
      ambientFlow: true,
      perFrameEffects: true,
    })
    expect(QUALITY_TIERS.medium.effects.pointerField).toBe(false)
    expect(QUALITY_TIERS.medium.effects.ambientFlow).toBe(false)
    expect(QUALITY_TIERS.low.effects.perFrameEffects).toBe(false)
  })
})

describe('buildDotField', () => {
  it('keeps one dot per file at or under the cap', () => {
    const scan = createScanFixture('stipple/stipple')
    const field = buildDotField(scan, HARD_DOT_CAP)

    expect(field.dotCount).toBe(240)
    expect(field.totalFiles).toBe(240)
    expect(field.filesPerDot).toBe(1)
    expect(field.scan).toBe(scan)
    expect(field.scan.files[0].path).toBe(scan.files[0].path)
  })

  it('aggregates above 2,500 files into at most 2,500 dots', () => {
    const scan = createBigScan(5000)
    const field = buildDotField(scan, HARD_DOT_CAP)

    expect(field.dotCount).toBe(2500)
    expect(field.totalFiles).toBe(5000)
    expect(field.filesPerDot).toBe(2)
    expect(field.scan.files.length).toBe(2500)
  })

  it('preserves the total file size when aggregating (weighted by size)', () => {
    const scan = createBigScan(3800)
    const field = buildDotField(scan, 2500)

    const totalSize = scan.files.reduce((sum, f) => sum + f.size, 0)
    const dotSize = field.scan.files.reduce((sum, f) => sum + f.size, 0)
    expect(dotSize).toBe(totalSize)
  })

  it('takes representative language and folder from the largest file of each group', () => {
    const scan = createBigScan(10000)
    const field = buildDotField(scan, 2000)

    for (let j = 0; j < field.dotCount; j++) {
      const start = Math.floor((j * 10000) / 2000)
      const end = Math.floor(((j + 1) * 10000) / 2000)
      let largest = scan.files[start]
      for (let i = start; i < end; i++) {
        if (scan.files[i].size > largest.size) largest = scan.files[i]
      }
      const dot = field.scan.files[j]
      expect(dot.language).toBe(largest.language)
      expect(dot.folder).toBe(largest.folder)
      expect(dot.week).toBe(largest.week)
      expect(dot.name).toBe(largest.name)
      expect(dot.size).toBeGreaterThanOrEqual(largest.size)
    }
  })

  it('honors a tier cap below the total dot count', () => {
    const scan = createBigScan(5000)
    const field = buildDotField(scan, QUALITY_TIERS.low.maxDots)

    expect(field.dotCount).toBe(600)
    expect(field.filesPerDot).toBe(Math.ceil(5000 / 600))
  })

  it('handles an empty file list', () => {
    const scan = createScanFixture('empty-repo')
    const field = buildDotField({ ...scan, files: [] }, 2500)

    expect(field.dotCount).toBe(0)
    expect(field.totalFiles).toBe(0)
    expect(field.filesPerDot).toBe(1)
    expect(Number.isFinite(field.filesPerDot)).toBe(true)
  })
})
