import { useAppStore } from '@/store/appStore'

export default function RefreshAllProgress() {
  const progress = useAppStore((s) => s.refreshProgress)
  const isRefreshingAll = useAppStore((s) => s.isRefreshingAll)

  if (!isRefreshingAll && !progress?.done) return null

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div data-component="RefreshAllProgress" className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-fg-muted">
          {progress?.done
            ? `完成：${progress.succeeded} 成功，${progress.failed} 失败`
            : `查询中 ${progress?.current ?? 0}/${progress?.total ?? 0}${progress?.currentName ? ` — ${progress.currentName}` : ''}`
          }
        </span>
        <span className="text-fg-subtle tabular-nums">{pct}%</span>
      </div>
      <div className="w-full h-0.5 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
