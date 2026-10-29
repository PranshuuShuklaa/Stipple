import Link from 'next/link'
import type { DesignedErrorRecord } from '@/server/cache'
import { rateLimitResetCopy, scanErrorRetries, scanErrorTitle } from '@/lib/scan-error-copy'
import styles from './report.module.css'

/**
 * Renders a designed scan error in plain copy. The message travels as
 * data from the cache layer (designed codes never throw across it), so
 * the only job here is the frame: a short title, the message, one next
 * action — and the reset time in human copy when the limit is used up.
 */
export function ReportError({ owner, repo, error }: { owner: string; repo: string; error: DesignedErrorRecord }) {
  const resetNote = error.resetAt ? rateLimitResetCopy(error.resetAt) : ''
  return (
    <section className={styles.errorWrap} aria-labelledby="report-error-title">
      <h1 id="report-error-title" className={`type-section ${styles.errorTitle}`}>
        {scanErrorTitle(error.code)}
      </h1>
      <p className={styles.errorBody}>
        github.com/{owner}/{repo}: {error.message}
      </p>
      {resetNote !== '' && <p className={styles.errorNote}>{resetNote}</p>}
      <div className={styles.errorActions}>
        {scanErrorRetries(error.code) && (
          <Link href={`/scan/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`} className={styles.errorPrimary}>
            Try again
          </Link>
        )}
        <Link href="/" className={styles.errorAction}>
          Scan a different repo
        </Link>
      </div>
    </section>
  )
}
