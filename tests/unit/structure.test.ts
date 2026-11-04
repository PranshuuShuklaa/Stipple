import { describe, expect, it } from 'vitest'
import type { ScanFile } from '@/lib/types/scan'
import { classify, structureFromFiles } from '@/server/scan/structure'

const file = (path: string, language: string | null = null, size = 1): ScanFile => ({
  path,
  name: path.split('/').at(-1) ?? path,
  size,
  language,
  folder: path.includes('/') ? path.slice(0, path.indexOf('/')) : '(root)',
})

describe('classify', () => {
  it.each([
    ['src/tests/app.ts', 'TypeScript', 'tests'],
    ['src/app.spec.ts', 'TypeScript', 'tests'],
    ['docs/guide.txt', null, 'docs'],
    ['README.md', null, 'docs'],
    ['LICENSE', null, 'docs'],
    ['public/logo.svg', null, 'assets'],
    ['assets/font.woff2', null, 'assets'],
    ['.github/workflows/ci.yml', null, 'config'],
    ['package.json', null, 'config'],
    ['src/app.config.ts', 'TypeScript', 'config'],
    ['Cargo.lock', null, 'config'],
    ['src/app.ts', 'TypeScript', 'source'],
    ['no-extension', null, 'other'],
    ['深い/odd name.bin', null, 'other'],
  ] as const)('classifies %s as %s', (path, language, expected) => {
    expect(classify(path, language)).toBe(expected)
  })

  it('applies tests before docs and assets', () => {
    expect(classify('tests/README.md')).toBe('tests')
    expect(classify('public/tests/icon.svg')).toBe('tests')
  })
})

describe('structureFromFiles', () => {
  it('calculates all structure summaries and excludes lock/minified files from largest', () => {
    const files = [
      file('src/index.ts', 'TypeScript', 10),
      file('src/deep/app.ts', 'TypeScript', 20),
      file('tests/index.test.ts', 'TypeScript', 30),
      file('docs/guide.md', null, 40),
      file('package.json', null, 50),
      file('public/logo.svg', null, 60),
      file('bundle.min.js', 'JavaScript', 999),
      file('pnpm-lock.yaml', null, 998),
    ]
    expect(structureFromFiles(files)).toEqual({
      codeSplit: { source: 3, tests: 1, docs: 1, config: 2, assets: 1, other: 0 },
      largest: [
        { path: 'public/logo.svg', size: 60 },
        { path: 'package.json', size: 50 },
        { path: 'docs/guide.md', size: 40 },
        { path: 'tests/index.test.ts', size: 30 },
        { path: 'src/deep/app.ts', size: 20 },
      ],
      maxDepth: 2,
      topFolders: 4,
    })
  })

  it('handles an empty tree', () => {
    expect(structureFromFiles([])).toEqual({
      codeSplit: { source: 0, tests: 0, docs: 0, config: 0, assets: 0, other: 0 },
      largest: [],
      maxDepth: 0,
      topFolders: 0,
    })
  })
})
