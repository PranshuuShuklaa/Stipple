import type { Scan } from '@/lib/types/scan'
import { formatCount } from './step-headlines'

function folderCounts(scan: Scan): { folder: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const file of scan.files) {
    const folder = file.folder || '(root)'
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder))
}

export function StageDataTable({ scan }: { scan: Scan }) {
  const folders = folderCounts(scan)
  const totalFiles = scan.files.length || 1

  return (
    <section className="visually-hidden" aria-labelledby="stage-data-heading">
      <h2 id="stage-data-heading">Repository data behind the dot field</h2>
      {scan.languages.length > 0 && (
        <table>
          <caption>Languages</caption>
          <thead>
            <tr>
              <th scope="col">Language</th>
              <th scope="col">Files</th>
              <th scope="col">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {scan.languages.map((language) => {
              const count = scan.files.filter((file) => file.language === language.name).length
              return (
                <tr key={language.name}>
                  <th scope="row">{language.name}</th>
                  <td>{formatCount(count)}</td>
                  <td>{formatCount(language.bytes)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {folders.length > 0 && (
        <table>
          <caption>Folders</caption>
          <thead>
            <tr>
              <th scope="col">Folder</th>
              <th scope="col">Files</th>
            </tr>
          </thead>
          <tbody>
            {folders.map((folder) => (
              <tr key={folder.folder}>
                <th scope="row">{folder.folder}</th>
                <td>
                  {formatCount(folder.count)} ({Math.round((folder.count / totalFiles) * 100)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {scan.activity.length > 0 && (
        <table>
          <caption>Commits per week</caption>
          <thead>
            <tr>
              <th scope="col">Week starting</th>
              <th scope="col">Commits</th>
            </tr>
          </thead>
          <tbody>
            {scan.activity.map((week) => (
              <tr key={week.week}>
                <th scope="row">{week.week}</th>
                <td>{formatCount(week.commits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
