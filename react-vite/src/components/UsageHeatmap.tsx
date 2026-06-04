import type { DailyUsageEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  history: DailyUsageEntry[]
}

interface HeatmapDay {
  date: string
  entry?: DailyUsageEntry
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildDays(history: DailyUsageEntry[], weeks = 26): HeatmapDay[][] {
  const historyByDate = new Map(history.map((entry) => [entry.date, entry]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(today)
  start.setDate(today.getDate() - (weeks * 7 - 1))
  start.setDate(start.getDate() - start.getDay())

  const columns: HeatmapDay[][] = []
  for (let week = 0; week < weeks; week += 1) {
    const column: HeatmapDay[] = []
    for (let day = 0; day < 7; day += 1) {
      const current = new Date(start)
      current.setDate(start.getDate() + week * 7 + day)
      const key = toDateKey(current)
      column.push({ date: key, entry: historyByDate.get(key) })
    }
    columns.push(column)
  }
  return columns
}

function levelForEntry(entry?: DailyUsageEntry): number {
  if (!entry || entry.total <= 0) return 0
  if (entry.total >= 240) return 4
  if (entry.total >= 150) return 3
  if (entry.total >= 70) return 2
  return 1
}

function titleForDay(day: HeatmapDay): string {
  if (!day.entry) return `${day.date}: 无记录`
  const accounts = Object.entries(day.entry.accounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => `${name} ${Math.round(value)}%`)
    .join(', ')
  return `${day.date}: 总量 ${Math.round(day.entry.total)}，账号 ${day.entry.samples}${accounts ? ` (${accounts})` : ''}`
}

function cellClass(level: number): string {
  switch (level) {
    case 1:
      return 'bg-primary/20 border-primary/20'
    case 2:
      return 'bg-primary/40 border-primary/30'
    case 3:
      return 'bg-primary/65 border-primary/40'
    case 4:
      return 'bg-primary border-primary'
    default:
      return 'bg-bg-elevated border-line-subtle'
  }
}

export default function UsageHeatmap({ history }: Props) {
  const columns = buildDays(history)
  const recordedDays = history.filter((entry) => entry.total > 0).length
  const maxTotal = history.reduce((max, entry) => Math.max(max, entry.total), 0)
  const averageTotal = recordedDays > 0
    ? Math.round(history.reduce((sum, entry) => sum + entry.total, 0) / recordedDays)
    : 0

  return (
    <section data-component="UsageHeatmap" className="rounded-xl border border-line bg-bg-surface card-ring p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-fg font-serif">每日用量墙</h2>
          <p className="text-[11px] text-fg-subtle mt-0.5">
            基于本机刷新记录，颜色越深代表当天使用量越高。
          </p>
        </div>
        <div className="text-right text-[11px] text-fg-subtle shrink-0">
          <p><span className="text-fg font-medium">{recordedDays}</span> 天有记录</p>
          <p>峰值 <span className="text-fg font-medium">{Math.round(maxTotal)}</span> · 均值 <span className="text-fg font-medium">{averageTotal}</span></p>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-max">
          {columns.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {week.map((day) => {
                const level = levelForEntry(day.entry)
                return (
                  <div
                    key={day.date}
                    title={titleForDay(day)}
                    className={cn(
                      'w-3 h-3 rounded-[3px] border transition-transform hover:scale-125 hover:ring-2 hover:ring-primary/30',
                      cellClass(level)
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-fg-subtle">近 26 周</span>
        <div className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={cn('w-3 h-3 rounded-[3px] border', cellClass(level))}
            />
          ))}
          <span>多</span>
        </div>
      </div>
    </section>
  )
}
