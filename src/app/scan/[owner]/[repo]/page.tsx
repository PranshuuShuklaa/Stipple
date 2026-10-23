import { Suspense } from 'react'
import Link from 'next/link'
import styles from './scan.module.css'

export const metadata = {
  title: 'Scan — Stipple',
}

export default function ScanPage({ params }: PageProps<'/scan/[owner]/[repo]'>) {
  return (
    <div className={styles.wrap}>
      <div className="shell">
        <Suspense fallback={<p className={styles.pending}>Reading repo name…</p>}>
          <ScanTitle params={params} />
        </Suspense>
      </div>
    </div>
  )
}

async function ScanTitle({
  params,
}: {
  params: PageProps<'/scan/[owner]/[repo]'>['params']
}) {
  const { owner, repo } = await params

  return (
    <>
      <h1 className="type-section">Scanning {owner}/{repo}</h1>
      <p className={styles.note}>
        The scan screen isn&apos;t ready yet — it arrives with the report and scan flow phase.{' '}
        <Link href="/" className={styles.back}>
          Back to the home page
        </Link>
      </p>
    </>
  )
}
