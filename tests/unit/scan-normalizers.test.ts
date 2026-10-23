import { describe, expect, it } from 'vitest'
import type {
  RawCommitActivityWeek,
  RawCommunityProfile,
  RawContributorStats,
  RawTreeEntry,
} from '@/server/github/raw-types'
import {
  ACTIVITY_WEEKS,
  activityFromRaw,
  commitsTotalFromRaw,
  contributorsFromRaw,
  createLanguageResolver,
  filesFromTree,
  healthFrom,
  languagesFromRaw,
  parseCargoToml,
  parseDependencies,
  parsePackageJson,
  parsePomXml,
  parseRequirementsTxt,
  unescapeXml,
} from '@/server/scan/normalizers'

function entry(path: string, type: RawTreeEntry['type'], size: number | null = null): RawTreeEntry {
  return { path, mode: '100644', type, sha: `sha-${path}`, size, url: '' }
}

describe('filesFromTree', () => {
  it('keeps blobs with folder, name and size, and assigns the language', () => {
    const files = filesFromTree(
      [
        entry('README.md', 'blob', 24),
        entry('src', 'tree'),
        entry('src/index.ts', 'blob', 100),
        entry('vendor/dependency', 'commit'),
      ],
      (fileName) => (fileName.endsWith('.ts') ? 'TypeScript' : 'Markdown'),
    )

    expect(files).toEqual([
      { path: 'README.md', name: 'README.md', size: 24, language: 'Markdown', folder: '(root)' },
      { path: 'src/index.ts', name: 'index.ts', size: 100, language: 'TypeScript', folder: 'src' },
    ])
  })

  it('maps a missing size to 0 and never invents a language', () => {
    const files = filesFromTree([entry('notes.txt', 'blob', null)], () => null)
    expect(files[0]).toMatchObject({ size: 0, language: null, folder: '(root)' })
  })
})

describe('createLanguageResolver', () => {
  const resolve = createLanguageResolver({ TypeScript: 900, JavaScript: 300 })

  it('maps common extensions to GitHub language names', () => {
    expect(resolve('src/app.ts')).toBe('TypeScript')
    expect(resolve('src/app.tsx')).toBe('TypeScript')
    expect(resolve('B.TS')).toBe('TypeScript')
    expect(resolve('main.jsx')).toBe('JavaScript')
  })

  it('returns null for unmapped extensions, missing languages and extension-less names', () => {
    expect(resolve('model.cob')).toBeNull()
    expect(resolve('program.rs')).toBeNull()
    expect(resolve('README')).toBeNull()
  })
})

describe('languagesFromRaw', () => {
  it('sorts by bytes descending, filters zero and negative rows, breaks ties by name', () => {
    expect(languagesFromRaw({ b: 5.9, a: 5.1, z: 0, y: -1 })).toEqual([
      { name: 'a', bytes: 5 },
      { name: 'b', bytes: 5 },
    ])
  })
})

describe('activityFromRaw', () => {
  it('keeps the last 16 weeks oldest first as ISO dates', () => {
    const weeks: RawCommitActivityWeek[] = Array.from({ length: 52 }, (_, index) => ({
      week: 1_700_000_000 + index * 604_800,
      total: index,
      days: [],
    }))

    const activity = activityFromRaw(weeks)

    expect(activity).toHaveLength(16)
    expect(activity[0]).toEqual({ commits: 36, week: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })
    expect(activity[ACTIVITY_WEEKS - 1]!.commits).toBe(51)
    for (let index = 1; index < activity.length; index++) {
      expect(activity[index]!.week > activity[index - 1]!.week).toBe(true)
    }
  })

  it('drops the epoch-0 filler week and clamps negative totals to 0', () => {
    const activity = activityFromRaw([
      { week: 0, total: 5, days: [] },
      { week: 1_700_000_000, total: 7, days: [] },
      { week: 1_700_000_000 + 604_800, total: -4, days: [] },
    ])

    expect(activity).toEqual([
      { week: expect.any(String), commits: 7 },
      { week: expect.any(String), commits: 0 },
    ])
  })
})

describe('contributorsFromRaw and commitsTotalFromRaw', () => {
  const members: RawContributorStats[] = [
    { author: { login: 'zeta' }, total: 3, weeks: [] },
    { author: null, total: 900, weeks: [] },
    { author: { login: 'alpha' }, total: 3, weeks: [] },
    { author: { login: 'beta' }, total: -10, weeks: [] },
  ]

  it('keeps named contributors strongest first and drops anonymous rows', () => {
    expect(contributorsFromRaw(members)).toEqual([
      { login: 'alpha', commits: 3 },
      { login: 'zeta', commits: 3 },
      { login: 'beta', commits: 0 },
    ])
  })

  it('sums the lifetime totals, anonymous rows included', () => {
    expect(commitsTotalFromRaw([
      { author: { login: 'zeta' }, total: 3, weeks: [] },
      { author: null, total: 9, weeks: [] },
      { author: { login: 'alpha' }, total: 3, weeks: [] },
    ])).toBe(15)
  })
})

describe('parsePackageJson', () => {
  it('reads production and optional dependencies, never devDependencies', () => {
    const text = JSON.stringify({
      dependencies: { 'zod': '3', 'rimraf': '6' },
      optionalDependencies: { 'fsevents': '2' },
      devDependencies: { typescript: '5' },
    })
    expect(parsePackageJson(text)).toEqual(['fsevents', 'rimraf', 'zod'])
  })

  it('returns an empty list for invalid JSON', () => {
    expect(parsePackageJson('not json')).toEqual([])
    expect(parsePackageJson('[1,2]')).toEqual([])
  })
})

describe('parseRequirementsTxt', () => {
  it('keeps package names, drops comments, options, links and markers', () => {
    const text = [
      '# a comment line',
      'django>=4.2',
      '',
      'pytest==8.0 ; python_version > "3.10"',
      '-e git+https://github.com/example/pkg#egg=pkg',
      'https://files.example.com/thing.whl',
      'Flask[async]',
    ].join('\n')

    expect(parseRequirementsTxt(text)).toEqual(['django', 'Flask', 'pytest'])
  })
})

describe('parseCargoToml', () => {
  it('reads only the [dependencies] section', () => {
    const text = [
      '[package]',
      'name = "demo"',
      '',
      '[dependencies]',
      'serde = "1"',
      'rand = { version = "0.8" } # pinned inline',
      '',
      '[dev-dependencies]',
      'tempfile = "3"',
    ].join('\n')

    expect(parseCargoToml(text)).toEqual(['rand', 'serde'])
  })
})

describe('parsePomXml', () => {
  it('reads groupId:artifactId pairs and skips incomplete blocks', () => {
    const text = [
      '<dependencies>',
      '  <dependency>',
      '    <groupId>com.google.guava</groupId>',
      '    <artifactId>guava</artifactId>',
      '  </dependency>',
      '  <dependency>',
      '    <groupId>only&#45;group</groupId>',
      '  </dependency>',
      '</dependencies>',
    ].join('\n')

    expect(parsePomXml(text)).toEqual(['com.google.guava:guava'])
  })

  it('unescapes XML entities inside coordinates', () => {
    expect(unescapeXml('a&amp;b&lt;c')).toBe('a&b<c')
    expect(parsePomXml('<dependency><groupId>a&amp;b</groupId><artifactId>x</artifactId></dependency>')).toEqual([
      'a&b:x',
    ])
  })
})

describe('parseDependencies', () => {
  it('dispatches on the file name and ignores unknown ones', () => {
    expect(parseDependencies('package.json', '{"dependencies":{"zod":"3"}}')).toEqual(['zod'])
    expect(parseDependencies('REQUIREMENTS.TXT', 'django>=4.2')).toEqual(['django'])
    expect(parseDependencies('cargo.toml', '[dependencies]\nserde = "1"')).toEqual(['serde'])
    expect(parseDependencies('pom.xml', '<dependency><groupId>g</groupId><artifactId>a</artifactId></dependency>')).toEqual(['g:a'])
    expect(parseDependencies('unknown.json', '{}')).toEqual([])
  })
})

describe('healthFrom', () => {
  const NOW = new Date('2026-10-20T00:00:00Z')
  const FULL_COMMUNITY: RawCommunityProfile = {
    health_percentage: 100,
    description: null,
    documentation: null,
    updated_at: '2026-10-01T00:00:00Z',
    files: {
      code_of_conduct: null,
      code_of_conduct_file: null,
      contributing: { key: 'contributing', name: null, url: null },
      license: null,
      readme: { key: 'readme', name: null, url: null },
      issue_template: null,
      pull_request_template: null,
    },
  }

  const ALL_SIGNALS = {
    paths: ['tests/helper.js', '.github/workflows/ci.yml'],
    pushedAtIso: '2026-10-15T00:00:00Z',
    repoLicense: { key: 'mit', name: 'MIT License', spdx_id: 'MIT' },
    community: FULL_COMMUNITY,
    now: NOW,
  }

  it('passes all six checks with clean signals and names them in order', () => {
    const health = healthFrom(ALL_SIGNALS)

    expect(health.score).toBe(100)
    expect(health.checks.map((check) => check.name)).toEqual([
      'README',
      'License',
      'Tests',
      'CI workflow',
      'Contributing guide',
      'Commit in the last 30 days',
    ])
    expect(health.checks.every((check) => check.passed)).toBe(true)
  })

  it('falls back to root files when the community profile is missing', () => {
    const health = healthFrom({
      paths: ['README.md', 'CONTRIBUTING.md', 'src/app.spec.ts'],
      pushedAtIso: '2026-10-15T00:00:00Z',
      repoLicense: null,
      community: null,
      now: NOW,
    })

    expect(health.checks).toEqual([
      { name: 'README', passed: true },
      { name: 'License', passed: false },
      { name: 'Tests', passed: true },
      { name: 'CI workflow', passed: false },
      { name: 'Contributing guide', passed: true },
      { name: 'Commit in the last 30 days', passed: true },
    ])
    expect(health.score).toBe(67)
  })

  it('fails the recency check at the 30-day boundary and for unusable dates', () => {
    const exactlyThirty = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyOneDays = new Date(NOW.getTime() - (30 * 24 * 60 * 60 * 1000 + 1000)).toISOString()

    expect(healthFrom({ ...ALL_SIGNALS, pushedAtIso: exactlyThirty }).checks[5]!.passed).toBe(true)
    expect(healthFrom({ ...ALL_SIGNALS, pushedAtIso: thirtyOneDays }).checks[5]!.passed).toBe(false)
    expect(healthFrom({ ...ALL_SIGNALS, pushedAtIso: null }).checks[5]!.passed).toBe(false)
    expect(healthFrom({ ...ALL_SIGNALS, pushedAtIso: 'not-a-date' }).checks[5]!.passed).toBe(false)
  })

  it('never rounds above the real share of passed checks', () => {
    const health = healthFrom({
      paths: [],
      pushedAtIso: '2026-10-15T00:00:00Z',
      repoLicense: null,
      community: FULL_COMMUNITY,
      now: NOW,
    })

    expect(health.score).toBe(50)
  })
})
