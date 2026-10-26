import { Suspense } from 'react'
import type { Metadata } from 'next'

import { getScanCached } from '@/server/cache'
import { formatCount } from '@/features/report/step-headlines'
import { Story } from '@/features/report/story'
import { StageDataTable } from '@/features/report/stage-data-table'
import { HealthSection } from '@/features/report/health-section'
import { NumbersSection } from '@/features/report/numbers-section'
import { DependenciesSection } from '@/features/report/dependencies-section'
import { ShareSection } from '@/features/report/share-section'
import { ReportError } from '@/features/report/report-error'
import reportStyles from '@/features/report/report.module.css'
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
        <Suspense fallback={<p className={styles.pending}>Loading the report…</p>}>
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
  const scan = result.scan

  return (
    <>
      <header className={styles.head}>
        <h1 className={`type-display ${styles.title}`}>{scan.name}.</h1>
        <p className={`type-small tabular ${styles.meta}`}>
          {scan.owner}/{scan.name} · {scan.defaultBranch} · {formatCount(scan.stars)} stars
        </p>
        {scan.description !== '' && <p className={styles.description}>{scan.description}</p>}
        {scan.flags.truncated && (
          <p className={styles.truncated}>
            GitHub cut the file list short for this repo. The dots scan what arrived.
          </p>
        )}
      </header>

      <Story scan={scan} />
      <StageDataTable scan={scan} />

      <div className={reportStyles.sections}>
        <HealthSection scan={scan} />
        <NumbersSection scan={scan} />
        <DependenciesSection scan={scan} />
        <ShareSection scan={scan} />
      </div>
    </>
  )
}
