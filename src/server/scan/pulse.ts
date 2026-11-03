import type { RawCommitActivityWeek } from '@/server/github/raw-types'
import type { ScanPulse } from '@/lib/types/scan'

const DAY = 86_400_000

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

export function pulseFromRaw(
  weeks: RawCommitActivityWeek[],
  pushedAt: string | null,
  now: Date,
): ScanPulse {
  const sorted = weeks.filter((week) => week.week > 0).slice().sort((a, b) => a.week - b.week).slice(-52)
  const days = sorted.flatMap((week) =>
    Array.from({ length: 7 }, (_, index) => ({
      date: iso(week.week + index * 86_400),
      commits: Math.max(0, Math.floor(week.days[index] ?? 0)),
    })),
  )
  const activeWeeks = sorted.filter((week) => week.total > 0).length
  const totalCommits = sorted.reduce((sum, week) => sum + Math.max(0, Math.floor(week.total)), 0)
  const top = sorted
    .map((week) => Math.max(0, Math.floor(week.total)))
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((sum, value) => sum + value, 0)
  const lastDay = days.filter((day) => day.commits > 0).at(-1)?.date ?? (pushedAt ? pushedAt.slice(0, 10) : null)
  const age = lastDay ? Math.max(0, Math.floor((now.getTime() - Date.parse(`${lastDay}T00:00:00Z`)) / DAY)) : null
  const status = age === null || age > 180 ? 'dormant' : age <= 30 ? 'active' : 'quiet'
  const topWeeksShare = totalCommits ? top / totalCommits : 0
  let longestStreakWeeks = 0
  let currentStreak = 0
  for (const week of sorted) {
    currentStreak = week.total > 0 ? currentStreak + 1 : 0
    longestStreakWeeks = Math.max(longestStreakWeeks, currentStreak)
  }
  const weekdayCounts = new Array<number>(7).fill(0)
  for (const day of days) weekdayCounts[new Date(`${day.date}T00:00:00Z`).getUTCDay()] += day.commits
  let busiestWeekday = 0
  for (let index = 1; index < weekdayCounts.length; index++) {
    if (weekdayCounts[index] > weekdayCounts[busiestWeekday]) busiestWeekday = index
  }
  return {
    days,
    lastCommit: lastDay,
    activeWeeks,
    longestStreakWeeks,
    busiestWeekday,
    totalCommits,
    topWeeksShare,
    status,
    pattern: topWeeksShare >= 0.6 ? 'bursty' : activeWeeks >= 21 && topWeeksShare < 0.4 ? 'steady' : 'occasional',
  }
}
