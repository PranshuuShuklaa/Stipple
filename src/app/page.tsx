import { DotStage } from '@/components/ui/dot-stage'
import { RepoForm } from '@/features/scan-form/repo-form'
import { createScanFixture } from '../../tests/fixtures/scan-fixture'
import styles from './home.module.css'

export default function HomePage() {
  const demoScan = createScanFixture('stipple/stipple')

  return (
    <div className="home">
      <div className="shell">
        <h1 className={`${styles.headline} type-display`}>
          Your repo, <br />one dot per file.
        </h1>
        <p className={styles.sentence}>
          Paste a public GitHub repo, then scroll through its story: files, languages, activity and folders.
        </p>
        <RepoForm />
      </div>

      <section className={`${styles.demo} shell`} aria-labelledby="demo-heading">
        <h2 id="demo-heading" className={`${styles.demoLabel} type-small`}>
          Demo — sample data, not a real repository
        </h2>
        <DotStage
          scan={demoScan}
          ariaLabel="Demo: a sample repository with 240 files, one dot per file"
        />
      </section>
    </div>
  )
}
