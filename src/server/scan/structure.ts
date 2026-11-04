import type { ScanFile, ScanStructure } from '@/lib/types/scan'

export type StructureClass = keyof ScanStructure['codeSplit']

const TEST_SEGMENTS = new Set(['test', 'tests', '__tests__', 'spec', 'e2e'])
const ASSET_SEGMENTS = new Set(['images', 'fonts', 'audio', 'video', 'svg', 'public', 'static', 'assets'])
const CODE_EXTENSIONS = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'dart', 'go', 'h', 'hpp', 'html', 'java', 'js', 'jsx', 'json',
  'kt', 'mjs', 'php', 'py', 'rb', 'rs', 'sass', 'scala', 'scss', 'sh', 'sql', 'svelte', 'swift',
  'ts', 'tsx', 'vue',
])

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).toLowerCase()
}

function extension(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1)
}

function isLockfile(name: string): boolean {
  return /(?:^|[-_.])(lock|lockfile)(?:$|[-_.])/.test(name) ||
    /^(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|cargo\.lock|gemfile\.lock)$/.test(name)
}

function isMinified(name: string): boolean {
  return /\.min\.[^.]+$/.test(name)
}

export function classify(path: string, language: string | null = null): StructureClass {
  const normalized = path.toLowerCase().replace(/\\/g, '/')
  const name = basename(normalized)
  const segments = normalized.split('/').filter(Boolean)

  if (
    segments.some((segment) => TEST_SEGMENTS.has(segment)) ||
    /\.(?:test|spec)\.[^.]+$/.test(name)
  ) return 'tests'
  if (
    segments.some((segment) => segment === 'docs' || segment === 'doc') ||
    /\.(?:md|mdx|rst)$/.test(name) ||
    name === 'license' ||
    name.startsWith('license.')
  ) return 'docs'
  if (
    segments.some((segment) => ASSET_SEGMENTS.has(segment)) ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|mp4|webm|mov)$/.test(name)
  ) return 'assets'
  if (
    (segments.length === 1 && name.startsWith('.')) ||
    isLockfile(name) ||
    /(?:^|\.)(?:json|ya?ml|toml)$/.test(name) ||
    /\.config\.[^.]+$/.test(name) ||
    name === 'dockerfile'
  ) return 'config'
  if (language !== null || CODE_EXTENSIONS.has(extension(normalized))) return 'source'
  return 'other'
}

export const classifyPath = classify

export function codeSplit(files: ScanFile[]): ScanStructure['codeSplit'] {
  const split: ScanStructure['codeSplit'] = {
    source: 0,
    tests: 0,
    docs: 0,
    config: 0,
    assets: 0,
    other: 0,
  }
  for (const file of files) split[classify(file.path, file.language)]++
  return split
}

export function largestFiles(files: ScanFile[]): ScanStructure['largest'] {
  return files
    .filter((file) => !isLockfile(file.name.toLowerCase()) && !isMinified(file.name.toLowerCase()))
    .slice()
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, 5)
    .map((file) => ({ path: file.path, size: file.size }))
}

export function maxDepth(files: ScanFile[]): number {
  return files.reduce((max, file) => {
    const segments = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
    return Math.max(max, Math.max(0, segments.length - 1))
  }, 0)
}

export function topFolders(files: ScanFile[]): number {
  return new Set(
    files
      .map((file) => file.path.replace(/\\/g, '/').split('/').filter(Boolean))
      .filter((segments) => segments.length > 1)
      .map((segments) => segments[0])
      .filter((segment): segment is string => Boolean(segment)),
  ).size
}

export function structureFromFiles(files: ScanFile[]): ScanStructure {
  return {
    codeSplit: codeSplit(files),
    largest: largestFiles(files),
    maxDepth: maxDepth(files),
    topFolders: topFolders(files),
  }
}
