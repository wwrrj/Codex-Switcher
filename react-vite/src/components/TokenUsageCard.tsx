import { Activity, Database, Hash, RefreshCw } from 'lucide-react'
import type { TokenUsageDay, TokenUsageSummary } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'

interface Props {
  summary: TokenUsageSummary | null
  onRefresh: () => void
  isRefreshing: boolean
}

function formatNumber(value?: number): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0)
}

function compactNumber(value?: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value ?? 0)
}

function recentDays(days: TokenUsageDay[], count = 14): TokenUsageDay[] {
  const byDate = new Map(days.map((day) => [day.date, day]))
  const result: TokenUsageDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(today.getDate() - offset)
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    result.push(byDate.get(key) ?? {
      date: key,
      turns: 0,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
      },
    })
  }

  return result
}

function barLevel(day: TokenUsageDay, max: number): number {
  if (max <= 0 || day.usage.totalTokens <= 0) return 0
  return Math.max(3, (day.usage.totalTokens / max) * 100)
}

function localDateKey(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function TokenUsageCard({ summary, onRefresh, isRefreshing }: Props) {
  const days = recentDays(summary?.days ?? [])
  const maxDayTokens = days.reduce((max, day) => Math.max(max, day.usage.totalTokens), 0)
  const todayUsage = summary?.days.find((day) => day.date === localDateKey())?.usage ?? summary?.today

  return (
    <section data-component="TokenUsageCard" className="rounded-xl border border-line bg-bg-surface card-ring p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-fg font-serif">Token 计数</h2>
          <p className="text-[11px] text-fg-subtle mt-0.5">
            读取本机 Codex rollout，今日数据统计至当前时间并每分钟自动更新。
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-primary bg-primary-muted hover:bg-primary/15 transition-colors"
        >
          <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
          {isRefreshing ? '统计中' : '重新统计'}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-4">
        <TokenStat icon={<Hash className="w-3.5 h-3.5" />} label="总 Token" value={compactNumber(summary?.total.totalTokens)} hint={formatNumber(summary?.total.totalTokens)} />
        <TokenStat icon={<Activity className="w-3.5 h-3.5" />} label="今日 Token" value={compactNumber(todayUsage?.totalTokens)} hint={`${formatNumber(todayUsage?.totalTokens)} tokens`} />
        <TokenStat icon={<Database className="w-3.5 h-3.5" />} label="会话文件" value={formatNumber(summary?.sessionsScanned)} hint={`${formatNumber(summary?.tokenEvents)} 次事件`} />
        <TokenStat icon={<Hash className="w-3.5 h-3.5" />} label="推理输出" value={compactNumber(summary?.total.reasoningOutputTokens)} hint={`${formatNumber(summary?.total.reasoningOutputTokens)} tokens`} />
      </div>

      <div className="mt-4 rounded-lg border border-line-subtle bg-bg-elevated/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-fg-subtle">近 14 天 token</span>
          <div className="text-right text-[10px] text-fg-subtle">
            <span>最高 {compactNumber(maxDayTokens)}</span>
            <span className="mx-1">·</span>
            <span>{summary ? `统计至 ${formatDate(summary.fetchedAt)}` : '尚未统计'}</span>
          </div>
        </div>
        <div className="flex gap-1.5">
          {days.length === 0 ? (
            <div className="flex-1 text-center text-xs text-fg-subtle">暂无 token 记录</div>
          ) : (
            days.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="w-full h-16 flex items-end">
                  <div
                    title={`${day.date}: ${formatNumber(day.usage.totalTokens)} tokens, ${day.turns} turns`}
                    className={cn(
                      'w-full rounded-t-sm border transition-[height] duration-300',
                      day.usage.totalTokens > 0
                        ? 'bg-primary/70 border-primary/30'
                        : 'bg-bg-hover/50 border-line-subtle',
                      day.usage.totalTokens === maxDayTokens && maxDayTokens > 0 && 'bg-primary'
                    )}
                    style={{ height: `${barLevel(day, maxDayTokens)}%` }}
                  />
                </div>
                <span className="text-[9px] text-fg-subtle tabular-nums">
                  {day.date.slice(5).replace('-', '/')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {summary?.warning && (
        <p className="text-[10px] text-warning mt-2">{summary.warning}</p>
      )}
    </section>
  )
}

function TokenStat({ icon, label, value, hint }: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-elevated/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-primary">{icon}</span>
        <span className="text-[10px] text-fg-subtle">{label}</span>
      </div>
      <div className="text-lg font-semibold text-fg font-serif tabular-nums leading-tight">{value}</div>
      <p className="text-[9px] text-fg-subtle truncate" title={hint}>{hint}</p>
    </div>
  )
}
