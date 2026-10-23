import Link from 'next/link'
import type { DesignedErrorRecord } from '@/server/cache'
import styles from './report.module.css'

/**
 * Renders a designed scan error in plain copy. The message travels as
 * data from the cache layer (designed codes never throw across it), so
 * the only job here is the frame: a short title, the message and one
 * next action.
 */
const TITLE: Record<DesignedErrorRecord['code'], string> = {
  not_found: 'No report for this repo.',
  private_or_missing: 'This repo is not reachable.',
  empty_repo: 'Nothing to scan yet.',
  rate_limited: 'The shared GitHub limit is used up.',
  upstream: 'GitHub is having trouble.',
  invalid_input: 'That address does not look right.',
}

export function ReportError({ owner, repo, error }: { owner: string; repo: string; error: DesignedErrorRecord }) {
  return (
    <section className={styles.errorWrap} role="main" aria-label={`Error scanning ${owner}/${repo}`}>
      <h1 className={`type-section ${styles.errorTitle}`}>
        {TITLE[error.code] ?? 'GitHub is having trouble.'}
      </h1>
      <p className={styles.errorBody}>
        github.com/{owner}/{repo}: {error.message}
      </p>
      <Link href="/" className={styles.errorAction}>
        Scan a different repo
      </Link>
    </section>
  )
}
