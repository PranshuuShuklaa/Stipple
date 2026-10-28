import type { Scan } from '@/lib/types/scan'
import { formatCount } from '@/features/report/step-headlines'
import { Story } from '@/features/report/story'
import { StageDataTable } from '@/features/report/stage-data-table'
import { HealthSection } from '@/features/report/health-section'
import { NumbersSection } from '@/features/report/numbers-section'
import { DependenciesSection } from '@/features/report/dependencies-section'
import { ShareSection } from '@/features/report/share-section'
import reportStyles from '@/features/report/report.module.css'
import styles from '@/app/r/[owner]/[repo]/page.module.css'

/** The report body, shared by the real page and the dev fixture route. */
export function ReportView({ scan }: { scan: Scan }) {
  return (
    <>
      <header className={styles.head}>
        <h1 className={`type-display ${styles.title}`}>{scan.name}.</h1>
        <p className={`type-small tabular ${styles.meta}`}>
          {scan.owner}/{scan.name} · {scan.defaultBranch} · {formatCount(scan.stars)} stars
        </p>
        {scan.description !== '' && <p className={styles.description}>{scan.description}</p>}
        {scan.archived && (
          <p className={styles.note}>
            This repo is archived. Stipple scanned the last state it was left in.
          </p>
        )}
        {scan.flags.truncated && (
          <p className={styles.note}>
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
