import type { Scan } from '@/lib/types/scan'
import type { ThemeColors, Viewport } from './files'
import { calculateFoldersLayout } from './folders'

export const calculateStructureLayout = calculateFoldersLayout
export type { FoldersLayoutTarget as StructureLayoutTarget } from './folders'
export type StructureLayoutArgs = [Scan, Viewport, ThemeColors]
