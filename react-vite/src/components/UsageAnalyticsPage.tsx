import { RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import TokenUsageCard from './TokenUsageCard'
import UsageHeatmap from './UsageHeatmap'

export default function UsageAnalyticsPage() {
  const usageHistory = useAppStore((state) => state.usageHistory)
  const tokenUsage = useAppStore((state) => state.tokenUsage)
  const isRefreshingTokenUsage = useAppStore((state) => state.isRefreshingTokenUsage)
  const isRefreshingAll = useAppStore((state) => state.isRefreshingAll)
  const refreshTokenUsage = useAppStore((state) => state.refreshTokenUsage)
  const refreshAllUsage = useAppStore((state) => state.refreshAllUsage)

  const handleRefresh = () => {
    void refreshTokenUsage()
    void refreshAllUsage(true)
  }

  return (
    <main data-component="UsageAnalyticsPage" className="flex-1 overflow-y-auto min-w-0 bg-bg">
      <div className="p-6 max-w-[980px] mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4 pb-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-primary font-medium">Analytics</p>
            <h1 className="text-2xl font-semibold text-fg font-serif mt-1">用量分析</h1>
            <p className="text-xs text-fg-subtle mt-1">查看每日使用趋势与本机 Codex Token 统计。</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshingTokenUsage || isRefreshingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary-muted hover:bg-primary/15 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', (isRefreshingTokenUsage || isRefreshingAll) && 'animate-spin')} />
            刷新数据
          </button>
        </div>

        <UsageHeatmap history={usageHistory} tokenDays={tokenUsage?.days ?? []} />
        <TokenUsageCard summary={tokenUsage} onRefresh={refreshTokenUsage} isRefreshing={isRefreshingTokenUsage} />
      </div>
    </main>
  )
}
