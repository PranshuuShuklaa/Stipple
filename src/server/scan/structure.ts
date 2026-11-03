import type { ScanFile, ScanStructure } from '@/lib/types/scan'

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function classifyPath(path: string, language: string | null): keyof ScanStructure['codeSplit'] {
  const lower = path.toLowerCase()
  const name = fileName(lower)
  const segments = lower.split('/')
  if (segments.some((part) => ['test', 'tests', '__tests__', 'spec', 'e2e'].includes(part)) || /\.(test|spec)\.[^.]+$/.test(name)) return 'tests'
  if (segments.some((part) => ['docs', 'doc'].includes(part)) || /\.(md|mdx|rst)$/.test(name) || name === 'license') return 'docs'
  if (segments.some((part) => ['public', 'static', 'assets'].includes(part)) || /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp3|mp4)$/.test(name)) return 'assets'
  if ((path.startsWith('.') && !path.includes('/')) || /\.(json|ya?ml|toml)$/.test(name) || /\.config\.[^.]+$/.test(name) || /^(dockerfile|.*lock)$/.test(name)) return 'config'
  if (language) return 'source'
  return 'other'
}

export function structureFromFiles(files: ScanFile[]): ScanStructure {
  const codeSplit = { source: 0, tests: 0, docs: 0, config: 0, assets: 0, other: 0 }
  for (const file of files) codeSplit[classifyPath(file.path, file.language)]++
  const largest = files
    .filter((file) => !/(lock|\.min\.)/i.test(file.name))
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, 5)
    .map((file) => ({ path: file.path, size: file.size }))
  const folders = new Set(files.map((file) => file.path.split('/')[0]).filter(Boolean))
  const maxDepth = files.reduce((max, file) => Math.max(max, Math.max(0, file.path.split('/').length - 1)), 0)
  return { codeSplit, largest, maxDepth, topFolders: folders.size }
}
