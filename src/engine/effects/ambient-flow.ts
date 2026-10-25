/**
 * Ambient flow (DESIGN.md signature 11): a very slow noise field makes the
 * dots breathe while the stage is idle. High tier only; the caller gates it
 * with QUALITY_TIERS.high.effects.ambientFlow.
 *
 * The two waves per axis are deliberately slow and spatially coherent, and
 * their coefficients cap the combined vector under 3 px. The function writes
 * into a caller-owned pair so a frame allocates nothing.
 */

export const AMBIENT_MAX_AMPLITUDE_PX = 2.8

const X_WAVE_A = 1.05
const X_WAVE_B = 0.75
const Y_WAVE_A = 1.05
const Y_WAVE_B = 0.75

export function sampleAmbientOffset(
  out: Float32Array,
  index: number,
  centerX: number,
  centerY: number,
  timeMs: number,
): void {
  const t = timeMs
  out[0] =
    Math.sin(t * 0.00016 + centerX * 0.012 + index * 0.618) * X_WAVE_A +
    Math.sin(t * 0.00009 + centerY * 0.02 + index * 0.271) * X_WAVE_B
  out[1] =
    Math.cos(t * 0.00013 + centerY * 0.011 + index * 0.383) * Y_WAVE_A +
    Math.cos(t * 0.00007 + centerX * 0.017 + index * 0.517) * Y_WAVE_B
}
