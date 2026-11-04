export { DotEngine, type DotEngineOptions, type MorphOptions, type LayoutName } from './renderer'
export {
  QUALITY_TIERS,
  QUALITY_CONFIG,
  pickTier,
  FpsMeter,
  TierController,
  type QualityTierName,
  type QualityTier,
  type QualityEffects,
  type TierEvaluation,
} from './quality'
export { publishQualityTier, readQualityTier, subscribeQualityTier } from './quality-signal'
export { buildDotField, HARD_DOT_CAP, MIN_POOL_SIZE, calculatePoolSize, type DotField } from './dot-field'
export { calculateFilesLayout, type LayoutTarget, type ThemeColors, type Viewport } from './layouts/files'
export { calculateLanguagesLayout } from './layouts/languages'
export { calculateActivityLayout } from './layouts/activity'
export { calculateFoldersLayout, type FoldersLayoutTarget, type FolderLabel } from './layouts/folders'
export {
  calculatePulseLayout,
  getPulseLabelsData,
  type PulseLayoutTarget,
  type PulseLabelsData,
  type PulseMonthLabel,
  type PulseWeekdayLabel,
} from './layouts/pulse'
export { SpatialGrid, type NearestDotResult } from './spatial-grid'
export { resolveThemeColors, parseColor } from './colors'
export { MOTION } from './motion'
