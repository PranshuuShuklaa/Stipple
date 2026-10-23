import { Suspense } from 'react'
import type { Metadata } from 'next'

import { ScanScreen } from '@/features/scan-screen/scan-screen'
import styles from './scan.module.css'

/**
 * The scan screen page. The shell prerenders with a static pending
 * line inside Suspense; the per-owner/repo slice resolves the params
 * and mounts the client screen (the same pattern the report page
 * uses). No invented progress in the fallback: params resolve too
 * fast for a placeholder field to matter.
 */

export const metadata: Metadata = {
  title: 'Scan — Stipple',
}

interface ScanParams {
  params: Promise<{ owner: string; repo: string }>
}

export default function ScanPage({ params }: ScanParams) {
  return (
    <div className={styles.wrap}>
      <Suspense fallback={<p className={`type-section ${styles.pending}`}>Opening the scan…</p>}>
        <ScanContent params={params} />
      </Suspense>
    </div>
  )
}

async function ScanContent({ params }: ScanParams) {
  const { owner, repo } = await params
  return <ScanScreen owner={owner} repo={repo} />
}
