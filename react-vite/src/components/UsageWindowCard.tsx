import { Clock, TrendingUp } from 'lucide-react'
import type { UsageWindow } from '@/lib/types'
import { cn, formatResetTime } from '@/lib/utils'

interface Props {
  windowData: UsageWindow | null
  label: string
}

export default function UsageWindowCard({ windowData, label }: Props) {
  if (!windowData) {
    return (
      <div className="rounded-xl border border-line bg-bg-surface p-4 card-ring">
        <h3 className="text-xs font-semibold text-fg mb-2 font-serif">{label}</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-3 rounded bg-bg-elevated animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const pct = windowData.percentage
  const remainingPct = pct != null ? Math.max(0, Math.round(100 - pct)) : null
  const remainingColors = remainingColor(remainingPct)

  return (
    <div
      data-component="UsageWindowCard"
      className={cn(
        'rounded-xl border bg-bg-surface p-4 card-ring',
        remainingPct != null && remainingPct <= 10 ? 'border-danger/30' : 'border-line'
      )}
    >
      {/* Header: label + remaining percentage */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-fg-subtle" strokeWidth={2} />
          <h3 className="text-sm font-semibold text-fg tracking-tight font-serif">{label}</h3>
        </div>
        {remainingPct != null && (
          <span className={cn('text-xl font-bold tabular-nums', remainingColors.text)}>
            {remainingPct}%
          </span>
        )}
      </div>

      {/* Progress bar — larger */}
      <div className="mb-3">
        <div className="w-full h-2 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              remainingColors.bar,
              remainingPct != null && remainingPct <= 10 && 'progress-pulse'
            )}
            style={{ width: remainingPct != null ? `${remainingPct}%` : '0%' }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-fg-subtle">
          <span>剩余比例</span>
          {pct != null && <span>已用 {Math.round(pct)}%</span>}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {windowData.used != null && windowData.limit != null && (
          <div>
            <p className="text-[10px] text-fg-subtle mb-0.5">已使用</p>
            <p className="text-sm font-semibold text-fg tabular-nums">
              {windowData.used}
              <span className="text-[11px] text-fg-subtle font-normal">/{windowData.limit}</span>
            </p>
          </div>
        )}
        {windowData.remaining != null && (
          <div>
            <p className="text-[10px] text-fg-subtle mb-0.5">剩余</p>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                remainingPct != null && remainingPct <= 10 ? 'text-danger' : remainingPct != null && remainingPct <= 30 ? 'text-warning' : 'text-fg'
              )}
            >
              {windowData.remaining}
            </p>
          </div>
        )}
        {remainingPct != null && (
          <div>
            <p className="text-[10px] text-fg-subtle mb-0.5">剩余比例</p>
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                remainingPct <= 10 ? 'text-danger' : remainingPct <= 30 ? 'text-warning' : 'text-success'
              )}
            >
              {remainingPct}%
            </p>
          </div>
        )}
      </div>

      {/* Reset time */}
      {windowData.resetAt && (
        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-line-subtle">
          <Clock className="w-3 h-3 text-fg-subtle" />
          <span className="text-[11px] text-fg-muted">重置时间</span>
          <span className="text-[11px] text-fg-subtle ml-auto tabular-nums">{formatResetTime(windowData.resetAt)}</span>
        </div>
      )}
    </div>
  )
}

function remainingColor(remainingPct: number | null): { bar: string; text: string } {
  if (remainingPct == null) return { bar: 'bg-fg-subtle/30', text: 'text-fg-muted' }
  if (remainingPct <= 10) return { bar: 'bg-danger', text: 'text-danger' }
  if (remainingPct <= 30) return { bar: 'bg-warning', text: 'text-warning' }
  return { bar: 'bg-success', text: 'text-success' }
}
