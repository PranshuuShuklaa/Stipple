import { Suspense } from 'react'
import type { Metadata } from 'next'

import { getScanCached } from '@/server/cache'
import { ReportError } from '@/features/report/report-error'
import { ReportView } from '@/features/report/report-view'
import styles from './page.module.css'

/**
 * The report page. The server component calls src/server directly
 * (getScanCached — the same cache the /api/repo route and phases 6 use),
 * so no fetch round-trip happens and errors travel as data through the
 * designed union. The shell prerenders; the scan streams in.
 */

interface ReportParams {
  params: Promise<{ owner: string; repo: string }>
}

function ogImagePath(owner: string, repo: string): string {
  return `/api/og/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

export async function generateMetadata({ params }: ReportParams): Promise<Metadata> {
  const { owner, repo } = await params
  const result = await getScanCached(owner, repo)
  const ogImage = ogImagePath(owner, repo)
  if (!result.ok) {
    return {
      title: `${owner}/${repo} — Stipple`,
      openGraph: { title: `${owner}/${repo} — Stipple`, images: [{ url: ogImage, width: 1200, height: 630 }] },
      twitter: { card: 'summary_large_image' },
    }
  }
  const scan = result.scan
  const description =
    scan.description !== ''
      ? scan.description
      : `Files, languages, activity and folders for github.com/${owner}/${repo}, drawn as a field of dots.`
  const title = `${owner}/${repo} — Stipple`
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image' },
  }
}

export default function ReportPage({ params }: ReportParams) {
  return (
    <div className={styles.wrap}>
      <div className="shell">
        <Suspense
          fallback={
            <p className={styles.pending} role="status">
              Loading the report…
            </p>
          }
        >
          <ReportContent params={params} />
        </Suspense>
      </div>
    </div>
  )
}

async function ReportContent({ params }: ReportParams) {
  const { owner, repo } = await params
  const result = await getScanCached(owner, repo)
  if (!result.ok) {
    return <ReportError owner={owner} repo={repo} error={result.error} />
  }
  return <ReportView scan={result.scan} />
}
