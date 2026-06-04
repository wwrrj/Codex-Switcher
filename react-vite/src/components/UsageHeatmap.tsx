import type { DailyUsageEntry, TokenUsageDay } from '@/lib/types'
import DataTooltip from './DataTooltip'

interface Props {
  history: DailyUsageEntry[]
  tokenDays: TokenUsageDay[]
}

interface HeatmapEntry {
  date: string
  value: number
  detail: string
  secondary: string
}

interface HeatmapDay {
  date: string
  entry?: HeatmapEntry
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function buildEntries(history: DailyUsageEntry[], tokenDays: TokenUsageDay[]): HeatmapEntry[] {
  if (tokenDays.some((day) => day.usage.totalTokens > 0)) {
    return tokenDays.map((day) => ({
      date: day.date,
      value: day.usage.totalTokens,
      detail: `${formatNumber(day.usage.totalTokens)} tokens`,
      secondary: `${day.turns} 次 token 事件`,
    }))
  }

  return history.map((entry) => ({
    date: entry.date,
    value: entry.total,
    detail: `用量指数 ${Math.round(entry.total)}`,
    secondary: `${entry.samples} 个账号`,
  }))
}

function buildDays(entries: HeatmapEntry[], weeks = 26): HeatmapDay[][] {
  const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]))
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
      column.push({ date: key, entry: entriesByDate.get(key) })
    }
    columns.push(column)
  }
  return columns
}

function levelForValue(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) return 0
  const ratio = value / maxValue
  if (ratio >= 0.75) return 4
  if (ratio >= 0.4) return 3
  if (ratio >= 0.15) return 2
  return 1
}

function cellStyle(level: number): React.CSSProperties {
  const alpha = [0.08, 0.24, 0.46, 0.7, 1][level]
  return {
    backgroundColor: `hsl(var(--primary) / ${alpha})`,
    borderColor: `hsl(var(--primary) / ${Math.max(alpha, 0.16)})`,
  }
}

export default function UsageHeatmap({ history, tokenDays }: Props) {
  const entries = buildEntries(history, tokenDays)
  const columns = buildDays(entries)
  const recordedDays = entries.filter((entry) => entry.value > 0).length
  const maxTotal = entries.reduce((max, entry) => Math.max(max, entry.value), 0)
  const averageTotal = recordedDays > 0
    ? Math.round(entries.reduce((sum, entry) => sum + entry.value, 0) / recordedDays)
    : 0
  const usesTokens = tokenDays.some((day) => day.usage.totalTokens > 0)

  return (
    <section data-component="UsageHeatmap" className="rounded-xl border border-line bg-bg-surface card-ring p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-fg font-serif">每日用量墙</h2>
          <p className="text-[11px] text-fg-subtle mt-0.5">
            {usesTokens ? '基于本机 Codex token 历史，颜色越深代表当天使用量越高。' : '基于本机刷新记录，颜色越深代表当天使用量越高。'}
          </p>
        </div>
        <div className="text-right text-[11px] text-fg-subtle shrink-0">
          <p><span className="text-fg font-medium">{recordedDays}</span> 天有记录</p>
          <p>峰值 <span className="text-fg font-medium">{formatNumber(Math.round(maxTotal))}</span> · 均值 <span className="text-fg font-medium">{formatNumber(averageTotal)}</span></p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 py-2">
        <div className="flex gap-1 min-w-max px-0.5">
          {columns.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-rows-7 gap-1">
              {week.map((day) => {
                const level = levelForValue(day.entry?.value ?? 0, maxTotal)
                return (
                  <DataTooltip
                    key={day.date}
                    className="w-3 h-3"
                    content={
                      <HeatmapTooltip
                        date={day.date}
                        detail={day.entry?.detail ?? '无使用记录'}
                        secondary={day.entry?.secondary ?? '当天尚未记录数据'}
                        level={level}
                      />
                    }
                  >
                    <div
                      style={cellStyle(level)}
                      className="w-3 h-3 rounded-[3px] border transition-[transform,box-shadow] hover:scale-110 hover:shadow-[inset_0_0_0_1px_hsl(var(--fg)/0.8),0_0_0_2px_hsl(var(--primary)/0.35)]"
                    />
                  </DataTooltip>
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
            <span key={level} style={cellStyle(level)} className="w-3 h-3 rounded-[3px] border" />
          ))}
          <span>多</span>
        </div>
      </div>
    </section>
  )
}

function HeatmapTooltip({ date, detail, secondary, level }: {
  date: string
  detail: string
  secondary: string
  level: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-fg">{date}</span>
        <span
          className="w-2.5 h-2.5 rounded-[3px] border shrink-0"
          style={cellStyle(level)}
        />
      </div>
      <div className="mt-2 pt-2 border-t border-line-subtle">
        <p className="text-sm font-semibold text-primary font-serif tabular-nums">{detail}</p>
        <p className="text-[10px] text-fg-subtle mt-0.5">{secondary}</p>
      </div>
    </div>
  )
}
