import { notFound } from 'next/navigation'

import { createScanFixture } from '@/lib/demo/scan-fixture'
import type { Scan } from '@/lib/types/scan'
import { ReportView } from '@/features/report/report-view'

export const metadata = {
  title: 'Report fixtures — Stipple',
  robots: { index: false, follow: false },
}

const VARIANTS = ['archived', 'no-languages', 'one-file', 'monorepo', 'truncated'] as const
type Variant = (typeof VARIANTS)[number]

function fixture(variant: Variant): Scan {
  const scan = createScanFixture('stipple/stipple')
  switch (variant) {
    case 'archived':
      return { ...scan, archived: true }
    case 'no-languages':
      return {
        ...scan,
        files: scan.files.map((file) => ({ ...file, language: null })),
        languages: [],
      }
    case 'one-file':
      return {
        ...scan,
        files: [
          {
            path: 'README.md',
            name: 'README.md',
            size: 1840,
            language: 'Markdown',
            folder: '(root)',
          },
        ],
        languages: [{ name: 'Markdown', bytes: 1840 }],
      }
    case 'monorepo': {
      const folders = ['apps', 'packages', 'services', 'docs', 'infra', 'tools', 'scripts']
      return {
        ...scan,
        files: folders.flatMap((folder, folderIndex) =>
          Array.from({ length: 40 - folderIndex * 4 }, (_, i) => ({
            path: `${folder}/file-${i}.ts`,
            name: `file-${i}.ts`,
            size: 1200 + i,
            language: i % 2 === 0 ? 'TypeScript' : 'JavaScript',
            folder,
          })),
        ),
      }
    }
    case 'truncated':
      return { ...scan, flags: { ...scan.flags, truncated: true } }
  }
}

interface DevReportParams {
  searchParams: Promise<{ variant?: string }>
}

export default async function DevReportPage({ searchParams }: DevReportParams) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  const { variant } = await searchParams
  if (!variant || !VARIANTS.includes(variant as Variant)) {
    notFound()
  }

  return (
    <div className="shell" style={{ paddingBlock: '32px' }}>
      <ReportView scan={fixture(variant as Variant)} />
    </div>
  )
}
