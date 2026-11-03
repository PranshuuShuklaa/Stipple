'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'
import type { Scan } from '@/lib/types/scan'
import styles from './report.module.css'

export function PulseView({ scan }: { scan: Scan }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [focused, setFocused] = useState(0)
  const days = useMemo(() => scan.pulse?.days ?? [], [scan.pulse])
  const weeks = useMemo(() => Array.from({ length: 52 }, (_, week) => days.slice(week * 7, week * 7 + 7)), [days])
  const moveFocus = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!days.length) return
    let next = index
    if (event.key === 'ArrowRight') next = Math.min(days.length - 1, index + 7)
    if (event.key === 'ArrowLeft') next = Math.max(0, index - 7)
    if (event.key === 'ArrowDown') next = Math.min(days.length - 1, index + 1)
    if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
    if (next === index) return
    event.preventDefault()
    setFocused(next)
    setSelected(next)
    document.querySelector<HTMLButtonElement>(`[data-pulse-index="${next}"]`)?.focus()
  }
  return (
    <section className={styles.featureSection} aria-labelledby="pulse-heading" data-q>
      <div>
        <h2 id="pulse-heading" className={`type-section ${styles.sectionHeadline}`}>Pulse.</h2>
        <p className={styles.sectionBody}>A year of daily commits, with the latest activity marked in the field.</p>
        <p className={styles.featureNote}>{scan.pulse ? `${scan.pulse.activeWeeks} active weeks · ${scan.pulse.pattern} pattern` : 'No activity data yet'}</p>
      </div>
      <div className={styles.pulseCalendar} role="group" aria-label="Commit activity by day">
        {weeks.map((week, weekIndex) => (
          <div className={styles.pulseWeek} key={weekIndex}>
            {week.map((day, dayIndex) => (
              <button
                type="button"
                key={day.date}
                className={styles.pulseDot}
                data-level={Math.min(4, day.commits > 10 ? 4 : day.commits > 5 ? 3 : day.commits > 2 ? 2 : day.commits > 0 ? 1 : 0)}
                aria-label={`${day.date}: ${day.commits} commits`}
                data-pulse-index={weekIndex * 7 + dayIndex}
                tabIndex={focused === weekIndex * 7 + dayIndex ? 0 : -1}
                onFocus={() => setSelected(weekIndex * 7 + dayIndex)}
                onMouseEnter={() => setSelected(weekIndex * 7 + dayIndex)}
                onKeyDown={(event) => moveFocus(weekIndex * 7 + dayIndex, event)}
              />
            ))}
          </div>
        ))}
        {selected !== null && days[selected] && <p className={styles.pulseTooltip}>{days[selected].date}: {days[selected].commits} commits</p>}
      </div>
      <table className="visually-hidden">
        <caption>Weekly commit totals</caption>
        <thead><tr><th scope="col">Week</th><th scope="col">Commits</th></tr></thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}><th scope="row">{week[0]?.date ?? `Week ${index + 1}`}</th><td>{week.reduce((sum, day) => sum + day.commits, 0)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
