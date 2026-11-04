import type { Scan } from '@/lib/types/scan'
import styles from './report.module.css'
import structureStyles from './structure-view.module.css'

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function StructureView({ scan }: { scan: Scan }) {
  const structure = scan.structure
  if (!structure) return null
  const total = Object.values(structure.codeSplit).reduce((sum, value) => sum + value, 0) || 1
  return (
    <section className={styles.featureSection} aria-labelledby="structure-heading" data-q>
      <div className={structureStyles.breadcrumb} aria-label="Breadcrumb"><span>root</span></div>
      <div>
        <h2 id="structure-heading" className={`type-section ${styles.sectionHeadline}`}>Structure.</h2>
        <p className={styles.sectionBody}>Where the code lives, and which files carry the most weight.</p>
        <p className={styles.featureNote}>root / {structure.topFolders} folders · deepest folder {structure.maxDepth} levels down</p>
      </div>
      <div className={styles.structureGrid}>
        <div>
          <h3 className={styles.featureSubhead}>Clusters</h3>
          <div>
            {Object.entries(structure.codeSplit).map(([name]) => (
              <button key={name} type="button" className={structureStyles.cluster} aria-label={`${name} folder`}>{name}</button>
            ))}
            <button type="button" className={structureStyles.cluster} aria-label="Back">Back</button>
          </div>
          <h3 className={styles.featureSubhead}>Where the code lives</h3>
          <ul className={styles.splitList}>
            {Object.entries(structure.codeSplit).map(([name, count]) => (
              <li key={name}><span>{name}</span><strong>{Math.round(count / total * 100)}%</strong></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className={styles.featureSubhead}>Biggest files</h3>
          <ol className={styles.biggestFiles}>
            {structure.largest.map((file) => <li key={file.path}><span>{file.path}</span><strong>{bytes(file.size)}</strong></li>)}
          </ol>
        </div>
      </div>
      <div className={structureStyles.sidePanel}>
        <h3>Depth</h3><p>Deepest folder is {structure.maxDepth} levels down.</p>
      </div>
      <table className={structureStyles.hiddenTable}>
        <caption>Structure summary</caption>
        <thead><tr><th>Class</th><th>Percent</th></tr></thead>
        <tbody>
          {Object.entries(structure.codeSplit).map(([name, count]) => (
            <tr key={name}><th>{name}</th><td>{Math.round(count / total * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
